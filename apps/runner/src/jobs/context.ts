import { Redis } from 'ioredis';
import { pino } from 'pino';
import { loadRunnerKey, unseal, type RunnerKey } from '../lib/unseal.js';

/** Ortak runner bağlamı: API iç uçları, log yayını, mühür açma. */
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: ['*.token', '*.secret', '*.password', '*_sealed', 'env', 'creds'],
  ...(process.env['NODE_ENV'] === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
});

export const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://redis:6379';
export const API_URL = process.env['API_URL'] ?? 'http://veritut-api:4400';
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? '';
export const headers = { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN };

const pub = new Redis(REDIS_URL);
export const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

let key: RunnerKey | null = null;
export function runnerKey(): RunnerKey {
  if (!key) {
    const priv = process.env['RUNNER_PRIVATE_KEY'];
    if (!priv) throw new Error('RUNNER_PRIVATE_KEY yok');
    key = loadRunnerKey(priv);
  }
  return key;
}

/** Sır maskesi: token/secret/password kalıpları + 24+ karakterlik hex/base64 dizeleri. */
export function mask(line: string): string {
  return line.replace(/(token|secret|password|passwd|key)(["']?\s*[=:]\s*["']?)\S+/gi, '$1$2[redakte]').replace(/\b[A-Za-z0-9+/_-]{32,}\b/g, (m) => (/^[0-9a-f-]{36}$/i.test(m) ? m : '[redakte]'));
}

export async function log(runId: string, line: string, level: 'info' | 'ok' | 'err' = 'info'): Promise<void> {
  const masked = mask(line);
  const t = new Date().toISOString();
  await connection.xadd(`run:${runId}:log`, 'MAXLEN', '~', '10000', '*', 't', t, 'line', masked, 'level', level);
  await pub.publish(`run:${runId}`, JSON.stringify({ type: 'log', t, line: masked, level }));
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`api ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function step(runId: string, s: string, status: 'running' | 'succeeded' | 'failed' | 'skipped', summary?: string): Promise<void> {
  await api(`/internal/runs/${runId}/steps`, { method: 'POST', body: JSON.stringify({ step: s, status, summary }) });
}
export async function finish(runId: string, status: 'succeeded' | 'failed', exitCode: number, summary: Record<string, unknown> = {}): Promise<void> {
  await api(`/internal/runs/${runId}/finish`, { method: 'POST', body: JSON.stringify({ status, exitCode, summary }) });
}

/** Mühürlü kimlik bilgisini API'den alır ve YALNIZ bellekte açar. */
export async function fetchCredentials(runId: string): Promise<{ provider: Record<string, string> | null; repo: { creds: Record<string, string>; repoUrl: string } | null }> {
  const r = await api<{ providerAccount: string | null; repo: string | null }>(`/internal/runs/${runId}/credentials`);
  const provider = r.providerAccount ? (JSON.parse(unseal(r.providerAccount, runnerKey()).toString('utf8')) as Record<string, string>) : null;
  let repo: { creds: Record<string, string>; repoUrl: string } | null = null;
  if (r.repo) {
    const { sealed, repoUrl } = JSON.parse(r.repo) as { sealed: string | null; repoUrl: string };
    repo = { creds: sealed ? (JSON.parse(unseal(sealed, runnerKey()).toString('utf8')) as Record<string, string>) : {}, repoUrl };
  }
  return { provider, repo };
}

export async function closeContext(): Promise<void> {
  await Promise.allSettled([connection.quit(), pub.quit()]);
}
