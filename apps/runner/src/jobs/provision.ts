import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile, cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { createConnection } from 'node:net';
import { execFileSync } from 'node:child_process';
import type { BlueprintManifest, PlanSummary, RunStep } from '@veritut/types';
import { api, connection, fetchCredentials, finish, log, mask, runnerKey, step } from './context.js';
import { unseal } from '../lib/unseal.js';

/**
 * Provizyon boru hattı (plan §3.3): validate → unseal → plan → [awaiting_approval] → apply → configure → verify → register → handoff.
 * - Çalışma alanı: WORK_DIR/<workloadId> (kalıcı volume; state pg backend'de — D11).
 * - Devamlılık: API'deki run_steps okunur; `succeeded` adımlar atlanır (runner çökse kaldığı yerden).
 * - İş yükü kilidi: Redis SET NX (aynı iş yükünde eşzamanlı iki run yok).
 * - Sırlar yalnız alt süreç env'inde; diske .tfvars olarak yazılan yalnız düz girdiler + boyut değişkenleri.
 */
const WORK_DIR = process.env['WORK_DIR'] ?? '/var/lib/veritut/work';
const BLUEPRINTS_DIR = process.env['BLUEPRINTS_DIR'] ?? '/app/infra/blueprints';
const TFSTATE_URL = process.env['TFSTATE_DATABASE_URL'] ?? '';
const TF_ENC_PASSPHRASE = process.env['TFSTATE_ENC_PASSPHRASE'] ?? '';

export interface ProvisionPayload {
  runId: string;
  kind: 'provision' | 'resize' | 'destroy' | 'drift-plan' | 'upgrade';
  workloadId: string;
  tenantId?: string | null;
  providerAccountId?: string | null;
  blueprint: string;
  version: string;
  tenantSlug: string;
  workloadSlug: string;
  region: string;
  size: string;
  sizeVars: Record<string, string | number | boolean>;
  residency: string;
  provider: string;
  previousSize?: string;
}

interface StepState { step: string; status: string }

function sh(cmd: string, args: string[], opts: { cwd: string; env: Record<string, string>; onLine: (l: string) => Promise<void>; timeoutMs?: number }): Promise<{ code: number; out: string; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let stdout = '';
    let rest = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    const feed = (chunk: Buffer) => {
      const s = rest + chunk.toString('utf8');
      const lines = s.split('\n');
      rest = lines.pop() ?? '';
      for (const l of lines) { out += l + '\n'; if (l.trim()) void opts.onLine(l); }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    const t = opts.timeoutMs ? setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs) : null;
    child.on('close', (code) => { if (t) clearTimeout(t); if (rest.trim()) { out += rest; void opts.onLine(rest); } resolve({ code: code ?? 1, out, stdout }); });
  });
}

/** tofu plan -json → PlanSummary */
export function parsePlanJson(jsonl: string): PlanSummary {
  const s: PlanSummary = { add: 0, change: 0, destroy: 0, replace: 0, resources: [] };
  for (const line of jsonl.split('\n')) {
    let j: { type?: string; change?: { resource?: { addr?: string }; action?: string }; changes?: { add: number; change: number; remove: number } };
    try { j = JSON.parse(line); } catch { continue; }
    if (j.type === 'planned_change' && j.change?.resource?.addr) {
      const a = j.change.action ?? 'no-op';
      const action = a === 'create' ? 'create' : a === 'update' ? 'update' : a === 'delete' ? 'delete' : a === 'replace' ? 'replace' : a === 'read' ? 'read' : 'no-op';
      s.resources.push({ address: j.change.resource.addr, action });
      if (action === 'create') s.add++; else if (action === 'update') s.change++; else if (action === 'delete') s.destroy++; else if (action === 'replace') s.replace++;
    }
  }
  return s;
}

/** Runner SSH anahtar çifti (Ansible + hcloud_ssh_key.runner): WORK_DIR/.ssh altında; yoksa üretilir. */
async function runnerSshKey(): Promise<{ privatePath: string; publicKey: string }> {
  const dir = path.join(WORK_DIR, '.ssh');
  const priv = process.env['RUNNER_SSH_KEY'] || path.join(dir, 'id_ed25519');
  const pub = `${priv}.pub`;
  const exists = await stat(pub).then(() => true).catch(() => false);
  if (!exists) {
    await mkdir(path.dirname(priv), { recursive: true, mode: 0o700 });
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-q', '-C', 'veritut-runner', '-f', priv]);
  }
  return { privatePath: priv, publicKey: (await readFile(pub, 'utf8')).trim() };
}

function tfEnv(providerCreds: Record<string, string> | null, workloadId: string, runnerPubKey: string): Record<string, string> {
  const env: Record<string, string> = { TF_IN_AUTOMATION: '1', TF_INPUT: '0', NO_COLOR: '1', TF_PLUGIN_CACHE_DIR: path.join(WORK_DIR, '.plugin-cache'), TF_VAR_runner_ssh_public_key: runnerPubKey };
  // pg backend + state şifreleme (D11) — backend config CLI ile geçer, dosyaya yazılmaz.
  if (TFSTATE_URL) env['PG_CONN_STR'] = TFSTATE_URL;
  if (TF_ENC_PASSPHRASE) env['TF_ENCRYPTION'] = JSON.stringify({ key_provider: { pbkdf2: { main: { passphrase: TF_ENC_PASSPHRASE } } }, method: { aes_gcm: { main: { keys: '${key_provider.pbkdf2.main}' } } }, state: { method: '${method.aes_gcm.main}', enforced: true } });
  if (providerCreds) {
    // Driver adına göre bilinen env adları; bilinmeyen anahtarlar TF_VAR_ olarak geçer.
    if (providerCreds['token'] && !providerCreds['HCLOUD_TOKEN']) env['HCLOUD_TOKEN'] = providerCreds['token'];
    for (const [k, v] of Object.entries(providerCreds)) env[/^[A-Z0-9_]+$/.test(k) ? k : `TF_VAR_${k}`] = v;
  }
  env['TF_VAR_workload_id'] = workloadId;
  return env;
}

/** İş yükü kilidi: aynı run yeniden alınıyorsa (çökme sonrası devam) kilit kendisine aittir → geçer. */
async function acquireLock(workloadId: string, runId: string): Promise<boolean> {
  const key = `lock:workload:${workloadId}`;
  const r = await connection.set(key, runId, 'EX', 60 * 60, 'NX');
  if (r === 'OK') return true;
  const holder = await connection.get(key);
  if (holder === runId) { await connection.expire(key, 60 * 60); return true; }
  return false;
}
async function releaseLock(workloadId: string, runId: string): Promise<void> {
  const cur = await connection.get(`lock:workload:${workloadId}`);
  if (cur === runId) await connection.del(`lock:workload:${workloadId}`);
}

async function doneSteps(runId: string): Promise<Set<string>> {
  const d = await api<{ steps: StepState[] }>(`/internal/runs/${runId}/state`);
  return new Set(d.steps.filter((s) => s.status === 'succeeded').map((s) => s.step));
}

function renderTemplate(s: string, outputs: Record<string, unknown>): string {
  return s.replace(/\{\{\s*outputs\.([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => String(outputs[k] ?? ''));
}

async function runChecks(bp: BlueprintManifest, outputs: Record<string, unknown>, runId: string, dir: string): Promise<Array<{ name: string; ok: boolean; detail?: string }>> {
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
  for (const c of bp.checks) {
    const target = renderTemplate(c.target, outputs);
    const timeout = (c.timeout_s ?? 15) * 1000;
    let ok = false; let detail = '';
    try {
      if (c.kind === 'http') {
        const res = await fetch(target, { signal: AbortSignal.timeout(timeout), redirect: 'manual' });
        ok = c.expect ? res.status === c.expect : res.status < 500;
        detail = `HTTP ${res.status}`;
      } else if (c.kind === 'tcp') {
        const [host, port] = target.split(':');
        ok = await new Promise<boolean>((resolve) => { const s = createConnection({ host, port: Number(port), timeout }); s.on('connect', () => { s.destroy(); resolve(true); }); s.on('error', () => resolve(false)); s.on('timeout', () => { s.destroy(); resolve(false); }); });
        detail = ok ? 'bağlandı' : 'bağlanamadı';
      } else {
        const r = await sh('node', [path.join(dir, 'checks', target)], { cwd: dir, env: { OUTPUTS_JSON: JSON.stringify(outputs) }, onLine: async (l) => log(runId, `    ${l}`), timeoutMs: timeout });
        ok = r.code === 0; detail = `exit ${r.code}`;
      }
    } catch (e) { detail = e instanceof Error ? e.message : String(e); }
    await log(runId, `  check ${c.name}: ${ok ? '✓' : '✕'} ${detail}`, ok ? 'ok' : 'err');
    results.push({ name: c.name, ok, detail });
  }
  return results;
}

export async function runProvision(p: ProvisionPayload): Promise<void> {
  const { runId, workloadId } = p;
  const dir = path.join(WORK_DIR, workloadId);
  const bpDir = path.join(BLUEPRINTS_DIR, p.blueprint, p.version);
  let providerCreds: Record<string, string> | null = null;
  let secrets: Record<string, string> = {};
  const locked = await acquireLock(workloadId, runId);
  if (!locked) { await log(runId, 'iş yükü kilitli — başka bir çalıştırma sürüyor', 'err'); await finish(runId, 'failed', 3, { reason: 'locked' }); return; }
  try {
    const done = await doneSteps(runId);
    const skip = async (s: RunStep): Promise<boolean> => { if (done.has(s)) { await log(runId, `↷ ${s} (önceki denemede tamamlandı, atlanıyor)`); return true; } await step(runId, s, 'running'); await log(runId, `▶ ${s}`); return false; };
    const bp = await api<BlueprintManifest>(`/internal/blueprints/${p.blueprint}/${p.version}`);

    // ── validate ─────────────────────────────────────────────────────────
    if (!(await skip('validate'))) {
      await stat(path.join(bpDir, 'blueprint.yaml'));
      if (bp.has_tofu) await stat(path.join(bpDir, 'tofu', 'main.tf'));
      if (!bp.providers.includes(p.provider as never)) throw new Error(`blueprint ${p.provider} desteklemiyor`);
      await mkdir(dir, { recursive: true });
      await mkdir(path.join(WORK_DIR, '.plugin-cache'), { recursive: true });
      if (bp.has_tofu) await cp(path.join(bpDir, 'tofu'), path.join(dir, 'tofu'), { recursive: true, force: true });
      await log(runId, `  ${bp.slug}@${bp.version} · ${p.provider}/${p.region} · ${p.size} · ${p.residency} · kind=${p.kind}`);
      await step(runId, 'validate', 'succeeded');
    }

    // ── unseal ───────────────────────────────────────────────────────────
    if (!(await skip('unseal'))) {
      const c = await fetchCredentials(runId);
      providerCreds = c.provider;
      const sealedSecrets = await api<Record<string, string>>(`/internal/runs/${runId}/workload-secrets`);
      secrets = Object.fromEntries(Object.entries(sealedSecrets).map(([k, v]) => [k, unseal(v, runnerKey()).toString('utf8')]));
      await log(runId, `  tedarikçi kimliği: ${providerCreds ? Object.keys(providerCreds).join(',') : 'yok'} · iş yükü sırları: ${Object.keys(secrets).length} (bellekte)`, 'ok');
      await step(runId, 'unseal', 'succeeded');
    } else {
      const c = await fetchCredentials(runId); providerCreds = c.provider;
      const sealedSecrets = await api<Record<string, string>>(`/internal/runs/${runId}/workload-secrets`);
      secrets = Object.fromEntries(Object.entries(sealedSecrets).map(([k, v]) => [k, unseal(v, runnerKey()).toString('utf8')]));
    }

    const workload = await api<{ inputs: Record<string, unknown>; outputs: Record<string, unknown> }>(`/internal/workloads/${workloadId}`);
    const tfDir = path.join(dir, 'tofu');
    const sshKey = await runnerSshKey();
    const env = tfEnv(providerCreds, workloadId, sshKey.publicKey);
    for (const [k, v] of Object.entries(secrets)) env[`TF_VAR_${k}`] = v;
    let outputs: Record<string, unknown> = workload.outputs ?? {};

    if (bp.has_tofu) {
      // tfvars: düz girdiler + boyut + kimlik
      const vars: Record<string, unknown> = { ...workload.inputs, ...p.sizeVars, region: p.region, size: p.size, residency: p.residency, tenant_slug: p.tenantSlug, workload_slug: p.workloadSlug, workload_id: workloadId };
      await writeFile(path.join(tfDir, 'veritut.auto.tfvars.json'), JSON.stringify(vars, null, 2));
      const backendArgs = TFSTATE_URL ? ['-backend-config', `conn_str=${TFSTATE_URL}`, '-backend-config', `schema_name=w_${workloadId.replace(/-/g, '')}`] : [];
      const init = await sh('tofu', ['init', '-no-color', '-reconfigure', ...backendArgs], { cwd: tfDir, env, onLine: async (l) => log(runId, `  ${mask(l)}`) , timeoutMs: 10 * 60_000 });
      if (init.code !== 0) throw new Error(`tofu init başarısız (${init.code})`);

      // ── plan ───────────────────────────────────────────────────────────
      if (!(await skip('plan'))) {
        await rm(path.join(tfDir, 'plan.tfplan'), { force: true });
        const planArgs = ['plan', '-json', '-out=plan.tfplan', ...(p.kind === 'destroy' ? ['-destroy'] : [])];
        const plan = await sh('tofu', planArgs, { cwd: tfDir, env, onLine: async () => undefined, timeoutMs: 15 * 60_000 });
        if (plan.code !== 0) { await log(runId, mask(plan.out.split('\n').filter((l) => l.includes('"@level":"error"')).map((l) => { try { return (JSON.parse(l) as { '@message': string })['@message']; } catch { return l; } }).join('\n')), 'err'); throw new Error(`tofu plan başarısız (${plan.code})`); }
        const summary = parsePlanJson(plan.stdout);
        await log(runId, `  tofu plan: ${summary.add} eklenecek, ${summary.change} değişecek, ${summary.destroy} silinecek, ${summary.replace} yeniden yaratılacak`);
        for (const r of summary.resources.filter((x) => x.action !== 'no-op' && x.action !== 'read')) await log(runId, `    ${r.action.padEnd(8)} ${r.address}`);
        const verdict = await api<{ status: string; risk: string }>(`/internal/runs/${runId}/plan`, { method: 'POST', body: JSON.stringify(summary) });
        await log(runId, `  risk: ${verdict.risk}${verdict.status === 'awaiting_approval' ? ' → dört-göz onayı bekleniyor' : ''}`, verdict.status === 'awaiting_approval' ? 'err' : 'ok');
        if (verdict.status === 'awaiting_approval') {
          const deadline = Date.now() + 24 * 3600_000;
          let state = 'pending';
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 5000));
            state = (await api<{ state: string }>(`/internal/runs/${runId}/approval`)).state;
            if (state !== 'pending') break;
          }
          if (state === 'rejected') { await log(runId, '  değişiklik REDDEDİLDİ — çalıştırma iptal', 'err'); await step(runId, 'plan', 'failed', 'reddedildi'); return; }
          if (state !== 'approved') throw new Error('onay zaman aşımı (24 sa)');
          await log(runId, '  onaylandı — devam', 'ok');
        }
        await step(runId, 'plan', 'succeeded', `+${summary.add} ~${summary.change} -${summary.destroy} ±${summary.replace}`);
      }

      // ── apply ──────────────────────────────────────────────────────────
      if (!(await skip('apply'))) {
        const hasPlan = await stat(path.join(tfDir, 'plan.tfplan')).then(() => true).catch(() => false);
        const applyArgs = hasPlan ? ['apply', '-no-color', '-auto-approve', 'plan.tfplan'] : ['apply', '-no-color', '-auto-approve', ...(p.kind === 'destroy' ? ['-destroy'] : [])];
        const apply = await sh('tofu', applyArgs, { cwd: tfDir, env, onLine: async (l) => log(runId, `  ${mask(l)}`), timeoutMs: (bp.apply_timeout_min ?? 45) * 60_000 });
        if (apply.code !== 0) throw new Error(`tofu apply başarısız (${apply.code})`);
        await rm(path.join(tfDir, 'plan.tfplan'), { force: true });
        await step(runId, 'apply', 'succeeded');
      }
      if (p.kind !== 'destroy') {
        const out = await sh('tofu', ['output', '-json'], { cwd: tfDir, env, onLine: async () => undefined });
        try { outputs = Object.fromEntries(Object.entries(JSON.parse(out.stdout) as Record<string, { value: unknown; sensitive?: boolean }>).map(([k, v]) => [k, v.value])); } catch (e) { await log(runId, `  çıktı ayrıştırılamadı: ${String(e).slice(0, 120)}`, 'err'); outputs = {}; }
        await log(runId, `  çıktılar: ${Object.entries(outputs).filter(([k]) => !/pass|secret|token|key/i.test(k)).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}`);
      }
    } else {
      await log(runId, '  blueprint tofu içermiyor (yalnız yapılandırma)');
      for (const s of ['plan', 'apply'] as RunStep[]) if (!done.has(s)) { await step(runId, s, 'skipped', 'tofu yok'); }
    }

    if (p.kind === 'destroy') {
      for (const s of ['configure', 'verify', 'register'] as RunStep[]) if (!done.has(s)) await step(runId, s, 'skipped', 'destroy');
      if (!(await skip('handoff'))) {
        await api(`/internal/workloads/${workloadId}/destroyed`, { method: 'POST', body: JSON.stringify({ runId }) });
        await log(runId, '  iş yükü yok edildi · kanıt: workload.destroyed', 'ok');
        await step(runId, 'handoff', 'succeeded');
      }
      await finish(runId, 'succeeded', 0, { destroyed: true });
      return;
    }

    // ── configure (Ansible) ──────────────────────────────────────────────
    if (!(await skip('configure'))) {
      if (bp.has_ansible) {
        const host = String(outputs['host'] ?? outputs['ipv4'] ?? '');
        const isLocal = !host || host === 'localhost' || host === '127.0.0.1';
        const inventory = isLocal ? 'localhost ansible_connection=local\n' : `${host} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20'\n`;
        await writeFile(path.join(dir, 'inventory.ini'), `[target]\n${inventory}`);
        const extra = { workload_id: workloadId, workload_slug: p.workloadSlug, tenant_slug: p.tenantSlug, residency: p.residency, size: p.size, ...p.sizeVars, ...workload.inputs, outputs };
        await writeFile(path.join(dir, 'extra.json'), JSON.stringify(extra));
        const aEnv: Record<string, string> = { ANSIBLE_HOST_KEY_CHECKING: 'False', ANSIBLE_NOCOLOR: '1', ANSIBLE_FORCE_COLOR: '0', ANSIBLE_STDOUT_CALLBACK: 'default', ANSIBLE_ROLES_PATH: path.join(BLUEPRINTS_DIR, '_roles') };
        for (const [k, v] of Object.entries(secrets)) aEnv[`VT_SECRET_${k.toUpperCase()}`] = v;
        if (process.env['KC_INTERNAL_URL']) aEnv['VT_KC_URL'] = process.env['KC_INTERNAL_URL'];
        if (process.env['KC_ADMIN_USERNAME']) { aEnv['VT_KC_ADMIN_USER'] = process.env['KC_ADMIN_USERNAME']; aEnv['VT_KC_ADMIN_PASS'] = process.env['KC_ADMIN_PASSWORD'] ?? ''; }
        const sshKeyPath = sshKey.privatePath;
        const a = await sh('ansible-playbook', ['-i', path.join(dir, 'inventory.ini'), '-e', `@${path.join(dir, 'extra.json')}`, ...(sshKeyPath && !isLocal ? ['--private-key', sshKeyPath] : []), path.join(bpDir, 'ansible', bp.playbook ?? 'site.yml')], { cwd: dir, env: aEnv, onLine: async (l) => log(runId, `  ${mask(l)}`), timeoutMs: 40 * 60_000 });
        if (a.code !== 0) throw new Error(`ansible başarısız (${a.code})`);
        // Ansible çıktıları (ör. OIDC client) → outputs.json
        try { outputs = { ...outputs, ...(JSON.parse(await readFile(path.join(dir, 'ansible-outputs.json'), 'utf8')) as Record<string, unknown>) }; } catch { /* yok */ }
        await step(runId, 'configure', 'succeeded');
      } else await step(runId, 'configure', 'skipped', 'ansible yok');
    }

    // ── verify ───────────────────────────────────────────────────────────
    let checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
    let verifyOk = true;
    if (!(await skip('verify'))) {
      checks = await runChecks(bp, outputs, runId, bpDir);
      verifyOk = checks.every((c) => c.ok);
      await step(runId, 'verify', verifyOk ? 'succeeded' : 'failed', `${checks.filter((c) => c.ok).length}/${checks.length}`);
    }

    // ── register ─────────────────────────────────────────────────────────
    if (!(await skip('register'))) {
      const endpoints = Array.isArray(outputs['endpoints']) ? (outputs['endpoints'] as Array<{ label: string; url: string }>) : outputs['url'] ? [{ label: bp.title_tr, url: String(outputs['url']) }] : [];
      const access = typeof outputs['access'] === 'object' && outputs['access'] ? (outputs['access'] as Record<string, string>) : undefined;
      const targets = bp.metrics.map((job) => ({ job, target: `${String(outputs['host'] ?? outputs['ipv4'] ?? 'localhost')}:${job === 'node' ? 9100 : 9090}`, labels: { tenant: p.tenantSlug, workload: p.workloadSlug, residency: p.residency, provider: p.provider } }));
      const probeUrl = typeof outputs['probe_url'] === 'string' ? outputs['probe_url'] : typeof outputs['url'] === 'string' ? outputs['url'] : null;
      await api(`/internal/workloads/${workloadId}/register`, { method: 'POST', body: JSON.stringify({ endpoints, access, monitoringTargets: targets, probeUrl, outputs: Object.fromEntries(Object.entries(outputs).filter(([k]) => k !== 'access')) }) });
      await log(runId, `  kayıt: ${endpoints.length} uç nokta · ${targets.length} izleme hedefi · erişim bilgisi ${access ? 'mühürlendi' : 'yok'}`, 'ok');
      await step(runId, 'register', 'succeeded');
    }

    // ── handoff ──────────────────────────────────────────────────────────
    if (!(await skip('handoff'))) {
      const h = await api<{ status: string }>(`/internal/workloads/${workloadId}/handoff`, { method: 'POST', body: JSON.stringify({ runId, verifyOk, checks }) });
      await log(runId, `  teslim: iş yükü ${h.status} · kanıt: workload.${p.kind === 'provision' ? 'provisioned' : 'upgraded'}`, verifyOk ? 'ok' : 'err');
      await step(runId, 'handoff', 'succeeded');
    }
    await finish(runId, verifyOk ? 'succeeded' : 'failed', verifyOk ? 0 : 4, { verifyOk, checks: checks.length, outputs: Object.keys(outputs) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log(runId, `HATA: ${mask(msg)}`, 'err');
    await finish(runId, 'failed', 1, { error: msg.slice(0, 500) }).catch(() => undefined);
    await api(`/internal/workloads/${workloadId}/failed`, { method: 'POST', body: JSON.stringify({ runId, error: msg.slice(0, 500) }) }).catch(() => undefined);
  } finally {
    secrets = {}; providerCreds = null;
    await releaseLock(workloadId, runId);
  }
}
