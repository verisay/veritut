import { and, count, desc, eq, sql } from 'drizzle-orm';
import { orderMachine, transition, type OrderStatus, type ProviderCode, type Residency } from '@veritut/types';
import { compileInputs, type CreateOrderInput } from '@veritut/validators';
import { db } from '../db/db.js';
import { orders, plans, products, tenants, utmAttributions, workloads } from '../db/schema/index.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { getBlueprint } from './blueprint.service.js';
import { getPlan, getProduct, publishedVersion, quote, TRIAL_DAYS } from './catalog.service.js';
import { assertSlaAllowed, assertWorkloadQuota, invalidateFeatures } from './entitlement.service.js';
import { createSubscription, ensureCustomer, pushPeriod, recordUsage } from './billing.service.js';
import { requestProvision } from './provisioning.service.js';
import { notifyTenant } from './notification.service.js';
import { providerAccounts } from '../db/schema/index.js';

/** Self-servis sipariş (K3 kabul: insan dokunmadan). Ops onayı yalnız istisna hâllerde. */

async function pickProviderAccount(providerCodes: string[], residency: Residency) {
  const rows = await db.select().from(providerAccounts).where(and(eq(providerAccounts.active, true), sql`${providerAccounts.credentialsSealed} IS NOT NULL`));
  const usable = rows.filter((a) => providerCodes.includes(a.providerCode) && (a.residencies.length === 0 || a.residencies.includes(residency)));
  return usable[0] ?? null;
}

export async function createOrder(tenantId: string, userId: string, input: CreateOrderInput) {
  const product = await getProduct(input.productSlug);
  if (!product.active) throw new ApiError(422, 'Bu ürün şu an satışa kapalı', 'PRODUCT_INACTIVE');
  const version = await publishedVersion(input.productSlug);
  if (!version) throw new ApiError(422, 'Bu ürün henüz self-servis satışa açık değil', 'PRODUCT_NOT_PUBLISHED');
  if (!product.blueprintSlug) throw new ApiError(422, 'Ürünün teknik tanımı yok', 'PRODUCT_NOT_PUBLISHED');
  const bp = await getBlueprint(product.blueprintSlug, version.blueprintVersion);
  const plan = await getPlan(input.planCode);
  await assertSlaAllowed(tenantId, input.slaCode, plan.code);
  await assertWorkloadQuota(tenantId, plan.code);

  if (!bp.residencies.includes(input.residency)) throw new ApiError(422, `Bu ürün ${input.residency} ikametgâhını desteklemiyor`, 'RESIDENCY_NOT_SUPPORTED');
  if (!bp.sizes.some((s) => s.code === input.size)) throw ApiError.badRequest('Boyut geçersiz');
  const acc = await pickProviderAccount(bp.providers, input.residency);
  if (!acc) throw new ApiError(422, 'Bu ikametgâh için uygun altyapı kapasitesi şu an tanımlı değil', 'NO_PROVIDER_ACCOUNT');
  const regions: string[] = bp.regions[acc.providerCode as ProviderCode] ?? [];
  if (regions.length > 0 && !regions.includes(input.region)) throw ApiError.badRequest('Bölge bu ürün için geçerli değil');

  const parsed = compileInputs(bp.inputs).safeParse(input.inputs);
  if (!parsed.success) throw new ApiError(422, 'Ürün girdileri geçersiz', 'VALIDATION_ERROR', parsed.error.flatten().fieldErrors);

  // Deneme kuralı: kiracı başına bir kez, yalnız en küçük boyut (ücretsiz katman sızmasına karşı — stratejik §9 risk 4).
  const isTrial = input.trial;
  if (isTrial) {
    const [prior] = await db.select({ n: count() }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.isTrial, true)));
    if ((prior?.n ?? 0) > 0) throw new ApiError(422, 'Deneme hakkınızı daha önce kullandınız', 'TRIAL_ALREADY_USED');
    const smallest = bp.sizes[0]?.code;
    if (input.size !== smallest) throw new ApiError(422, `Deneme yalnız ${smallest} boyutunda geçerli`, 'TRIAL_SIZE_LIMIT');
  }

  const q = await quote({ productSlug: input.productSlug, size: input.size, residency: input.residency, planCode: input.planCode, slaCode: input.slaCode, trial: isTrial });
  const [dup] = await db.select({ id: workloads.id }).from(workloads).where(and(eq(workloads.tenantId, tenantId), eq(workloads.slug, input.workloadSlug))).limit(1);
  if (dup) throw ApiError.conflict('Bu kısa adla bir iş yükünüz zaten var');

  const [order] = await db
    .insert(orders)
    .values({
      tenantId,
      productSlug: input.productSlug,
      productVersionId: version.id,
      planCode: input.planCode,
      slaCode: input.slaCode,
      residency: input.residency,
      region: input.region,
      size: input.size,
      workloadSlug: input.workloadSlug,
      workloadName: input.workloadName,
      inputs: parsed.data,
      currency: q.currency,
      monthly: String(q.monthly),
      setupFee: String(q.setupFee),
      isTrial,
      trialDays: q.trialDays,
      status: 'submitted',
      orderedBy: userId,
      utm: input.utm,
    })
    .returning();
  if (Object.keys(input.utm).length) await db.insert(utmAttributions).values({ tenantId, orderId: order!.id, source: input.utm.source ?? null, medium: input.utm.medium ?? null, campaign: input.utm.campaign ?? null, landingPath: input.utm.landingPath ?? null });
  await audit({ actorType: 'user', actorId: userId, tenantId, action: 'order.create', subjectType: 'order', subjectId: order!.id, after: { product: input.productSlug, plan: input.planCode, size: input.size, monthly: q.monthly, trial: isTrial } });

  // Self-servis: doğrudan onay + provizyon.
  return approveAndProvision(order!.id, null, input.inputs as Record<string, unknown>, acc.id);
}

async function setOrderStatus(orderId: string, to: OrderStatus, patch: Partial<typeof orders.$inferInsert> = {}) {
  const [cur] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!cur) throw ApiError.notFound('Sipariş bulunamadı');
  const next = transition(orderMachine, cur.status as OrderStatus, to);
  await db.update(orders).set({ status: next, ...patch }).where(eq(orders.id, orderId));
  return next;
}

export async function approveAndProvision(orderId: string, staffId: string | null, rawInputs: Record<string, unknown>, providerAccountId: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) throw ApiError.notFound('Sipariş bulunamadı');
  await setOrderStatus(orderId, 'approved', { approvedBy: staffId });
  const [version] = await db.select().from(products).where(eq(products.slug, o.productSlug)).limit(1);
  const pv = await publishedVersion(o.productSlug);
  const { workload, run } = await requestProvision(
    {
      tenantId: o.tenantId,
      blueprint: version!.blueprintSlug!,
      version: pv!.blueprintVersion,
      slug: o.workloadSlug,
      name: o.workloadName,
      residency: o.residency as Residency,
      providerAccountId,
      region: o.region,
      size: o.size,
      slaTier: o.slaCode,
      inputs: rawInputs,
    },
    staffId,
    null,
  );
  await db.update(workloads).set({ planCode: o.planCode, orderId: o.id, trialEndsAt: o.trialDays > 0 ? new Date(Date.now() + o.trialDays * 86400_000) : null }).where(eq(workloads.id, workload.id));
  await setOrderStatus(orderId, 'provisioning', { workloadId: workload.id, runId: run.id });

  const sub = await createSubscription({ tenantId: o.tenantId, workloadId: workload.id, planCode: o.planCode, slaCode: o.slaCode, currency: o.currency, monthly: Number(o.monthly), trialDays: o.trialDays });
  await invalidateFeatures(o.tenantId);
  // Ölçümleme + fatura: deneme ise tutar 0 (kalem yine yazılır, şeffaflık).
  const period = new Date().toISOString().slice(0, 7);
  await ensureCustomer(o.tenantId);
  await recordUsage({ tenantId: o.tenantId, workloadId: workload.id, period, metric: 'subscription', qty: 1, currency: o.currency, amount: o.trialDays > 0 ? 0 : Number(o.monthly), note: `${o.workloadName} · ${o.planCode}/${o.slaCode}` });
  if (Number(o.setupFee) > 0) await recordUsage({ tenantId: o.tenantId, workloadId: workload.id, period, metric: 'setup', qty: 1, currency: o.currency, amount: Number(o.setupFee), note: `Kurulum bedeli · ${o.workloadName}` });
  await pushPeriod(period, o.tenantId);
  await notifyTenant(o.tenantId, ['owner', 'admin', 'technical'], { kind: 'system', title: `${o.workloadName} siparişiniz alındı`, body: o.trialDays > 0 ? `${o.trialDays} günlük deneme başladı. Kurulum birkaç dakika sürer.` : 'Kurulum başladı; tamamlandığında bildireceğiz.', link: `/panel/siparisler/${o.id}` });
  return { order: { ...o, status: 'provisioning' as const, workloadId: workload.id, runId: run.id }, workload, run, subscription: sub };
}

/** Provizyon teslimi → sipariş `fulfilled` (provisioning.service handoff'tan çağırır). */
export async function markFulfilledByWorkload(workloadId: string) {
  const [o] = await db.select({ id: orders.id, status: orders.status, tenantId: orders.tenantId }).from(orders).where(eq(orders.workloadId, workloadId)).limit(1);
  if (!o || o.status !== 'provisioning') return;
  await setOrderStatus(o.id, 'fulfilled');
  await audit({ actorType: 'system', tenantId: o.tenantId, action: 'order.fulfilled', subjectType: 'order', subjectId: o.id });
}

export async function listOrders(tenantId: string) {
  return db.select().from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.createdAt)).limit(50);
}

export async function getOrder(tenantId: string, id: string) {
  const [o] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.tenantId, tenantId))).limit(1);
  if (!o) throw ApiError.notFound();
  return o;
}

export async function listAllOrders(limit = 100) {
  return db
    .select({ order: orders, tenantName: tenants.name, tenantSlug: tenants.slug, planTitle: plans.title })
    .from(orders)
    .innerJoin(tenants, eq(tenants.id, orders.tenantId))
    .leftJoin(plans, eq(plans.code, orders.planCode))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function rejectOrder(id: string, reason: string, staffId: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) throw ApiError.notFound('Sipariş bulunamadı');
  if (!['draft', 'submitted', 'approved'].includes(o.status)) throw ApiError.conflict('Bu aşamada reddedilemez');
  await setOrderStatus(id, o.status === 'approved' ? 'cancelled' : 'rejected', { rejectReason: reason, approvedBy: staffId });
  await audit({ actorType: 'staff', actorId: staffId, tenantId: o.tenantId, action: 'order.reject', subjectType: 'order', subjectId: id, after: { reason } });
  await notifyTenant(o.tenantId, ['owner', 'admin'], { kind: 'system', title: `${o.workloadName} siparişi iptal edildi`, body: reason, link: '/panel/siparisler' });
}

export { TRIAL_DAYS };
