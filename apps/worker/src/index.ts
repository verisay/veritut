import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import type { ComponentState } from '@veritut/types';
import { createMailProvider, type MailMessage } from './mail.js';

/**
 * Worker (D4/D5): notify · probe · report · rollup. Tedarikçi kimlik bilgisi ve DB erişimi YOK —
 * ihtiyaç duyduğu veriyi API iç uçlarından alır, sonucu iç uca yazar.
 * K0: `probe` gerçek (platform bileşenleri → status snapshot); diğerleri iskelet.
 */
const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
    : {}),
});

const connection = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379', { maxRetriesPerRequest: null });
const API_URL = process.env['API_URL'] ?? 'http://veritut-api:4400';
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? '';
const headers = { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN };

async function probeOne(url: string): Promise<{ state: ComponentState; latencyMs: number | null }> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    const latencyMs = Math.round(performance.now() - t0);
    if (res.status >= 500) return { state: 'down', latencyMs };
    if (latencyMs > 2500) return { state: 'degraded', latencyMs };
    return { state: 'ok', latencyMs };
  } catch {
    return { state: 'down', latencyMs: null };
  }
}

/** Probe turu (v2): platform + kiracı bileşenleri, componentId ile raporlanır; API snapshot'ları üretir. */
async function runProbes(): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/internal/probe-targets`, { headers });
  if (!res.ok) throw new Error(`probe-targets ${res.status}`);
  const targets = (await res.json()) as Array<{ componentId: string; slug: string; probeUrl: string; scope: string }>;
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(targets.map(async (t) => ({ componentId: t.componentId, ...(await probeOne(t.probeUrl)), checkedAt })));
  if (results.length === 0) return;
  const post = await fetch(`${API_URL}/api/v1/internal/probe-results-v2`, { method: 'POST', headers, body: JSON.stringify({ results }) });
  if (!post.ok) throw new Error(`probe-results-v2 ${post.status}: ${await post.text()}`);
  logger.debug({ n: results.length, tenant: targets.filter((t) => t.scope === 'tenant').length }, 'probe turu tamam');
}

const probeWorker = new Worker('probe', async (_job: Job) => runProbes(), { connection, concurrency: 1 });
probeWorker.on('ready', () => logger.info('worker hazır — kuyruk: probe'));
probeWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'probe başarısız'));

// Tekrarlı probe job'ı (30 sn) — idempotent: aynı jobId ile bir kez tanımlanır.
const probeQueue = new Queue('probe', { connection });
await probeQueue.upsertJobScheduler('probe-platform', { every: 30_000 }, { name: 'platform', data: {} });

// notify: IMailProvider (mock/dev). Alıcı listesi ve konu loglanır; sır içermez.
const mail = createMailProvider(logger);
interface ChannelJob {
  channelId: string;
  kind: 'email' | 'webhook' | 'slack' | 'teams' | 'sms';
  target: string;
  body: Record<string, unknown>;
  signature?: string;
}

/** Müşteri alarm kanalı gönderimi (K4). Webhook/Slack/Teams HMAC imzalı; e-posta/SMS sağlayıcı üzerinden. */
async function deliverChannel(d: ChannelJob): Promise<void> {
  let error: string | null = null;
  try {
    if (d.kind === 'webhook' || d.kind === 'slack' || d.kind === 'teams') {
      const payload = d.kind === 'webhook' ? d.body : { text: `VERITUT · ${String(d.body['event'])}: ${String(d.body['title'] ?? '')}` };
      const res = await fetch(d.target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(d.signature ? { 'x-veritut-signature': d.signature } : {}) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) error = `HTTP ${res.status}`;
    } else if (d.kind === 'email') {
      await mail.send({ to: [d.target], subject: `VERITUT · ${String(d.body['title'] ?? d.body['event'])}`, text: JSON.stringify(d.body, null, 2) });
    } else {
      // SMS: ISmsService adaptörü (Netgsm) prod credential'ıyla gelir; dev'de loglanır.
      logger.info({ to: d.target.slice(-4), event: d.body['event'] }, 'sms (mock)');
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await fetch(`${API_URL}/api/v1/internal/channel-result`, { method: 'POST', headers, body: JSON.stringify({ channelId: d.channelId, error }) }).catch(() => undefined);
  if (error) throw new Error(`kanal gönderimi başarısız: ${error}`);
}

const notifyWorker = new Worker(
  'notify',
  async (job: Job) => {
    if (job.name === 'mail') return mail.send(job.data as MailMessage);
    if (job.name === 'channel') return deliverChannel(job.data as ChannelJob);
    if (job.name === 'alert') {
      // Nöbetçi eskalasyonu — SMS/çağrı sağlayıcısı prod'da bağlanır.
      const d = job.data as { to: string; subject: string; text: string };
      logger.warn({ to: d.to, subject: d.subject }, 'ESKALASYON çağrısı (mock)');
      await mail.send({ to: [d.to], subject: d.subject, text: d.text });
      return;
    }
  },
  { connection, concurrency: 3 },
);
notifyWorker.on('ready', () => logger.info({ provider: mail.name }, 'worker hazır — kuyruk: notify'));
notifyWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'notify başarısız'));

// İskelet tüketiciler — K3/K4 içerik: report (pdf), rollup (KPI).
const skeletons = ['report', 'rollup'].map(
  (name) =>
    new Worker(
      name,
      async (job: Job) => {
        logger.info({ queue: name, jobId: job.id, jobName: job.name }, 'job alındı (iskelet — K1+ içerik)');
      },
      { connection, concurrency: 2 },
    ),
);

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} alındı — worker kapanıyor`);
  await Promise.allSettled([probeWorker.close(), probeQueue.close(), notifyWorker.close(), ...skeletons.map((w) => w.close())]);
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
