import { and, desc, eq, sql } from 'drizzle-orm';
import { checkBackupTopology, checkResidency, type ProviderCode, type Residency } from '@veritut/types';
import type { BackupResult } from '@veritut/validators';
import type { z } from 'zod';
import type { backupPolicySchema, createBackupRepoSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { backupJobs, backupPolicies, backupRepos, workloads } from '../db/schema/index.js';
import { env } from '../config/env.js';
import { seal } from '../lib/seal.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { appendEvidence } from './evidence.service.js';
import { createRun } from './run.service.js';
import { notifyStaff, notifyTenant } from './notification.service.js';

const repoCols = { id: backupRepos.id, label: backupRepos.label, providerCode: backupRepos.providerCode, providerAccountId: backupRepos.providerAccountId, repoUrl: backupRepos.repoUrl, residency: backupRepos.residency, active: backupRepos.active, createdAt: backupRepos.createdAt, hasCredentials: sql<boolean>`${backupRepos.credentialsSealed} IS NOT NULL` };

export async function createRepo(input: z.infer<typeof createBackupRepoSchema>, staffId: string) {
  const sealed = Object.keys(input.credentials).length ? seal(JSON.stringify(input.credentials), env.RUNNER_PUBLIC_KEY) : null;
  const [row] = await db.insert(backupRepos).values({ label: input.label, providerCode: input.providerCode, providerAccountId: input.providerAccountId ?? null, repoUrl: input.repoUrl, residency: input.residency, credentialsSealed: sealed }).returning(repoCols);
  await audit({ actorType: 'staff', actorId: staffId, action: 'backup_repo.create', subjectType: 'backup_repo', subjectId: row!.id, after: { label: input.label, providerCode: input.providerCode, residency: input.residency } });
  return row!;
}
export async function listRepos() {
  return db.select(repoCols).from(backupRepos).orderBy(backupRepos.createdAt);
}

/** Politika: 3-2-1 + ikametgâh kuralları KODDA (D15/D25) — ihlal 422. */
export async function upsertPolicy(workloadId: string, input: z.infer<typeof backupPolicySchema>, staffId: string) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const [primary] = await db.select(repoCols).from(backupRepos).where(eq(backupRepos.id, input.primaryRepoId)).limit(1);
  if (!primary) throw ApiError.badRequest('Birincil depo bulunamadı');
  const offsite = input.offsiteRepoId ? (await db.select(repoCols).from(backupRepos).where(eq(backupRepos.id, input.offsiteRepoId)).limit(1))[0] ?? null : null;
  const topo = checkBackupTopology({ primaryProvider: primary.providerCode as ProviderCode, offsiteProvider: (offsite?.providerCode as ProviderCode | undefined) ?? null });
  const res = checkResidency({ workload: w.residency as Residency, region: w.residency as Residency, primaryBackup: primary.residency as Residency, offsiteBackup: (offsite?.residency as Residency | undefined) });
  const violations = [...topo.map((v) => ({ policy: '3-2-1', code: v })), ...res.map((v) => ({ policy: 'residency', code: `${v.subject}:${v.actual}→${v.expected}` }))];
  if (violations.length > 0) throw new ApiError(422, 'Yedek politikası kurallara aykırı', 'POLICY_VIOLATION', violations);
  const [row] = await db
    .insert(backupPolicies)
    .values({ workloadId, primaryRepoId: input.primaryRepoId, offsiteRepoId: input.offsiteRepoId ?? null, schedule: input.schedule, retention: input.retention, paths: input.paths, enabled: input.enabled })
    .onConflictDoUpdate({ target: backupPolicies.workloadId, set: { primaryRepoId: input.primaryRepoId, offsiteRepoId: input.offsiteRepoId ?? null, schedule: input.schedule, retention: input.retention, paths: input.paths, enabled: input.enabled } })
    .returning();
  await audit({ actorType: 'staff', actorId: staffId, tenantId: w.tenantId, action: 'backup_policy.upsert', subjectType: 'workload', subjectId: workloadId, after: input });
  return row!;
}

export async function getPolicy(workloadId: string) {
  const [p] = await db.select().from(backupPolicies).where(eq(backupPolicies.workloadId, workloadId)).limit(1);
  return p ?? null;
}

/** Elle yedek tetikleme (K1: runner restic'i koşar; K2'de hedef VM'de Ansible/cron). */
export async function triggerBackup(workloadId: string, staffId: string | null) {
  const p = await getPolicy(workloadId);
  if (!p || !p.primaryRepoId) throw ApiError.badRequest('İş yükünün yedek politikası yok');
  const [w] = await db.select({ tenantId: workloads.tenantId, slug: workloads.slug }).from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  const [job] = await db.insert(backupJobs).values({ workloadId, repoId: p.primaryRepoId, status: 'scheduled' }).returning();
  const run = await createRun({ kind: 'backup', staffId, tenantId: w!.tenantId, workloadId, payload: { backupJobId: job!.id, repoId: p.primaryRepoId, paths: p.paths, retention: p.retention, workloadSlug: w!.slug } });
  await db.update(backupJobs).set({ runId: run.id, status: 'running' }).where(eq(backupJobs.id, job!.id));
  return { job: job!, run };
}

/** Runner/hedef sunucu yedek sonucu → backup_jobs + KANIT; 2 ardışık hata → bildirim. */
export async function applyBackupResult(r: BackupResult & { backupJobId?: string | null }) {
  const [w] = await db.select({ id: workloads.id, tenantId: workloads.tenantId, slug: workloads.slug }).from(workloads).where(eq(workloads.id, r.workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const ev = await appendEvidence({
    tenantId: w.tenantId,
    kind: r.status === 'completed' ? 'backup.completed' : 'backup.failed',
    subjectType: 'workload',
    subjectId: w.id,
    payload: { workloadSlug: w.slug, repoId: r.repoId ?? null, snapshotId: r.snapshotId ?? null, bytes: r.bytes ?? null, files: r.files ?? null, durationS: r.durationS ?? null, error: r.error ?? null, runId: r.runId ?? null },
    actor: 'runner',
  });
  const values = { workloadId: w.id, repoId: r.repoId ?? null, runId: r.runId ?? null, status: r.status, snapshotId: r.snapshotId ?? null, bytes: r.bytes ?? null, files: r.files ?? null, durationS: r.durationS ?? null, error: r.error ?? null, evidenceId: ev.id, finishedAt: new Date() };
  let job;
  if (r.backupJobId) [job] = await db.update(backupJobs).set(values).where(eq(backupJobs.id, r.backupJobId)).returning();
  if (!job) [job] = await db.insert(backupJobs).values(values).returning();
  if (r.status === 'failed') {
    const last2 = await db.select({ status: backupJobs.status }).from(backupJobs).where(and(eq(backupJobs.workloadId, w.id), sql`${backupJobs.status} IN ('completed','failed')`)).orderBy(desc(backupJobs.finishedAt)).limit(2);
    if (last2.length === 2 && last2.every((j) => j.status === 'failed')) {
      await notifyStaff({ kind: 'backup.failed_twice', title: `Yedek 2 kez ardışık başarısız: ${w.slug}`, body: r.error ?? '', link: `/is-yukleri/${w.id}` });
      await notifyTenant(w.tenantId, ['owner', 'admin', 'technical'], { kind: 'backup.failed_twice', title: `${w.slug} yedeği iki kez başarısız oldu`, body: 'Ekibimiz inceliyor; durum kanıt defterinizde görünür.', link: `/panel/is-yukleri/${w.id}` });
    }
  }
  return { job: job!, evidence: ev };
}

export async function listJobs(opts: { workloadId?: string; limit?: number }) {
  const where = opts.workloadId ? [eq(backupJobs.workloadId, opts.workloadId)] : [];
  return db
    .select({ id: backupJobs.id, workloadId: backupJobs.workloadId, workloadName: workloads.name, tenantId: workloads.tenantId, status: backupJobs.status, snapshotId: backupJobs.snapshotId, bytes: backupJobs.bytes, files: backupJobs.files, durationS: backupJobs.durationS, error: backupJobs.error, evidenceId: backupJobs.evidenceId, startedAt: backupJobs.startedAt, finishedAt: backupJobs.finishedAt, runId: backupJobs.runId })
    .from(backupJobs)
    .innerJoin(workloads, eq(workloads.id, backupJobs.workloadId))
    .where(and(...where))
    .orderBy(desc(backupJobs.startedAt))
    .limit(opts.limit ?? 100);
}
