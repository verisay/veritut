import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { computeConcentration, type ProviderCode } from '@veritut/types';
import type { CreateProviderAccountInput, InventoryReport } from '@veritut/validators';
import { db } from '../db/db.js';
import { costAllocations, providerAccounts, providerCostLines, providerInventory, providers, workloads } from '../db/schema/index.js';
import { env } from '../config/env.js';
import { seal } from '../lib/seal.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { createRun } from './run.service.js';
import { notifyStaff } from './notification.service.js';

/** Tedarikçi hesapları — kimlik bilgisi mühürlü (D12); liste/detay asla `credentials_sealed` döndürmez. */
const publicCols = {
  id: providerAccounts.id,
  providerCode: providerAccounts.providerCode,
  label: providerAccounts.label,
  keyVersion: providerAccounts.keyVersion,
  regions: providerAccounts.regions,
  residencies: providerAccounts.residencies,
  quota: providerAccounts.quota,
  health: providerAccounts.health,
  lastSyncAt: providerAccounts.lastSyncAt,
  active: providerAccounts.active,
  createdAt: providerAccounts.createdAt,
  hasCredentials: sql<boolean>`${providerAccounts.credentialsSealed} IS NOT NULL`,
};

export async function createProviderAccount(input: CreateProviderAccountInput, staffId: string, ip: string | null) {
  const [p] = await db.select().from(providers).where(eq(providers.code, input.providerCode)).limit(1);
  if (!p || !p.active) throw ApiError.badRequest('Tedarikçi aktif değil');
  const sealed = seal(JSON.stringify(input.credentials), env.RUNNER_PUBLIC_KEY);
  const [row] = await db
    .insert(providerAccounts)
    .values({ providerCode: input.providerCode, label: input.label, credentialsSealed: sealed, regions: input.regions, residencies: input.residencies })
    .returning(publicCols);
  await audit({ actorType: 'staff', actorId: staffId, action: 'provider_account.create', subjectType: 'provider_account', subjectId: row!.id, after: { providerCode: input.providerCode, label: input.label, credentialKeys: Object.keys(input.credentials) }, ip });
  return row!;
}

export async function listProviderAccounts() {
  const rows = await db.select(publicCols).from(providerAccounts).orderBy(providerAccounts.providerCode, providerAccounts.createdAt);
  // ≥2 hesap politikası (plan §4.3): tek hesaplı tedarikçi uyarısı
  const byProvider = new Map<string, number>();
  for (const r of rows) if (r.active) byProvider.set(r.providerCode, (byProvider.get(r.providerCode) ?? 0) + 1);
  const singleAccountProviders = [...byProvider.entries()].filter(([code, n]) => n < 2 && code !== 'mock').map(([code]) => code);
  return { accounts: rows, singleAccountProviders };
}

export async function getProviderAccount(id: string) {
  const [row] = await db.select(publicCols).from(providerAccounts).where(eq(providerAccounts.id, id)).limit(1);
  if (!row) throw ApiError.notFound('Tedarikçi hesabı bulunamadı');
  return row;
}

export async function triggerProviderSync(id: string, staffId: string | null) {
  const acc = await getProviderAccount(id);
  if (!acc.hasCredentials) throw ApiError.badRequest('Hesabın kimlik bilgisi yok');
  return createRun({ kind: 'provider-sync', staffId, providerAccountId: id, payload: { providerCode: acc.providerCode } });
}

export async function listSyncableAccounts() {
  return db.select({ id: providerAccounts.id }).from(providerAccounts).where(and(eq(providerAccounts.active, true), sql`${providerAccounts.credentialsSealed} IS NOT NULL`));
}

/** Runner envanter raporu: upsert + görünmeyeni `gone` işaretle + tahmini maliyet satırları + eşlenmiş iş yüküne tahsis. */
export async function applyInventoryReport(accountId: string, report: InventoryReport) {
  const acc = await getProviderAccount(accountId);
  const seen = new Set<string>();
  let inserted = 0;
  for (const it of report.items) {
    seen.add(it.externalId);
    const [row] = await db
      .insert(providerInventory)
      .values({
        providerAccountId: accountId,
        externalId: it.externalId,
        kind: it.kind,
        name: it.name,
        region: it.region,
        residency: it.residency,
        status: it.status,
        specs: it.specs,
        tags: it.tags,
        monthlyCostEstimate: it.monthlyCostEstimate === null ? null : String(it.monthlyCostEstimate),
        currency: it.currency,
        lastSeenAt: new Date(),
        goneAt: null,
      })
      .onConflictDoUpdate({
        target: [providerInventory.providerAccountId, providerInventory.externalId],
        set: {
          name: it.name,
          region: it.region,
          residency: it.residency,
          status: it.status,
          specs: it.specs,
          tags: it.tags,
          monthlyCostEstimate: it.monthlyCostEstimate === null ? null : String(it.monthlyCostEstimate),
          currency: it.currency,
          lastSeenAt: new Date(),
          goneAt: null,
        },
      })
      .returning({ id: providerInventory.id, matched: providerInventory.matchedWorkloadId, firstSeen: providerInventory.firstSeenAt });
    if (row && Math.abs(row.firstSeen.getTime() - Date.now()) < 5000) inserted++;
    if (it.monthlyCostEstimate !== null) {
      const [line] = await db
        .insert(providerCostLines)
        .values({ providerAccountId: accountId, period: report.period, resourceRef: it.externalId, description: `${it.kind} ${it.name}`, amount: String(it.monthlyCostEstimate), currency: it.currency, source: 'estimate', raw: { specs: it.specs } })
        .onConflictDoUpdate({
          target: [providerCostLines.providerAccountId, providerCostLines.period, providerCostLines.resourceRef, providerCostLines.source],
          set: { amount: String(it.monthlyCostEstimate), description: `${it.kind} ${it.name}`, currency: it.currency },
        })
        .returning({ id: providerCostLines.id });
      if (row?.matched && line) await allocateLine(row.matched, report.period, line.id, it.monthlyCostEstimate, it.currency, 'estimate');
    }
  }
  // Raporda görünmeyenler: gone
  const gone = await db
    .update(providerInventory)
    .set({ goneAt: new Date() })
    .where(and(eq(providerInventory.providerAccountId, accountId), isNull(providerInventory.goneAt), sql`${providerInventory.externalId} <> ALL(${sql.raw(`ARRAY[${[...seen].map((s) => `'${s.replace(/'/g, "''")}'`).join(',') || "''"}]::text[]`)})`))
    .returning({ id: providerInventory.id });
  await db.update(providerAccounts).set({ lastSyncAt: new Date(), health: 'ok' }).where(eq(providerAccounts.id, accountId));
  await checkConcentration();
  return { total: report.items.length, inserted, gone: gone.length, account: acc.label };
}

export async function allocateLine(workloadId: string, period: string, lineId: string, amount: number, currency: string, method: 'direct' | 'shared' | 'estimate') {
  await db
    .insert(costAllocations)
    .values({ workloadId, period, amount: String(amount), currency, method, sourceLineId: lineId })
    .onConflictDoUpdate({ target: [costAllocations.workloadId, costAllocations.period, costAllocations.sourceLineId], set: { amount: String(amount), currency, method } });
}

/** Tedarikçi yoğunlaşması (%60 kuralı, D25) — aktif iş yükleri üzerinden; eşik aşımı ops bildirimi. */
export async function checkConcentration(): Promise<void> {
  const rows = await db.select({ p: workloads.providerCode }).from(workloads).where(and(sql`${workloads.providerCode} IS NOT NULL`, sql`${workloads.status} IN ('active','degraded','provisioning')`));
  const report = computeConcentration(rows.map((r) => r.p as ProviderCode));
  if (report.overThreshold.length > 0 && report.total >= 5) {
    await notifyStaff({ kind: 'provider.concentration', title: `Tedarikçi yoğunlaşması: ${report.overThreshold.join(', ')} > %60`, body: `${report.total} aktif iş yükünün çoğu tek tedarikçide. Çıkış planını gözden geçirin.`, link: '/tedarikciler' }, 'senior');
  }
}

export async function listInventory(opts: { unmatchedOnly?: boolean; accountId?: string }) {
  const where = [isNull(providerInventory.goneAt)];
  if (opts.unmatchedOnly) where.push(isNull(providerInventory.matchedWorkloadId));
  if (opts.accountId) where.push(eq(providerInventory.providerAccountId, opts.accountId));
  return db
    .select({
      id: providerInventory.id,
      providerAccountId: providerInventory.providerAccountId,
      accountLabel: providerAccounts.label,
      providerCode: providerAccounts.providerCode,
      externalId: providerInventory.externalId,
      kind: providerInventory.kind,
      name: providerInventory.name,
      region: providerInventory.region,
      residency: providerInventory.residency,
      status: providerInventory.status,
      specs: providerInventory.specs,
      monthlyCostEstimate: providerInventory.monthlyCostEstimate,
      currency: providerInventory.currency,
      matchedWorkloadId: providerInventory.matchedWorkloadId,
      matchedWorkloadName: workloads.name,
      firstSeenAt: providerInventory.firstSeenAt,
      lastSeenAt: providerInventory.lastSeenAt,
    })
    .from(providerInventory)
    .innerJoin(providerAccounts, eq(providerAccounts.id, providerInventory.providerAccountId))
    .leftJoin(workloads, eq(workloads.id, providerInventory.matchedWorkloadId))
    .where(and(...where))
    .orderBy(desc(providerInventory.firstSeenAt));
}

export async function matchInventory(itemId: string, workloadId: string, staffId: string) {
  const [item] = await db.select().from(providerInventory).where(eq(providerInventory.id, itemId)).limit(1);
  if (!item) throw ApiError.notFound('Envanter kalemi bulunamadı');
  const [w] = await db.select({ id: workloads.id }).from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  await db.update(providerInventory).set({ matchedWorkloadId: workloadId }).where(eq(providerInventory.id, itemId));
  // Bu dönemin tahmini satırını iş yüküne tahsis et
  const period = new Date().toISOString().slice(0, 7);
  const [line] = await db.select().from(providerCostLines).where(and(eq(providerCostLines.providerAccountId, item.providerAccountId), eq(providerCostLines.period, period), eq(providerCostLines.resourceRef, item.externalId), eq(providerCostLines.source, 'estimate'))).limit(1);
  if (line) await allocateLine(workloadId, period, line.id, Number(line.amount), line.currency, 'estimate');
  await audit({ actorType: 'staff', actorId: staffId, action: 'inventory.match', subjectType: 'provider_inventory', subjectId: itemId, after: { workloadId } });
  return { ok: true };
}

/** 7 günden eski sahipsiz kaynak → ops bildirimi (cron). */
export async function reportStaleUnmatched(): Promise<number> {
  const rows = await db
    .select({ id: providerInventory.id, name: providerInventory.name, label: providerAccounts.label, cost: providerInventory.monthlyCostEstimate })
    .from(providerInventory)
    .innerJoin(providerAccounts, eq(providerAccounts.id, providerInventory.providerAccountId))
    .where(and(isNull(providerInventory.goneAt), isNull(providerInventory.matchedWorkloadId), sql`${providerInventory.firstSeenAt} < now() - interval '7 days'`));
  if (rows.length > 0) {
    const total = rows.reduce((s, r) => s + Number(r.cost ?? 0), 0);
    await notifyStaff({ kind: 'inventory.unmatched', title: `${rows.length} sahipsiz kaynak 7 günü aştı`, body: `Aylık tahmini maliyet ${total.toFixed(2)}. Eşleyin veya kapatın: ${rows.slice(0, 5).map((r) => `${r.name} (${r.label})`).join(', ')}`, link: '/envanter?sahipsiz=1' });
  }
  return rows.length;
}
