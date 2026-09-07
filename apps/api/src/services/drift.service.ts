import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { driftResultSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { driftReports, tenants, workloads } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { createRun } from './run.service.js';
import { notifyStaff } from './notification.service.js';

/**
 * Sapma tespiti (plan §14 K4/5): gece `tofu plan` — elle yapılan değişikliği yakalar.
 * "Üretime elle müdahale yasak" kuralının denetçisi budur.
 */
export async function scheduleDriftPlans(limit = 20, only?: { workloadId?: string }): Promise<number> {
  // `limit` bir PARTİ boyutudur, keyfi kesme değil: en uzun süredir taranmamış iş yükleri
  // önce gelir (hiç taranmamışlar en başta). Sıralamasız kesme, iş yükü sayısı limitten
  // çoksa çoğunu sessizce denetimsiz bırakıyordu — bu tarama "elle müdahale yasak"ın denetçisi.
  const lastScan = sql`(SELECT max(dr.created_at) FROM drift_reports dr WHERE dr.workload_id = ${workloads.id})`;
  const rows = await db
    .select({ id: workloads.id, slug: workloads.slug, tenantId: workloads.tenantId, blueprint: workloads.blueprintSlug, version: workloads.blueprintVersion, region: workloads.region, size: workloads.size, residency: workloads.residency, provider: workloads.providerCode, accountId: workloads.providerAccountId })
    .from(workloads)
    .where(
      and(
        sql`${workloads.status} IN ('active','degraded')`,
        sql`${workloads.blueprintSlug} IS NOT NULL`,
        ...(only?.workloadId ? [eq(workloads.id, only.workloadId)] : []),
      ),
    )
    .orderBy(sql`${lastScan} ASC NULLS FIRST`, workloads.createdAt)
    .limit(limit);
  let n = 0;
  for (const w of rows) {
    const [t] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, w.tenantId)).limit(1);
    const { getBlueprint } = await import('./blueprint.service.js');
    const bp = await getBlueprint(w.blueprint!, w.version ?? '');
    const sizeVars = bp.sizes.find((s) => s.code === w.size)?.vars ?? {};
    await createRun({
      kind: 'drift-plan',
      tenantId: w.tenantId,
      workloadId: w.id,
      providerAccountId: w.accountId,
      staffId: null,
      payload: { blueprint: w.blueprint, version: w.version, tenantSlug: t?.slug, workloadSlug: w.slug, region: w.region, size: w.size, sizeVars, residency: w.residency, provider: w.provider },
    });
    n++;
  }
  if (n > 0) logger.info({ n }, 'sapma taraması planlandı');
  return n;
}

export async function applyDriftResult(r: z.infer<typeof driftResultSchema>) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, r.workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const [row] = await db.insert(driftReports).values({ workloadId: w.id, runId: r.runId ?? null, diff: r.diff, hasDrift: r.hasDrift }).returning();
  if (r.hasDrift) {
    await notifyStaff(
      { kind: 'system', title: `Yapılandırma sapması: ${w.slug}`, body: `${r.diff.change} değişecek, ${r.diff.destroy} silinecek, ${r.diff.replace} yeniden yaratılacak. Üretime elle müdahale edilmiş olabilir.`, link: `/sapmalar` },
      'senior',
    );
    await audit({ actorType: 'system', tenantId: w.tenantId, action: 'drift.detected', subjectType: 'workload', subjectId: w.id, after: r.diff });
  }
  return row!;
}

export async function listDrift(opts: { unacknowledgedOnly?: boolean } = {}) {
  const where = [eq(driftReports.hasDrift, true)];
  if (opts.unacknowledgedOnly) where.push(isNull(driftReports.acknowledgedBy));
  return db
    .select({ drift: driftReports, workloadName: workloads.name, workloadSlug: workloads.slug, tenantId: workloads.tenantId })
    .from(driftReports)
    .innerJoin(workloads, eq(workloads.id, driftReports.workloadId))
    .where(and(...where))
    .orderBy(desc(driftReports.createdAt))
    .limit(100);
}

export async function acknowledgeDrift(id: string, staffId: string) {
  const [row] = await db.update(driftReports).set({ acknowledgedBy: staffId, acknowledgedAt: new Date() }).where(eq(driftReports.id, id)).returning();
  if (!row) throw ApiError.notFound();
  await audit({ actorType: 'staff', actorId: staffId, action: 'drift.acknowledge', subjectType: 'drift_report', subjectId: id });
  return row;
}
