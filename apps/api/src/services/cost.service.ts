import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/db.js';
import { costAllocations, fxRates, providerCostLines, providerInventory, tenants, workloadRevenue, workloads } from '../db/schema/index.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { allocateLine } from './provider.service.js';

/** Marj eşiği (stratejik §9 risk 1): altı ops bayrağı. */
export const MARGIN_FLAG_PCT = 35;

export async function upsertRevenue(workloadId: string, r: { period: string; amount: number; currency: string; note?: string | null }, staffId: string) {
  const [w] = await db.select({ id: workloads.id, tenantId: workloads.tenantId }).from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const [row] = await db
    .insert(workloadRevenue)
    .values({ workloadId, period: r.period, amount: String(r.amount), currency: r.currency, note: r.note ?? null, enteredBy: staffId })
    .onConflictDoUpdate({ target: [workloadRevenue.workloadId, workloadRevenue.period], set: { amount: String(r.amount), currency: r.currency, note: r.note ?? null, enteredBy: staffId } })
    .returning();
  await audit({ actorType: 'staff', actorId: staffId, tenantId: w.tenantId, action: 'revenue.upsert', subjectType: 'workload', subjectId: workloadId, after: r });
  return row!;
}

export async function upsertFx(period: string, currency: string, toTry: number) {
  await db.insert(fxRates).values({ period, currency, toTry: String(toTry) }).onConflictDoUpdate({ target: [fxRates.period, fxRates.currency], set: { toTry: String(toTry) } });
}

/**
 * Fatura CSV (Hetzner ve benzeri): başlık esnek — `resource|resource_ref|id`, `description|name`, `amount|total|price`, `currency`.
 * Satırlar `source=invoice_csv` olur; envanter external_id ile eşleşirse iş yüküne DİREKT tahsis, aynı dönemin tahmini tahsisi silinir.
 */
export async function importInvoiceCsv(providerAccountId: string, period: string, csv: string, staffId: string) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = (lines.shift() ?? '').split(/[,;]/).map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iRef = idx(['resource', 'resource_ref', 'id', 'server', 'product_id']);
  const iDesc = idx(['description', 'name', 'product']);
  const iAmt = idx(['amount', 'total', 'price', 'net', 'sum']);
  const iCur = idx(['currency']);
  if (iRef < 0 || iAmt < 0) throw ApiError.badRequest('CSV başlığında kaynak ve tutar sütunu bulunamadı');
  const inv = await db.select({ externalId: providerInventory.externalId, matched: providerInventory.matchedWorkloadId }).from(providerInventory).where(eq(providerInventory.providerAccountId, providerAccountId));
  const invMap = new Map(inv.map((i) => [i.externalId, i.matched]));
  let n = 0, allocated = 0, total = 0;
  for (const raw of lines) {
    const cols = raw.split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const ref = cols[iRef] ?? ''; const amt = Number((cols[iAmt] ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!ref || !Number.isFinite(amt)) continue;
    const currency = (iCur >= 0 ? cols[iCur] : '') || 'EUR';
    const [line] = await db
      .insert(providerCostLines)
      .values({ providerAccountId, period, resourceRef: ref, description: iDesc >= 0 ? (cols[iDesc] ?? '') : '', amount: String(amt), currency, source: 'invoice_csv', raw: { cols } })
      .onConflictDoUpdate({ target: [providerCostLines.providerAccountId, providerCostLines.period, providerCostLines.resourceRef, providerCostLines.source], set: { amount: String(amt), description: iDesc >= 0 ? (cols[iDesc] ?? '') : '', currency } })
      .returning({ id: providerCostLines.id });
    n++; total += amt;
    const matched = invMap.get(ref);
    if (matched && line) {
      // Fatura gerçek maliyettir: aynı dönemin tahmini tahsisini kaldır, direkt tahsis yaz.
      await db.execute(sql`DELETE FROM cost_allocations ca USING provider_cost_lines l WHERE ca.source_line_id = l.id AND ca.workload_id = ${matched} AND ca.period = ${period} AND l.source = 'estimate' AND l.resource_ref = ${ref}`);
      await allocateLine(matched, period, line.id, amt, currency, 'direct');
      allocated++;
    }
  }
  await audit({ actorType: 'staff', actorId: staffId, action: 'cost.import_invoice_csv', subjectType: 'provider_account', subjectId: providerAccountId, after: { period, lines: n, allocated, total } });
  return { lines: n, allocated, total };
}

export interface MarginRow {
  tenantId: string; tenantName: string; workloadId: string; workloadName: string; productSlug: string; providerCode: string | null;
  revenue: number | null; revenueCurrency: string | null; cost: number; costCurrency: string | null; costMethod: 'direct' | 'estimate' | 'mixed' | 'none';
  marginPct: number | null; flag: 'ok' | 'low' | 'no_revenue' | 'fx_missing' | 'no_cost';
}

/** Marj raporu (K1 kabul): iş yükü bazında gelir − maliyet. Para birimi farklıysa `fx_rates` (TRY'ye) kullanılır, yoksa `fx_missing`. */
export async function marginReport(period: string): Promise<{ period: string; rows: MarginRow[]; totals: { revenueTry: number; costTry: number; marginPct: number | null; flagged: number } }> {
  const ws = await db
    .select({ id: workloads.id, name: workloads.name, productSlug: workloads.productSlug, providerCode: workloads.providerCode, tenantId: tenants.id, tenantName: tenants.name })
    .from(workloads)
    .innerJoin(tenants, eq(tenants.id, workloads.tenantId))
    .where(sql`${workloads.status} <> 'destroyed'`)
    .orderBy(tenants.name, workloads.name);
  const ids = ws.map((w) => w.id);
  if (ids.length === 0) return { period, rows: [], totals: { revenueTry: 0, costTry: 0, marginPct: null, flagged: 0 } };
  const [rev, cost, fx] = await Promise.all([
    db.select().from(workloadRevenue).where(and(inArray(workloadRevenue.workloadId, ids), eq(workloadRevenue.period, period))),
    db.select({ workloadId: costAllocations.workloadId, amount: costAllocations.amount, currency: costAllocations.currency, method: costAllocations.method }).from(costAllocations).where(and(inArray(costAllocations.workloadId, ids), eq(costAllocations.period, period))),
    db.select().from(fxRates).where(eq(fxRates.period, period)),
  ]);
  const rate = (cur: string): number | null => (cur === 'TRY' ? 1 : (fx.find((f) => f.currency === cur) ? Number(fx.find((f) => f.currency === cur)!.toTry) : null));
  let revenueTry = 0, costTry = 0, flagged = 0;
  const rows: MarginRow[] = ws.map((w) => {
    const r = rev.find((x) => x.workloadId === w.id);
    const cs = cost.filter((c) => c.workloadId === w.id);
    const costSum = cs.reduce((s, c) => s + Number(c.amount), 0);
    const costCurrency = cs[0]?.currency ?? null;
    const methods = new Set(cs.map((c) => c.method));
    const costMethod: MarginRow['costMethod'] = cs.length === 0 ? 'none' : methods.size > 1 ? 'mixed' : methods.has('direct') ? 'direct' : 'estimate';
    let marginPct: number | null = null; let flag: MarginRow['flag'] = 'ok';
    if (!r) flag = 'no_revenue';
    else if (cs.length === 0) flag = 'no_cost';
    else if (r.currency === costCurrency) { marginPct = Number(r.amount) > 0 ? Math.round(((Number(r.amount) - costSum) / Number(r.amount)) * 1000) / 10 : null; }
    else {
      const rr = rate(r.currency), rc = rate(costCurrency!);
      if (rr === null || rc === null) flag = 'fx_missing';
      else { const revT = Number(r.amount) * rr, costT = costSum * rc; marginPct = revT > 0 ? Math.round(((revT - costT) / revT) * 1000) / 10 : null; }
    }
    if (flag === 'ok' && marginPct !== null && marginPct < MARGIN_FLAG_PCT) flag = 'low';
    if (flag !== 'ok') flagged++;
    if (r) { const rr = rate(r.currency); if (rr !== null) revenueTry += Number(r.amount) * rr; }
    if (costCurrency) { const rc = rate(costCurrency); if (rc !== null) costTry += costSum * rc; }
    return { tenantId: w.tenantId, tenantName: w.tenantName, workloadId: w.id, workloadName: w.name, productSlug: w.productSlug, providerCode: w.providerCode, revenue: r ? Number(r.amount) : null, revenueCurrency: r?.currency ?? null, cost: Math.round(costSum * 100) / 100, costCurrency, costMethod, marginPct, flag };
  });
  return { period, rows, totals: { revenueTry: Math.round(revenueTry * 100) / 100, costTry: Math.round(costTry * 100) / 100, marginPct: revenueTry > 0 ? Math.round(((revenueTry - costTry) / revenueTry) * 1000) / 10 : null, flagged } };
}
