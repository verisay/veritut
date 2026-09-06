import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { subscriptionMachine, transition, workloadMachine, type SubscriptionStatus, type UsageMetric, type WorkloadStatus } from '@veritut/types';
import type { z } from 'zod';
import type { billingWebhookSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { invoices, tenantSubscriptions, tenants, usageRecords, users, workloads } from '../db/schema/index.js';
import { createBillingProvider, type UsageLine } from '../providers/billing/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { invalidateFeatures } from './entitlement.service.js';
import { notifyTenant } from './notification.service.js';

/** D17: Core ölçer ve aynayı gösterir; fatura kesme/tahsilat omurgadadır. */

export async function ensureCustomer(tenantId: string): Promise<string> {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw ApiError.notFound('Kiracı bulunamadı');
  if (t.billingRef) return t.billingRef;
  const [owner] = await db
    .select({ email: users.email, name: users.displayName })
    .from(users)
    .innerJoin(sql`tenant_members tm`, sql`tm.user_id = ${users.id} AND tm.tenant_id = ${tenantId} AND tm.role = 'owner'`)
    .limit(1);
  const ref = await createBillingProvider().syncCustomer({ tenantId, tenantSlug: t.slug, name: t.name, email: owner?.email ?? `${t.slug}@veritut.local` });
  await db.update(tenants).set({ billingRef: ref }).where(eq(tenants.id, tenantId));
  return ref;
}

export async function recordUsage(r: { tenantId: string; workloadId?: string | null; period: string; metric: UsageMetric; qty: number; unit?: string; currency: string; amount: number; note?: string | null }) {
  const [row] = await db
    .insert(usageRecords)
    .values({ tenantId: r.tenantId, workloadId: r.workloadId ?? null, period: r.period, metric: r.metric, qty: String(r.qty), unit: r.unit ?? 'month', currency: r.currency, amount: String(r.amount), note: r.note ?? null })
    .onConflictDoUpdate({ target: [usageRecords.tenantId, usageRecords.period, usageRecords.metric, usageRecords.workloadId], set: { qty: String(r.qty), amount: String(r.amount), note: r.note ?? null } })
    .returning();
  return row!;
}

export async function listUsage(tenantId: string, period: string) {
  return db.select().from(usageRecords).where(and(eq(usageRecords.tenantId, tenantId), eq(usageRecords.period, period)));
}

/**
 * Dönem kapanışı: gönderilmemiş kalemler kiracı bazında omurgaya gider → fatura.
 * Idempotens: `<tenantId>:<period>`; aynı dönem iki kez fatura üretmez.
 */
export async function pushPeriod(period: string, onlyTenantId?: string): Promise<{ tenants: number; invoices: number }> {
  const provider = createBillingProvider();
  const rows = await db
    .select()
    .from(usageRecords)
    .where(and(eq(usageRecords.period, period), isNull(usageRecords.pushedAt), onlyTenantId ? eq(usageRecords.tenantId, onlyTenantId) : sql`true`));
  const byTenant = new Map<string, typeof rows>();
  for (const r of rows) byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r]);
  let invoiceCount = 0;
  for (const [tenantId, items] of byTenant) {
    const customerRef = await ensureCustomer(tenantId);
    const lines: UsageLine[] = items.map((i) => ({ title: i.note ?? i.metric, qty: Number(i.qty), unitAmount: Number(i.qty) === 0 ? 0 : Math.round((Number(i.amount) / Number(i.qty)) * 100) / 100, amount: Number(i.amount), currency: i.currency, metric: i.metric, workloadId: i.workloadId }));
    if (lines.every((l) => l.amount === 0)) {
      await db.update(usageRecords).set({ pushedAt: new Date(), billingRef: 'zero' }).where(and(eq(usageRecords.tenantId, tenantId), eq(usageRecords.period, period), isNull(usageRecords.pushedAt)));
      continue;
    }
    try {
      const res = await provider.pushUsage(customerRef, period, lines, `${tenantId}:${period}`);
      await db.update(usageRecords).set({ pushedAt: new Date(), billingRef: res.billingRef }).where(and(eq(usageRecords.tenantId, tenantId), eq(usageRecords.period, period), isNull(usageRecords.pushedAt)));
      // Ayna: gerçek omurgada webhook da gelir; aynı kod yolu (upsert) iki kez çalışsa da idempotent.
      await applyBillingEvent({
        event: 'invoice.created',
        tenantRef: customerRef,
        invoice: { billingRef: res.billingRef, number: res.invoiceNumber, status: res.status, currency: res.currency as 'TRY' | 'EUR' | 'USD', total: res.total, issuedAt: new Date().toISOString(), dueAt: res.dueAt, payUrl: res.payUrl, lines: lines.map((l) => ({ title: l.title, qty: l.qty, amount: l.amount })) },
      });
      invoiceCount++;
    } catch (err) {
      logger.error({ err, tenantId, period }, 'fatura gönderimi başarısız');
    }
  }
  return { tenants: byTenant.size, invoices: invoiceCount };
}

async function tenantByBillingRef(ref: string): Promise<string | null> {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.billingRef, ref)).limit(1);
  return t?.id ?? null;
}

async function setSubscriptionStatus(subId: string, to: SubscriptionStatus) {
  const [cur] = await db.select({ status: tenantSubscriptions.status, tenantId: tenantSubscriptions.tenantId, workloadId: tenantSubscriptions.workloadId }).from(tenantSubscriptions).where(eq(tenantSubscriptions.id, subId)).limit(1);
  if (!cur) return;
  if (cur.status === to) return;
  const next = transition(subscriptionMachine, cur.status as SubscriptionStatus, to);
  await db.update(tenantSubscriptions).set({ status: next, cancelledAt: next === 'cancelled' ? new Date() : null }).where(eq(tenantSubscriptions.id, subId));
  await invalidateFeatures(cur.tenantId);
  // Askıya alma faturalama sinyalidir: iş yükü durur, VERİ SİLİNMEZ (plan §5).
  if (cur.workloadId && (next === 'suspended' || next === 'active')) {
    const [w] = await db.select({ status: workloads.status }).from(workloads).where(eq(workloads.id, cur.workloadId)).limit(1);
    if (w) {
      const target: WorkloadStatus = next === 'suspended' ? 'suspended' : 'active';
      try {
        const ws = transition(workloadMachine, w.status as WorkloadStatus, target);
        await db.update(workloads).set({ status: ws }).where(eq(workloads.id, cur.workloadId));
      } catch {
        /* geçersiz geçiş (ör. destroyed) — yok say */
      }
    }
  }
}

/** Kanonik billing olayı → fatura aynası + abonelik makinesi. Webhook ve push aynı yolu kullanır. */
export async function applyBillingEvent(e: z.infer<typeof billingWebhookSchema>) {
  const tenantId = await tenantByBillingRef(e.tenantRef);
  if (!tenantId) {
    logger.warn({ tenantRef: e.tenantRef }, 'billing olayı: kiracı eşleşmedi');
    return { ok: false };
  }
  if (e.invoice) {
    const inv = e.invoice;
    await db
      .insert(invoices)
      .values({ tenantId, billingRef: inv.billingRef, number: inv.number, status: inv.status, currency: inv.currency, total: String(inv.total), issuedAt: inv.issuedAt ? new Date(inv.issuedAt) : null, dueAt: inv.dueAt ? new Date(inv.dueAt) : null, paidAt: inv.paidAt ? new Date(inv.paidAt) : null, payUrl: inv.payUrl ?? null, lines: inv.lines })
      .onConflictDoUpdate({ target: invoices.billingRef, set: { number: inv.number, status: inv.status, total: String(inv.total), paidAt: inv.paidAt ? new Date(inv.paidAt) : inv.status === 'paid' ? new Date() : null, payUrl: inv.payUrl ?? null, lines: inv.lines } });
  }
  const subs = await db.select({ id: tenantSubscriptions.id }).from(tenantSubscriptions).where(and(eq(tenantSubscriptions.tenantId, tenantId), sql`${tenantSubscriptions.status} <> 'cancelled'`));
  if (e.event === 'invoice.paid') {
    for (const s of subs) await setSubscriptionStatus(s.id, 'active');
    await notifyTenant(tenantId, ['owner', 'billing'], { kind: 'system', title: 'Ödemeniz alındı', body: 'Faturanız ödendi olarak işaretlendi.', link: '/panel/faturalar' });
  } else if (e.event === 'invoice.overdue') {
    for (const s of subs) await setSubscriptionStatus(s.id, 'past_due');
    await notifyTenant(tenantId, ['owner', 'billing'], { kind: 'system', title: 'Faturanızın vadesi geçti', body: 'Hizmetin kesintisiz sürmesi için ödemeyi tamamlayın.', link: '/panel/faturalar' });
  } else if (e.event === 'subscription.cancelled') {
    for (const s of subs) await setSubscriptionStatus(s.id, 'cancelled');
  }
  await audit({ actorType: 'system', tenantId, action: `billing.${e.event}`, subjectType: 'invoice', subjectId: e.invoice?.billingRef ?? undefined });
  return { ok: true };
}

export async function listInvoices(tenantId: string) {
  return db.select().from(invoices).where(eq(invoices.tenantId, tenantId)).orderBy(desc(invoices.createdAt)).limit(50);
}

export async function listSubscriptions(tenantId: string) {
  return db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId)).orderBy(desc(tenantSubscriptions.createdAt));
}

export async function createSubscription(o: { tenantId: string; workloadId: string; planCode: string; slaCode: string; currency: string; monthly: number; trialDays: number }) {
  const [row] = await db
    .insert(tenantSubscriptions)
    .values({
      tenantId: o.tenantId,
      workloadId: o.workloadId,
      planCode: o.planCode,
      slaCode: o.slaCode,
      status: o.trialDays > 0 ? 'trialing' : 'active',
      currency: o.currency,
      monthly: String(o.monthly),
      periodStart: new Date().toISOString().slice(0, 10),
      trialEndsAt: o.trialDays > 0 ? new Date(Date.now() + o.trialDays * 86400_000) : null,
    })
    .returning();
  await invalidateFeatures(o.tenantId);
  return row!;
}

/** Deneme bitişi: abonelik askıya alınır, iş yükü durur; 7 gün sonra yıkım adayı (cron). */
export async function expireTrials(): Promise<number> {
  const rows = await db
    .select({ id: tenantSubscriptions.id, tenantId: tenantSubscriptions.tenantId, workloadId: tenantSubscriptions.workloadId })
    .from(tenantSubscriptions)
    .where(and(eq(tenantSubscriptions.status, 'trialing'), sql`${tenantSubscriptions.trialEndsAt} < now()`));
  for (const r of rows) {
    await setSubscriptionStatus(r.id, 'suspended');
    await notifyTenant(r.tenantId, ['owner', 'admin'], { kind: 'system', title: 'Deneme süreniz doldu', body: 'İş yükünüz durduruldu, veriniz duruyor. Planı başlatırsanız kaldığı yerden devam eder. 7 gün sonra kaynaklar kaldırılır.', link: '/panel/faturalar' });
  }
  return rows.length;
}
