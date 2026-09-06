import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { allowedSlaTiers, getEffectiveFeatures, hasFeature, quotaExceeded, type FeatureKey, type Features } from '@veritut/types';
import { db } from '../db/db.js';
import { apiKeys, plans, tenantFeatureOverrides, tenantMembers, tenantSubscriptions, workloads } from '../db/schema/index.js';
import { redis } from '../redis.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';

/**
 * Entitlement (plan §4.2). Kiracının etkin planı = aktif aboneliklerin EN YÜKSEK sıralı planı;
 * abonelik yoksa `free`. Sonuç Redis'te 5 dk cache'lenir; plan/istisna değişiminde invalidate edilir.
 */
const CACHE_TTL = 300;
const cacheKey = (tenantId: string) => `entitlement:${tenantId}`;

export async function effectivePlanCode(tenantId: string): Promise<string> {
  const rows = await db
    .select({ code: tenantSubscriptions.planCode, sort: plans.sort })
    .from(tenantSubscriptions)
    .innerJoin(plans, eq(plans.code, tenantSubscriptions.planCode))
    .where(and(eq(tenantSubscriptions.tenantId, tenantId), sql`${tenantSubscriptions.status} IN ('trialing','active','past_due')`))
    .orderBy(sql`${plans.sort} desc`)
    .limit(1);
  return rows[0]?.code ?? 'free';
}

export async function getFeatures(tenantId: string): Promise<Features> {
  const cached = await redis.get(cacheKey(tenantId)).catch(() => null);
  if (cached) return JSON.parse(cached) as Features;
  const code = await effectivePlanCode(tenantId);
  const [plan] = await db.select({ features: plans.features }).from(plans).where(eq(plans.code, code)).limit(1);
  const overrides = await db.select({ feature: tenantFeatureOverrides.feature, value: tenantFeatureOverrides.value }).from(tenantFeatureOverrides).where(eq(tenantFeatureOverrides.tenantId, tenantId));
  const features = getEffectiveFeatures((plan?.features ?? {}) as Features, Object.fromEntries(overrides.map((o) => [o.feature, o.value as never])));
  await redis.set(cacheKey(tenantId), JSON.stringify(features), 'EX', CACHE_TTL).catch(() => undefined);
  return features;
}

export async function invalidateFeatures(tenantId: string): Promise<void> {
  await redis.del(cacheKey(tenantId)).catch(() => undefined);
}

export async function setOverride(tenantId: string, feature: FeatureKey, value: boolean | number | string[], note: string | undefined, staffId: string) {
  await db
    .insert(tenantFeatureOverrides)
    .values({ tenantId, feature, value, note: note ?? null, setBy: staffId })
    .onConflictDoUpdate({ target: [tenantFeatureOverrides.tenantId, tenantFeatureOverrides.feature], set: { value, note: note ?? null, setBy: staffId } });
  await invalidateFeatures(tenantId);
  await audit({ actorType: 'staff', actorId: staffId, tenantId, action: 'entitlement.override', subjectType: 'tenant', subjectId: tenantId, after: { feature, value } });
}

export async function clearOverride(tenantId: string, feature: string, staffId: string) {
  await db.delete(tenantFeatureOverrides).where(and(eq(tenantFeatureOverrides.tenantId, tenantId), eq(tenantFeatureOverrides.feature, feature)));
  await invalidateFeatures(tenantId);
  await audit({ actorType: 'staff', actorId: staffId, tenantId, action: 'entitlement.override_clear', subjectType: 'tenant', subjectId: tenantId, after: { feature } });
}

/** Özellik kapıları — hepsi FAIL-CLOSED: bilinmeyen/kapalı özellik 403. */
export async function requireFeatureFor(tenantId: string, key: FeatureKey): Promise<void> {
  const f = await getFeatures(tenantId);
  if (!hasFeature(f, key)) throw new ApiError(403, 'Bu özellik planınıza dahil değil', 'FEATURE_NOT_IN_PLAN', { feature: key });
}

/**
 * Sipariş anındaki etkin özellikler: mevcut plan ile SİPARİŞ EDİLEN plandan sırası yüksek olan geçerlidir.
 * Aksi hâlde abonelik'siz kiracı `free` planda kalır ve ilk siparişini asla veremez (K3 smoke bulgusu).
 */
export async function featuresForOrder(tenantId: string, orderedPlanCode: string): Promise<Features> {
  const currentCode = await effectivePlanCode(tenantId);
  const rows = await db.select({ code: plans.code, features: plans.features, sort: plans.sort }).from(plans).where(inArray(plans.code, [currentCode, orderedPlanCode]));
  const winner = rows.sort((a, b) => b.sort - a.sort)[0];
  const overrides = await db.select({ feature: tenantFeatureOverrides.feature, value: tenantFeatureOverrides.value }).from(tenantFeatureOverrides).where(eq(tenantFeatureOverrides.tenantId, tenantId));
  return getEffectiveFeatures((winner?.features ?? {}) as Features, Object.fromEntries(overrides.map((o) => [o.feature, o.value as never])));
}

export async function assertWorkloadQuota(tenantId: string, orderedPlanCode?: string): Promise<void> {
  const f = orderedPlanCode ? await featuresForOrder(tenantId, orderedPlanCode) : await getFeatures(tenantId);
  const [row] = await db.select({ n: count() }).from(workloads).where(and(eq(workloads.tenantId, tenantId), ne(workloads.status, 'destroyed')));
  if (quotaExceeded(f['workloads.max'], row?.n ?? 0)) throw new ApiError(403, 'Plan iş yükü kotanız dolu', 'QUOTA_EXCEEDED', { feature: 'workloads.max', limit: f['workloads.max'], current: row?.n ?? 0 });
}

export async function assertUserQuota(tenantId: string): Promise<void> {
  const f = await getFeatures(tenantId);
  const [row] = await db.select({ n: count() }).from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
  if (quotaExceeded(f['users.max'], row?.n ?? 0)) throw new ApiError(403, 'Plan ekip üyesi kotanız dolu', 'QUOTA_EXCEEDED', { feature: 'users.max', limit: f['users.max'], current: row?.n ?? 0 });
}

export async function assertApiKeyQuota(tenantId: string): Promise<void> {
  await requireFeatureFor(tenantId, 'api.enabled');
  const f = await getFeatures(tenantId);
  const [row] = await db.select({ n: count() }).from(apiKeys).where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)));
  if (quotaExceeded(f['api.keys.max'], row?.n ?? 0)) throw new ApiError(403, 'API anahtarı kotanız dolu', 'QUOTA_EXCEEDED', { feature: 'api.keys.max', limit: f['api.keys.max'], current: row?.n ?? 0 });
}

export async function assertSlaAllowed(tenantId: string, slaCode: string, planCode?: string): Promise<void> {
  const features = planCode ? await planFeatures(planCode) : await getFeatures(tenantId);
  const allowed = allowedSlaTiers(features);
  if (!allowed.includes(slaCode)) throw new ApiError(403, 'Bu SLA katmanı seçtiğiniz planda yok', 'SLA_NOT_IN_PLAN', { slaCode, allowed });
}

async function planFeatures(code: string): Promise<Features> {
  const [p] = await db.select({ features: plans.features }).from(plans).where(eq(plans.code, code)).limit(1);
  return getEffectiveFeatures((p?.features ?? {}) as Features);
}

export { hasFeature };
