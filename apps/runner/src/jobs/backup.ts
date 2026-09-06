import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { api, fetchCredentials, finish, log, step } from './context.js';

/**
 * backup (K1): runner'da GERÇEK restic çalıştırır (hedef VM üzerinde koşan Ansible/cron sürümü K2).
 * Repo URL'si `s3:`/`sftp:`/yerel; kimlik bilgileri (RESTIC_PASSWORD, AWS_*) mühürden açılır, env ile alt sürece geçer, diske yazılmaz.
 * Sonuç → `/internal/backup-result` → backup_jobs + `backup.completed|failed` kanıtı.
 */
function run(cmd: string, args: string[], env: Record<string, string>, onLine: (l: string) => Promise<void>): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const feed = (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      out += s;
      for (const l of s.split('\n').filter((x) => x.trim())) void onLine(l);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

export async function runBackup(runId: string, payload: { workloadId: string; backupJobId: string; repoId: string; paths: string[]; retention: string; workloadSlug: string }): Promise<void> {
  const t0 = Date.now();
  let repoUrl = '';
  let env: Record<string, string> = {};
  try {
    await step(runId, 'validate', 'running');
    await log(runId, `backup · iş yükü=${payload.workloadSlug} · repo=${payload.repoId}`);
    await step(runId, 'validate', 'succeeded');

    await step(runId, 'unseal', 'running');
    const { repo } = await fetchCredentials(runId);
    if (!repo) throw new Error('yedek deposu kimlik bilgisi alınamadı');
    repoUrl = repo.repoUrl;
    env = { RESTIC_REPOSITORY: repoUrl, RESTIC_PASSWORD: repo.creds['RESTIC_PASSWORD'] ?? 'veritut-dev', ...Object.fromEntries(Object.entries(repo.creds).filter(([k]) => k.startsWith('AWS_') || k.startsWith('RESTIC_'))) };
    await log(runId, `  depo: ${repoUrl.replace(/\/\/[^@]+@/, '//[redakte]@')} · anahtarlar bellekte`, 'ok');
    await step(runId, 'unseal', 'succeeded');

    // Dev/K1: hedef yol yoksa iş yükü meta verisinden geçici bir örnek yedek kümesi oluştur (boru hattını gerçek restic ile kanıtlar).
    let paths = payload.paths.filter(Boolean);
    let tmp: string | null = null;
    if (paths.length === 0) {
      tmp = await mkdtemp(path.join(tmpdir(), 'vt-backup-'));
      await writeFile(path.join(tmp, 'workload.json'), JSON.stringify({ workloadId: payload.workloadId, slug: payload.workloadSlug, at: new Date().toISOString() }, null, 2));
      await writeFile(path.join(tmp, 'README.txt'), 'VERITUT K1 örnek yedek kümesi — hedef sunucu yolları K2 ile gelir.\n');
      paths = [tmp];
      await log(runId, `  yol tanımlı değil → örnek küme ${tmp}`);
    }

    await step(runId, 'apply', 'running');
    const init = await run('restic', ['snapshots', '--json', '--no-lock'], env, async () => undefined);
    if (init.code !== 0) {
      await log(runId, '  depo yok → restic init');
      const r = await run('restic', ['init'], env, (l) => log(runId, `  ${l}`));
      if (r.code !== 0) throw new Error(`restic init başarısız (${r.code})`);
    }
    const bk = await run('restic', ['backup', '--json', '--tag', `workload:${payload.workloadSlug}`, ...paths], env, async (l) => {
      try {
        const j = JSON.parse(l) as { message_type: string; snapshot_id?: string; files_new?: number; total_bytes_processed?: number };
        if (j.message_type === 'summary') await log(runId, `  snapshot ${j.snapshot_id} · ${j.files_new} yeni dosya · ${j.total_bytes_processed} bayt`, 'ok');
      } catch {
        await log(runId, `  ${l}`);
      }
    });
    if (bk.code !== 0) throw new Error(`restic backup başarısız (${bk.code})`);
    const summaryLine = bk.out.split('\n').map((l) => { try { return JSON.parse(l) as { message_type: string }; } catch { return null; } }).find((j) => j?.message_type === 'summary') as { snapshot_id: string; total_files_processed: number; total_bytes_processed: number } | undefined;
    await step(runId, 'apply', 'succeeded');

    await step(runId, 'verify', 'running');
    const chk = await run('restic', ['check', '--no-lock'], env, async (l) => log(runId, `  ${l}`));
    if (chk.code !== 0) throw new Error('restic check başarısız');
    await step(runId, 'verify', 'succeeded', 'restic check ok');
    if (payload.retention) {
      await run('restic', ['forget', '--prune', ...payload.retention.split(/\s+/).filter(Boolean)], env, async () => undefined);
    }
    if (tmp) await rm(tmp, { recursive: true, force: true });

    await step(runId, 'register', 'running');
    const durationS = Math.round((Date.now() - t0) / 1000);
    await api('/internal/backup-result', { method: 'POST', body: JSON.stringify({ workloadId: payload.workloadId, backupJobId: payload.backupJobId, repoId: payload.repoId, runId, status: 'completed', snapshotId: summaryLine?.snapshot_id ?? null, bytes: summaryLine?.total_bytes_processed ?? null, files: summaryLine?.total_files_processed ?? null, durationS }) });
    await log(runId, '  kanıt yazıldı: backup.completed', 'ok');
    await step(runId, 'register', 'succeeded');
    await finish(runId, 'succeeded', 0, { snapshotId: summaryLine?.snapshot_id ?? null, durationS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log(runId, `HATA: ${msg}`, 'err');
    await api('/internal/backup-result', { method: 'POST', body: JSON.stringify({ workloadId: payload.workloadId, backupJobId: payload.backupJobId, repoId: payload.repoId, runId, status: 'failed', error: msg.slice(0, 4000), durationS: Math.round((Date.now() - t0) / 1000) }) }).catch(() => undefined);
    await finish(runId, 'failed', 1, { error: msg });
  } finally {
    env = {};
  }
}
