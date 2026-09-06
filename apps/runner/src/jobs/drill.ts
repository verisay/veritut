import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { api, fetchCredentials, finish, log, mask, step } from './context.js';

/**
 * Geri dönüş tatbikatı (D15): yedeği GEÇİCİ ortama restore eder, checksum ve uygulama kontrolü yapar,
 * sonucu kanıt defterine yazdırır. Üretime dokunmaz; geçici dizin her hâlükârda silinir.
 */
function sh(cmd: string, args: string[], env: Record<string, string>, onLine: (l: string) => Promise<void>, timeoutMs = 30 * 60_000): Promise<{ code: number; out: string; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    const feed = (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      out += s;
      for (const l of s.split('\n').filter((x) => x.trim())) void onLine(l);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    const t = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => { clearTimeout(t); resolve({ code: code ?? 1, out, stdout }); });
  });
}

export interface DrillPayload {
  runId: string;
  drillId: string;
  workloadId: string;
  repoId: string;
  snapshotId: string | null;
  workloadSlug: string;
  tenantSlug?: string;
  paths?: string[];
}

export async function runDrill(p: DrillPayload): Promise<void> {
  const t0 = Date.now();
  let tmp: string | null = null;
  let env: Record<string, string> = {};
  try {
    await step(p.runId, 'validate', 'running');
    await log(p.runId, `geri dönüş tatbikatı · iş yükü=${p.workloadSlug} · snapshot=${p.snapshotId ?? 'latest'}`);
    if (!p.repoId) throw new Error('yedek deposu yok');
    await step(p.runId, 'validate', 'succeeded');

    await step(p.runId, 'unseal', 'running');
    const { repo } = await fetchCredentials(p.runId);
    if (!repo) throw new Error('depo kimlik bilgisi alınamadı');
    env = { RESTIC_REPOSITORY: repo.repoUrl, RESTIC_PASSWORD: repo.creds['RESTIC_PASSWORD'] ?? 'veritut-dev', ...Object.fromEntries(Object.entries(repo.creds).filter(([k]) => k.startsWith('AWS_'))) };
    await step(p.runId, 'unseal', 'succeeded');

    // ── restore (geçici hedefe) ────────────────────────────────────────────
    await step(p.runId, 'apply', 'running');
    tmp = await mkdtemp(path.join(tmpdir(), 'vt-drill-'));
    await log(p.runId, `  geçici hedef: ${tmp}`);
    const target = p.snapshotId ?? 'latest';
    const restore = await sh('restic', ['restore', target, '--target', tmp, '--json'], env, async (l) => log(p.runId, `  ${mask(l)}`));
    if (restore.code !== 0) throw new Error(`restic restore başarısız (${restore.code})`);
    await step(p.runId, 'apply', 'succeeded');

    // ── verify: depo bütünlüğü + geri dönen veri gerçekten var mı ─────────
    await step(p.runId, 'verify', 'running');
    const check = await sh('restic', ['check', '--read-data-subset=5%', '--no-lock'], env, async (l) => log(p.runId, `  ${mask(l)}`), 15 * 60_000);
    const checksumOk = check.code === 0;
    await log(p.runId, `  depo bütünlüğü (restic check --read-data-subset): ${checksumOk ? '✓' : '✕'}`, checksumOk ? 'ok' : 'err');

    let bytes = 0;
    let files = 0;
    const walk = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const s = await stat(full);
          bytes += s.size;
          files++;
        }
      }
    };
    await walk(tmp);
    // Uygulama kontrolü: geri dönen küme boş olmamalı ve okunabilir olmalı.
    const appCheckOk = files > 0 && bytes > 0;
    await log(p.runId, `  geri dönen veri: ${files} dosya · ${bytes} bayt · uygulama kontrolü ${appCheckOk ? '✓' : '✕'}`, appCheckOk ? 'ok' : 'err');
    const passed = checksumOk && appCheckOk;
    await step(p.runId, 'verify', passed ? 'succeeded' : 'failed', `${files} dosya / ${bytes} bayt`);

    await step(p.runId, 'register', 'running');
    const durationS = Math.round((Date.now() - t0) / 1000);
    await api('/internal/drill-result', {
      method: 'POST',
      body: JSON.stringify({ drillId: p.drillId, workloadId: p.workloadId, runId: p.runId, status: passed ? 'passed' : 'failed', snapshotId: p.snapshotId, checksumOk, appCheckOk, restoredBytes: bytes, durationS, error: passed ? null : `checksum=${checksumOk} appCheck=${appCheckOk}` }),
    });
    await log(p.runId, `  kanıt yazıldı: restore.drill.${passed ? 'passed' : 'failed'}`, passed ? 'ok' : 'err');
    await step(p.runId, 'register', 'succeeded');
    for (const s of ['plan', 'configure', 'handoff'] as const) await step(p.runId, s, 'skipped', 'tatbikat');
    await finish(p.runId, passed ? 'succeeded' : 'failed', passed ? 0 : 5, { files, bytes, durationS, checksumOk, appCheckOk });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log(p.runId, `HATA: ${mask(msg)}`, 'err');
    await api('/internal/drill-result', { method: 'POST', body: JSON.stringify({ drillId: p.drillId, workloadId: p.workloadId, runId: p.runId, status: 'failed', durationS: Math.round((Date.now() - t0) / 1000), error: msg.slice(0, 4000) }) }).catch(() => undefined);
    await finish(p.runId, 'failed', 1, { error: msg }).catch(() => undefined);
  } finally {
    env = {};
    if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
