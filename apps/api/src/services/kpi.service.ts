import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/db.js';
import { kpiSnapshots, tenantSubscriptions, tenants, tickets, workloads } from '../db/schema/index.js';
import { marginReport } from './cost.service.js';
import { syncTimeAccounting } from './ticket.service.js';

/**
 * KPI panosu (plan §7.3): MRR, brüt marj, destek dakikası/müşteri, churn, aktif kiracı/iş yükü.
 * MRR = aktif + deneme abonelikleri (deneme 0 tutar); NRR/CAC/LTV K4-K5'te (elle girişle tamamlanır).
 */
export async function computeKpi(period: string) {
  await syncTimeAccounting(period).catch(() => 0);
  const [mrrRow] = await db
    .select({ mrr: sql<string>`coalesce(sum(${tenantSubscriptions.monthly}),0)` })
    .from(tenantSubscriptions)
    .where(sql`${tenantSubscriptions.status} IN ('active','past_due')`);
  const [tenantRow] = await db.select({ n: sql<number>`count(distinct ${tenantSubscriptions.tenantId})::int` }).from(tenantSubscriptions).where(sql`${tenantSubscriptions.status} IN ('trialing','active','past_due')`);
  const [wlRow] = await db.select({ n: sql<number>`count(*)::int` }).from(workloads).where(and(ne(workloads.status, 'destroyed'), ne(workloads.status, 'failed')));
  const [cancelRow] = await db.select({ n: sql<number>`count(*)::int` }).from(tenantSubscriptions).where(and(eq(tenantSubscriptions.status, 'cancelled'), sql`to_char(${tenantSubscriptions.cancelledAt}, 'YYYY-MM') = ${period}`));
  const [ticketRow] = await db.select({ minutes: sql<string>`coalesce(sum(${tickets.minutesSpent}),0)` }).from(tickets).where(sql`to_char(${tickets.createdAt}, 'YYYY-MM') = ${period}`);
  const [activeTenants] = await db.select({ n: sql<number>`count(*)::int` }).from(tenants).where(eq(tenants.status, 'active'));
  const margin = await marginReport(period);
  const customers = Math.max(1, tenantRow?.n ?? 0);
  const churnBase = (tenantRow?.n ?? 0) + (cancelRow?.n ?? 0);
  const values = {
    period,
    mrr: String(Number(mrrRow?.mrr ?? 0)),
    churnPct: churnBase > 0 ? String(Math.round(((cancelRow?.n ?? 0) / churnBase) * 1000) / 10) : null,
    grossMarginPct: margin.totals.marginPct === null ? null : String(margin.totals.marginPct),
    supportMinPerCustomer: String(Math.round((Number(ticketRow?.minutes ?? 0) / customers) * 100) / 100),
    activeTenants: activeTenants?.n ?? 0,
    activeWorkloads: wlRow?.n ?? 0,
    computedAt: new Date(),
  };
  const [row] = await db.insert(kpiSnapshots).values(values).onConflictDoUpdate({ target: kpiSnapshots.period, set: values }).returning();
  return row!;
}

export async function listKpi(limit = 12) {
  return db.select().from(kpiSnapshots).orderBy(sql`${kpiSnapshots.period} desc`).limit(limit);
}
