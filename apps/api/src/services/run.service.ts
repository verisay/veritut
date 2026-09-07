import { and, desc, eq } from 'drizzle-orm';
import { runMachine, transition, type RunKind, type RunStatus } from '@veritut/types';
import type { RunFinish, RunStepReport } from '@veritut/validators';
import { db } from '../db/db.js';
import { runSteps, runs } from '../db/schema/index.js';
import { queue } from '../queues.js';
import { redis } from '../redis.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';

/** Canlı log: Redis stream `run:<id>:log` (kalıcı, 10k satır) + pub/sub kanalı `run:<id>` (WS yayını). */
export function runLogKey(runId: string): string {
  return `run:${runId}:log`;
}
export function runChannel(runId: string): string {
  return `run:${runId}`;
}

/** Kuyruk seçimi (D4): provider-sync → `provider-sync`; drill → `drill`; diğer IaC/yedek → `provision`. */
function queueFor(kind: RunKind): 'provision' | 'provider-sync' | 'drill' {
  if (kind === 'provider-sync') return 'provider-sync';
  if (kind === 'drill') return 'drill';
  return 'provision';
}

export async function createRun(input: {
  kind: RunKind;
  tenantId?: string | null;
  workloadId?: string | null;
  providerAccountId?: string | null;
  risk?: 'low' | 'medium' | 'high';
  staffId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const [run] = await db
    .insert(runs)
    .values({
      kind: input.kind,
      tenantId: input.tenantId ?? null,
      workloadId: input.workloadId ?? null,
      providerAccountId: input.providerAccountId ?? null,
      risk: input.risk ?? 'low',
      triggeredByStaff: input.staffId ?? null,
      status: runMachine.initial,
      payload: input.payload ?? {},
    })
    .returning();
  // İdempotens: jobId = run-<uuid> (BullMQ özel id'de ':' yasak); aynı run iki kez kuyruğa girmez.
  try {
    await queue(queueFor(input.kind)).add(input.kind, { runId: run!.id, kind: input.kind, providerAccountId: input.providerAccountId ?? null, workloadId: input.workloadId ?? null, ...(input.payload ?? {}) }, { jobId: `run-${run!.id}`, attempts: 1 });
  } catch (err) {
    await db.update(runs).set({ status: 'failed', finishedAt: new Date(), summary: { error: 'enqueue_failed' } }).where(eq(runs.id, run!.id));
    throw err;
  }
  await audit({ actorType: input.staffId ? 'staff' : 'system', actorId: input.staffId ?? null, tenantId: input.tenantId ?? null, action: 'run.create', subjectType: 'run', subjectId: run!.id, after: { kind: input.kind } });
  return run!;
}

/**
 * Çalıştırma listesi. Süzgeçsiz çağrı yalnız en yeni `limit` satırı döndürür;
 * belirli bir iş yükünün run'ını ARAYAN kod süzgeç kullanmalı — tek sapma taraması
 * onlarca run açtığı için liste penceresi aranan satırı kolayca dışarıda bırakır.
 */
export async function listRuns(limit = 50, filter: { kind?: string; workloadId?: string } = {}) {
  const conds = [
    ...(filter.kind ? [eq(runs.kind, filter.kind)] : []),
    ...(filter.workloadId ? [eq(runs.workloadId, filter.workloadId)] : []),
  ];
  const q = db.select().from(runs);
  return (conds.length > 0 ? q.where(and(...conds)) : q).orderBy(desc(runs.createdAt)).limit(limit);
}

export async function getRun(id: string) {
  const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  if (!run) throw ApiError.notFound('Çalıştırma bulunamadı');
  const steps = await db.select().from(runSteps).where(eq(runSteps.runId, id)).orderBy(runSteps.startedAt);
  return { run, steps };
}

export async function readRunLog(runId: string, count = 500): Promise<Array<{ id: string; t: string; line: string; level: string }>> {
  const entries = await redis.xrange(runLogKey(runId), '-', '+', 'COUNT', count);
  return entries.map(([id, fields]) => {
    const f: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) f[fields[i]!] = fields[i + 1] ?? '';
    return { id, t: f['t'] ?? '', line: f['line'] ?? '', level: f['level'] ?? 'info' };
  });
}

async function setStatus(runId: string, to: RunStatus, patch: Partial<typeof runs.$inferInsert> = {}) {
  const [cur] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, runId)).limit(1);
  if (!cur) throw ApiError.notFound('Çalıştırma bulunamadı');
  const next = transition(runMachine, cur.status as RunStatus, to);
  await db.update(runs).set({ status: next, ...patch }).where(eq(runs.id, runId));
}

/** Runner → adım raporu. İlk `running` adımı run'ı `running`'e alır. */
export async function reportStep(runId: string, r: RunStepReport) {
  const [cur] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, runId)).limit(1);
  if (!cur) throw ApiError.notFound('Çalıştırma bulunamadı');
  if (cur.status === 'queued') await setStatus(runId, 'running', { startedAt: new Date() });
  await db
    .insert(runSteps)
    .values({ runId, step: r.step, status: r.status, summary: r.summary ?? null, finishedAt: r.status === 'running' ? null : new Date() })
    .onConflictDoUpdate({
      target: [runSteps.runId, runSteps.step],
      set: { status: r.status, summary: r.summary ?? null, finishedAt: r.status === 'running' ? null : new Date() },
    });
}

export async function finishRun(runId: string, f: RunFinish) {
  await setStatus(runId, f.status, { finishedAt: new Date(), exitCode: f.exitCode ?? null, summary: f.summary ?? {} });
  await redis.publish(runChannel(runId), JSON.stringify({ type: 'finished', status: f.status }));
  if (f.status === 'failed') {
    const { notifyStaff } = await import('./notification.service.js');
    const [r] = await db.select({ kind: runs.kind }).from(runs).where(eq(runs.id, runId)).limit(1);
    await notifyStaff({ kind: 'run.failed', title: `Çalıştırma başarısız: ${r?.kind ?? ''} ${runId.slice(0, 8)}`, body: JSON.stringify(f.summary ?? {}).slice(0, 300), link: `/calistirmalar/${runId}` });
  }
}

/** Runner tarafından okunan mühürlü kimlik bilgisi referansı — API çözmez, sadece iletir (D12). */
export async function sealedCredentialsFor(runId: string): Promise<{ providerAccount: string | null; repo: string | null }> {
  const [r] = await db.select({ providerAccountId: runs.providerAccountId, payload: runs.payload }).from(runs).where(eq(runs.id, runId)).limit(1);
  if (!r) throw ApiError.notFound('Çalıştırma bulunamadı');
  const { providerAccounts, backupRepos } = await import('../db/schema/index.js');
  let providerAccount: string | null = null, repo: string | null = null;
  if (r.providerAccountId) {
    const [a] = await db.select({ s: providerAccounts.credentialsSealed }).from(providerAccounts).where(eq(providerAccounts.id, r.providerAccountId)).limit(1);
    providerAccount = a?.s ?? null;
  }
  const repoId = (r.payload as { repoId?: string }).repoId;
  if (repoId) {
    const [b] = await db.select({ s: backupRepos.credentialsSealed, url: backupRepos.repoUrl }).from(backupRepos).where(eq(backupRepos.id, repoId)).limit(1);
    repo = b ? JSON.stringify({ sealed: b.s, repoUrl: b.url }) : null;
  }
  return { providerAccount, repo };
}
