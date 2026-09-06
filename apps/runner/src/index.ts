import { Worker, type Job } from 'bullmq';
import { RUN_STEPS } from '@veritut/types';
import { closeContext, connection, finish, log, logger, runnerKey, step } from './jobs/context.js';
import { runProviderSync } from './jobs/provider-sync.js';
import { runBackup } from './jobs/backup.js';
import { runDriftPlan, runProvision, type ProvisionPayload } from './jobs/provision.js';
import { runDrill, type DrillPayload } from './jobs/drill.js';

/**
 * Runner (D5): tedarikçiye dokunan TEK süreç; X25519 özel anahtarı yalnız burada.
 * Kuyruklar: provision (echo · backup · K2: IaC) · provider-sync (envanter/maliyet) · drill (K4).
 */
const key = runnerKey();
logger.info({ publicKey: key.publicRaw.toString('hex') }, 'runner anahtarı yüklendi (açık anahtar)');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function runEcho(runId: string): Promise<void> {
  await log(runId, `veritut-runner · echo çalıştırması başladı · run=${runId}`);
  for (const s of RUN_STEPS) {
    await step(runId, s, 'running');
    await log(runId, `▶ ${s}`);
    await sleep(350);
    if (s === 'unseal') await log(runId, '  mühür açıldı (bellekte) — anahtar diske yazılmadı', 'ok');
    if (s === 'plan') await log(runId, '  tofu plan: 0 eklenecek, 0 değişecek, 0 silinecek (echo)');
    if (s === 'verify') await log(runId, '  checks: http 200 ✓ · tls ✓ · oidc 302 ✓ (simüle)', 'ok');
    await step(runId, s, 'succeeded');
  }
  await log(runId, 'echo tamamlandı · exit 0', 'ok');
  await finish(runId, 'succeeded', 0, { echo: true });
}

type ProvisionJob = { runId: string; kind: string; workloadId?: string | null; backupJobId?: string; repoId?: string; paths?: string[]; retention?: string; workloadSlug?: string };

const provisionWorker = new Worker(
  'provision',
  async (job: Job<ProvisionJob>) => {
    const { runId, kind } = job.data;
    logger.info({ runId, kind }, 'provision job alındı');
    try {
      if (kind === 'echo') return await runEcho(runId);
      if (kind === 'backup') {
        const d = job.data;
        return await runBackup(runId, { workloadId: d.workloadId!, backupJobId: d.backupJobId!, repoId: d.repoId!, paths: d.paths ?? [], retention: d.retention ?? '', workloadSlug: d.workloadSlug ?? '' });
      }
      if (kind === 'drift-plan') return await runDriftPlan(job.data as unknown as ProvisionPayload);
      if (['provision', 'resize', 'destroy', 'upgrade'].includes(kind)) {
        return await runProvision(job.data as unknown as ProvisionPayload);
      }
      await log(runId, `desteklenmeyen kind: ${kind} (K2'de gelir)`, 'err');
      await finish(runId, 'failed', 2, { reason: 'unsupported_kind' });
    } catch (err) {
      logger.error({ err, runId }, 'çalıştırma hatası');
      await log(runId, `HATA: ${String(err)}`, 'err').catch(() => undefined);
      await finish(runId, 'failed', 1, { error: String(err) }).catch(() => undefined);
      throw err;
    }
  },
  // lockDuration/stalledInterval: runner çökerse job ≤30 sn'de 'stalled' sayılır ve yeniden alınır; run_steps ile kaldığı adımdan devam (plan §3.3).
  { connection, concurrency: 2, lockDuration: 30_000, stalledInterval: 15_000, maxStalledCount: 3 },
);
provisionWorker.on('ready', () => logger.info('runner hazır — kuyruk: provision'));
provisionWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'provision başarısız'));

const syncWorker = new Worker(
  'provider-sync',
  async (job: Job<{ runId: string; providerAccountId: string; providerCode: string }>) => {
    const { runId, providerAccountId, providerCode } = job.data;
    logger.info({ runId, providerAccountId, providerCode }, 'provider-sync job alındı');
    try {
      await runProviderSync(runId, providerAccountId, providerCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ runId, err: msg }, 'provider-sync hatası');
      await log(runId, `HATA: ${msg}`, 'err').catch(() => undefined);
      await finish(runId, 'failed', 1, { error: msg }).catch(() => undefined);
      throw err;
    }
  },
  { connection, concurrency: 2, lockDuration: 300_000 },
);
syncWorker.on('ready', () => logger.info('runner hazır — kuyruk: provider-sync'));

const drillWorker = new Worker(
  'drill',
  async (job: Job<DrillPayload>) => {
    logger.info({ runId: job.data.runId, workloadId: job.data.workloadId }, 'drill job alındı');
    await runDrill(job.data);
  },
  { connection, concurrency: 1, lockDuration: 60_000, stalledInterval: 30_000 },
);
drillWorker.on('ready', () => logger.info('runner hazır — kuyruk: drill'));
drillWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'drill başarısız'));

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} alındı — runner kapanıyor (aktif run drain)`);
  await Promise.allSettled([provisionWorker.close(), syncWorker.close(), drillWorker.close()]);
  await closeContext();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
