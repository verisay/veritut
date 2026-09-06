import { and, count, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { creditPctFor } from '@veritut/types';
import { db } from '../db/db.js';
import { components, incidentWorkloads, incidents, probeResults, slaPeriods, slaTiers, tenantSubscriptions, tenants, workloads } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import { recordUsage } from './billing.service.js';
import { maintenanceMinutes } from './incident.service.js';
import { notifyTenant } from './notification.service.js';
import { dispatchChannels } from './channel.service.js';
import { audit } from './audit.service.js';

/**
 * SLA motoru (plan §8.2): uptime = probe sonuçları − planlı bakım; hedefin altında kredi
 * TALEP EDİLMEDEN hesaplanır ve faturaya negatif kalem olarak düşer.
 */
function periodRange(period: string): { start: Date; end: Date } {
  const start = new Date(`${period}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end: end > new Date() ? new Date() : end };
}

export async function computeSlaPeriod(period: string, onlyTenantId?: string) {
  const { start, end } = periodRange(period);
  const rows = await db
    .select({ id: workloads.id, tenantId: workloads.tenantId, name: workloads.name, slaTier: workloads.slaTier, currency: tenantSubscriptions.currency, monthly: tenantSubscriptions.monthly })
    .from(workloads)
    .leftJoin(tenantSubscriptions, and(eq(tenantSubscriptions.workloadId, workloads.id), ne(tenantSubscriptions.status, 'cancelled')))
    .where(and(ne(workloads.status, 'destroyed'), onlyTenantId ? eq(workloads.tenantId, onlyTenantId) : sql`true`));
  let computed = 0;
  let credited = 0;
  for (const w of rows) {
    const [comp] = await db.select({ id: components.id }).from(components).where(eq(components.workloadId, w.id)).limit(1);
    const [tier] = await db.select().from(slaTiers).where(eq(slaTiers.code, w.slaTier)).limit(1);
    const target = Number(tier?.uptimeTarget ?? 99.5);
    let uptime = 100;
    let downtimeMin = 0;
    if (comp) {
      const [agg] = await db
        .select({ total: count(), bad: sql<number>`count(*) FILTER (WHERE ${probeResults.state} = 'down')::int` })
        .from(probeResults)
        .where(and(eq(probeResults.componentId, comp.id), gte(probeResults.checkedAt, start), lt(probeResults.checkedAt, end)));
      const total = agg?.total ?? 0;
      if (total > 0) {
        const bad = agg?.bad ?? 0;
        const spanMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
        downtimeMin = Math.round((bad / total) * spanMin);
        const maintMin = await maintenanceMinutes(period, w.id, w.tenantId);
        const effectiveDown = Math.max(0, downtimeMin - maintMin);
        uptime = Math.round(((spanMin - effectiveDown) / spanMin) * 100000) / 1000;
      }
    }
    const [inc] = await db
      .select({ n: sql<number>`count(*)::int`, resp: sql<number>`count(*) FILTER (WHERE ${incidents.responseBreached})::int`, res: sql<number>`count(*) FILTER (WHERE ${incidents.resolveBreached})::int` })
      .from(incidents)
      .innerJoin(incidentWorkloads, eq(incidentWorkloads.incidentId, incidents.id))
      .where(and(eq(incidentWorkloads.workloadId, w.id), gte(incidents.createdAt, start), lt(incidents.createdAt, end)));
    const creditPct = creditPctFor(uptime, target);
    const monthly = Number(w.monthly ?? 0);
    const creditAmount = Math.round(((monthly * creditPct) / 100) * 100) / 100;
    const maintMin = await maintenanceMinutes(period, w.id, w.tenantId);
    const values = {
      tenantId: w.tenantId,
      workloadId: w.id,
      period,
      slaCode: w.slaTier,
      uptimePct: String(uptime),
      uptimeTarget: String(target),
      downtimeMin,
      maintenanceMin: maintMin,
      incidents: inc?.n ?? 0,
      responseBreaches: inc?.resp ?? 0,
      resolveBreaches: inc?.res ?? 0,
      creditPct: String(creditPct),
      creditAmount: String(creditAmount),
      currency: w.currency ?? 'TRY',
      computedAt: new Date(),
    };
    await db.insert(slaPeriods).values(values).onConflictDoUpdate({ target: [slaPeriods.tenantId, slaPeriods.workloadId, slaPeriods.period], set: values });
    computed++;
    if (creditAmount > 0) credited++;
  }
  logger.info({ period, computed, credited }, 'SLA dönemi hesaplandı');
  return { period, computed, credited };
}

/** Kredileri faturaya negatif kalem olarak işler (bir kez; `credit_applied_at` ile idempotent). */
export async function applyCredits(period: string): Promise<number> {
  const rows = await db.select().from(slaPeriods).where(and(eq(slaPeriods.period, period), sql`${slaPeriods.creditAmount} > 0`, sql`${slaPeriods.creditAppliedAt} IS NULL`));
  for (const r of rows) {
    await recordUsage({ tenantId: r.tenantId, workloadId: r.workloadId, period, metric: 'sla_credit', qty: 1, currency: r.currency, amount: -Number(r.creditAmount), note: `SLA kredisi · uptime %${r.uptimePct} (hedef %${r.uptimeTarget})` });
    await db.update(slaPeriods).set({ creditAppliedAt: new Date() }).where(eq(slaPeriods.id, r.id));
    await notifyTenant(r.tenantId, ['owner', 'billing'], { kind: 'system', title: 'SLA kredisi hesabınıza işlendi', body: `${period} döneminde uptime hedefin altında kaldı (%${r.uptimePct} / hedef %${r.uptimeTarget}). Kredi talebinize gerek yok, faturanıza yansıdı.`, link: '/panel/faturalar' });
    await dispatchChannels(r.tenantId, 'sla.breach', { period, uptimePct: Number(r.uptimePct), target: Number(r.uptimeTarget), creditAmount: Number(r.creditAmount) });
    await audit({ actorType: 'system', tenantId: r.tenantId, action: 'sla.credit', subjectType: 'sla_period', subjectId: r.id, after: { period, creditAmount: r.creditAmount } });
  }
  return rows.length;
}

export async function listSlaPeriods(opts: { tenantId?: string; period?: string } = {}) {
  const where = [];
  if (opts.tenantId) where.push(eq(slaPeriods.tenantId, opts.tenantId));
  if (opts.period) where.push(eq(slaPeriods.period, opts.period));
  return db
    .select({ sla: slaPeriods, workloadName: workloads.name, workloadSlug: workloads.slug, tenantName: tenants.name })
    .from(slaPeriods)
    .leftJoin(workloads, eq(workloads.id, slaPeriods.workloadId))
    .leftJoin(tenants, eq(tenants.id, slaPeriods.tenantId))
    .where(where.length ? and(...where) : sql`true`)
    .orderBy(sql`${slaPeriods.period} desc`)
    .limit(200);
}

export async function slaBreachCount(period: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${slaPeriods.responseBreaches} + ${slaPeriods.resolveBreaches}),0)::int` }).from(slaPeriods).where(eq(slaPeriods.period, period));
  return row?.n ?? 0;
}

export { inArray };
