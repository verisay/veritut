import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { restoreDrillMachine, transition, type RestoreDrillStatus } from '@veritut/types';
import type { z } from 'zod';
import type { drillResultSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { backupJobs, backupPolicies, restoreDrills, tenants, workloads } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { appendEvidence } from './evidence.service.js';
import { createRun } from './run.service.js';
import { notifyStaff, notifyTenant } from './notification.service.js';
import { dispatchChannels } from './channel.service.js';

/**
 * Geri dönüş tatbikatı (D15 / plan §5.2): "yedekliyoruz" diyen çok, "geri döndüğünü kanıtlayan" az.
 * Aylık takvim → runner `drill` → geçici ortama restore → checksum + uygulama kontrolü → kanıt.
 */
export async function scheduleMonthlyDrills(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const rows = await db
    .select({ id: workloads.id, slug: workloads.slug })
    .from(workloads)
    .innerJoin(backupPolicies, eq(backupPolicies.workloadId, workloads.id))
    .where(and(sql`${workloads.status} IN ('active','degraded')`, eq(backupPolicies.enabled, true), eq(workloads.drillSchedule, 'monthly')));
  let n = 0;
  for (const w of rows) {
    const [existing] = await db.select({ id: restoreDrills.id }).from(restoreDrills).where(and(eq(restoreDrills.workloadId, w.id), gte(restoreDrills.scheduledFor, monthStart))).limit(1);
    if (existing) continue;
    await db.insert(restoreDrills).values({ workloadId: w.id, scheduledFor: today, status: 'scheduled' });
    n++;
  }
  if (n > 0) logger.info({ n }, 'aylık tatbikatlar planlandı');
  return n;
}

/** Planlanmış tatbikatları runner `drill` kuyruğuna verir (en son başarılı yedeği kullanır). */
export async function dispatchScheduledDrills(limit = 5): Promise<number> {
  const rows = await db
    .select({ drill: restoreDrills, workload: workloads })
    .from(restoreDrills)
    .innerJoin(workloads, eq(workloads.id, restoreDrills.workloadId))
    .where(eq(restoreDrills.status, 'scheduled'))
    .orderBy(restoreDrills.scheduledFor)
    .limit(limit);
  let n = 0;
  for (const r of rows) {
    try {
      await startDrill(r.drill.id, null);
      n++;
    } catch (err) {
      logger.error({ err, drillId: r.drill.id }, 'tatbikat başlatılamadı');
    }
  }
  return n;
}

export async function triggerDrill(workloadId: string, staffId: string | null) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const [row] = await db.insert(restoreDrills).values({ workloadId, scheduledFor: new Date().toISOString().slice(0, 10), status: 'scheduled' }).returning();
  return startDrill(row!.id, staffId);
}

async function startDrill(drillId: string, staffId: string | null) {
  const [d] = await db.select().from(restoreDrills).where(eq(restoreDrills.id, drillId)).limit(1);
  if (!d) throw ApiError.notFound('Tatbikat bulunamadı');
  const [w] = await db.select().from(workloads).where(eq(workloads.id, d.workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const [policy] = await db.select().from(backupPolicies).where(eq(backupPolicies.workloadId, w.id)).limit(1);
  if (!policy?.primaryRepoId) throw new ApiError(422, 'İş yükünün yedek politikası yok', 'NO_BACKUP_POLICY');
  const [lastOk] = await db
    .select()
    .from(backupJobs)
    .where(and(eq(backupJobs.workloadId, w.id), eq(backupJobs.status, 'completed')))
    .orderBy(desc(backupJobs.finishedAt))
    .limit(1);
  if (!lastOk) throw new ApiError(422, 'Tatbikat için başarılı bir yedek gerekir', 'BACKUP_REQUIRED');
  const [t] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, w.tenantId)).limit(1);
  const run = await createRun({
    kind: 'drill',
    tenantId: w.tenantId,
    workloadId: w.id,
    staffId,
    payload: { drillId: d.id, repoId: policy.primaryRepoId, snapshotId: lastOk.snapshotId, workloadSlug: w.slug, tenantSlug: t?.slug, paths: policy.paths },
  });
  await db.update(restoreDrills).set({ status: transition(restoreDrillMachine, d.status as RestoreDrillStatus, 'running'), runId: run.id, backupJobId: lastOk.id, startedAt: new Date(), snapshotId: lastOk.snapshotId }).where(eq(restoreDrills.id, d.id));
  await audit({ actorType: staffId ? 'staff' : 'system', actorId: staffId, tenantId: w.tenantId, action: 'drill.start', subjectType: 'restore_drill', subjectId: d.id, after: { snapshotId: lastOk.snapshotId } });
  return { drill: { ...d, status: 'running' as const }, run };
}

/** Runner sonucu → kanıt (`restore.drill.passed|failed`) + başarısızlıkta müşteri bilgilendirmesi (şeffaflık). */
export async function applyDrillResult(r: z.infer<typeof drillResultSchema>) {
  const [d] = await db.select().from(restoreDrills).where(eq(restoreDrills.id, r.drillId)).limit(1);
  if (!d) throw ApiError.notFound('Tatbikat bulunamadı');
  const [w] = await db.select().from(workloads).where(eq(workloads.id, r.workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const ev = await appendEvidence({
    tenantId: w.tenantId,
    kind: r.status === 'passed' ? 'restore.drill.passed' : 'restore.drill.failed',
    subjectType: 'workload',
    subjectId: w.id,
    payload: { workloadSlug: w.slug, drillId: d.id, snapshotId: r.snapshotId ?? d.snapshotId, checksumOk: r.checksumOk ?? null, appCheckOk: r.appCheckOk ?? null, restoredBytes: r.restoredBytes ?? null, durationS: r.durationS ?? null, error: r.error ?? null, runId: r.runId ?? d.runId },
    actor: 'runner',
  });
  await db
    .update(restoreDrills)
    .set({ status: transition(restoreDrillMachine, 'running', r.status), checksumOk: r.checksumOk ?? null, appCheckOk: r.appCheckOk ?? null, restoredBytes: r.restoredBytes ?? null, durationS: r.durationS ?? null, error: r.error ?? null, evidenceId: ev.id, finishedAt: new Date(), snapshotId: r.snapshotId ?? d.snapshotId })
    .where(eq(restoreDrills.id, d.id));
  if (r.status === 'failed') {
    await notifyStaff({ kind: 'system', title: `Geri dönüş tatbikatı BAŞARISIZ: ${w.slug}`, body: r.error ?? 'Ayrıntı yok', link: `/is-yukleri/${w.id}` }, 'senior');
    await notifyTenant(w.tenantId, ['owner', 'admin', 'technical'], { kind: 'system', title: `${w.name} için geri dönüş tatbikatı başarısız oldu`, body: 'Yedeğin geri döndüğünü doğrulayamadık. Ekibimiz inceliyor; sonucu kanıt defterinizde göreceksiniz. Bunu sizden gizlemeyiz.', link: `/panel/is-yukleri/${w.id}` });
    await dispatchChannels(w.tenantId, 'drill.failed', { workload: w.slug, error: r.error ?? null });
  } else {
    await notifyTenant(w.tenantId, ['owner', 'technical'], { kind: 'system', title: `${w.name} yedeği geri döndü — doğrulandı`, body: `Tatbikat ${r.durationS ?? 0} saniyede tamamlandı, checksum ve uygulama kontrolü geçti. Kanıt defterinizde.`, link: '/panel/kanit' });
  }
  return { evidenceId: ev.id, status: r.status };
}

export async function listDrills(opts: { tenantId?: string; workloadId?: string; limit?: number } = {}) {
  const where = [];
  if (opts.workloadId) where.push(eq(restoreDrills.workloadId, opts.workloadId));
  if (opts.tenantId) where.push(eq(workloads.tenantId, opts.tenantId));
  return db
    .select({ drill: restoreDrills, workloadName: workloads.name, workloadSlug: workloads.slug, tenantId: workloads.tenantId })
    .from(restoreDrills)
    .innerJoin(workloads, eq(workloads.id, restoreDrills.workloadId))
    .where(where.length ? and(...where) : sql`true`)
    .orderBy(desc(restoreDrills.createdAt))
    .limit(opts.limit ?? 100);
}

/** Son doğrulanmış geri dönüş (portal sağlık kartı). */
export async function lastVerifiedRestores(workloadIds: string[]) {
  if (workloadIds.length === 0) return [];
  return db
    .select({ workloadId: restoreDrills.workloadId, at: sql<string>`max(${restoreDrills.finishedAt})::text` })
    .from(restoreDrills)
    .where(and(eq(restoreDrills.status, 'passed'), sql`${restoreDrills.workloadId} = ANY(${sql.raw(`ARRAY['${workloadIds.join("','")}']::uuid[]`)})`))
    .groupBy(restoreDrills.workloadId);
}

export { isNull };
