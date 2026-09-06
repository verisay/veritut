import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { OrderQuote, PlanDto, ProductDto, Residency, SlaTierDto } from '@veritut/types';
import type { z } from 'zod';
import type { upsertPlanSchema, upsertPriceSchema, upsertProductSchema, upsertSlaSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { plans, priceList, productVersions, products, slaTiers } from '../db/schema/index.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { getBlueprint } from './blueprint.service.js';

/** Katalog: ürün = satış birimi, blueprint = teknik tanım. Yayımlanmış TEK sürüm self-servise açılır. */
export async function listProducts(opts: { onlyActive?: boolean } = {}) {
  const rows = await db.select().from(products).where(opts.onlyActive ? eq(products.active, true) : sql`true`).orderBy(asc(products.sort), asc(products.title));
  return rows.map(toProductDto);
}

function toProductDto(p: typeof products.$inferSelect): ProductDto & { active: boolean } {
  return {
    slug: p.slug,
    layer: p.layer,
    title: p.title,
    summary: p.summary,
    blueprintSlug: p.blueprintSlug,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    bodyMd: p.bodyMd,
    faq: p.faq as ProductDto['faq'],
    compare: p.compare as ProductDto['compare'],
    sort: p.sort,
    active: p.active,
  };
}

export async function getProduct(slug: string) {
  const [p] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  if (!p) throw ApiError.notFound('Ürün bulunamadı');
  return toProductDto(p);
}

export async function publishedVersion(slug: string) {
  const [v] = await db.select().from(productVersions).where(and(eq(productVersions.productSlug, slug), eq(productVersions.status, 'published'))).limit(1);
  return v ?? null;
}

export async function listVersions(slug: string) {
  return db.select().from(productVersions).where(eq(productVersions.productSlug, slug)).orderBy(desc(productVersions.createdAt));
}

export async function upsertProduct(input: z.infer<typeof upsertProductSchema>, staffId: string) {
  const [row] = await db
    .insert(products)
    .values({ ...input, blueprintSlug: input.blueprintSlug ?? null, seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null })
    .onConflictDoUpdate({ target: products.slug, set: { ...input, blueprintSlug: input.blueprintSlug ?? null, seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null } })
    .returning();
  await audit({ actorType: 'staff', actorId: staffId, action: 'product.upsert', subjectType: 'product', subjectId: input.slug, after: { title: input.title, active: input.active } });
  return toProductDto(row!);
}

/** Sürüm yayımlama: blueprint gerçekten var mı? Aynı üründe tek `published` (kısmi unique index). */
export async function publishProductVersion(slug: string, blueprintVersion: string, notes: string | undefined, staffId: string) {
  const p = await getProduct(slug);
  if (!p.blueprintSlug) throw ApiError.badRequest('Ürünün blueprint eşlemesi yok');
  await getBlueprint(p.blueprintSlug, blueprintVersion);
  return db.transaction(async (tx) => {
    await tx.update(productVersions).set({ status: 'deprecated' }).where(and(eq(productVersions.productSlug, slug), eq(productVersions.status, 'published')));
    const [row] = await tx
      .insert(productVersions)
      .values({ productSlug: slug, blueprintVersion, status: 'published', releasedAt: new Date(), notes: notes ?? null })
      .onConflictDoUpdate({ target: [productVersions.productSlug, productVersions.blueprintVersion], set: { status: 'published', releasedAt: new Date(), notes: notes ?? null } })
      .returning();
    await audit({ actorType: 'staff', actorId: staffId, action: 'product.publish', subjectType: 'product', subjectId: slug, after: { blueprintVersion } });
    return row!;
  });
}

export async function listPlans(onlyActive = true): Promise<PlanDto[]> {
  const rows = await db.select().from(plans).where(onlyActive ? eq(plans.active, true) : sql`true`).orderBy(asc(plans.sort));
  return rows.map((p) => ({ code: p.code, title: p.title, summary: p.summary, features: p.features as PlanDto['features'], sort: p.sort }));
}

export async function getPlan(code: string) {
  const [p] = await db.select().from(plans).where(eq(plans.code, code)).limit(1);
  if (!p || !p.active) throw ApiError.badRequest('Plan bulunamadı veya pasif');
  return { code: p.code, title: p.title, summary: p.summary, features: p.features as PlanDto['features'], sort: p.sort };
}

export async function upsertPlan(input: z.infer<typeof upsertPlanSchema>, staffId: string) {
  const [row] = await db.insert(plans).values(input).onConflictDoUpdate({ target: plans.code, set: input }).returning();
  await audit({ actorType: 'staff', actorId: staffId, action: 'plan.upsert', subjectType: 'plan', subjectId: input.code, after: input });
  return row!;
}

export async function listSlaTiers(onlyActive = true): Promise<SlaTierDto[]> {
  const rows = await db.select().from(slaTiers).where(onlyActive ? eq(slaTiers.active, true) : sql`true`).orderBy(asc(slaTiers.sort));
  return rows.map((s) => ({ code: s.code, title: s.title, coverage: s.coverage as '9x5' | '24x7', responseMin: s.responseMin, resolveMin: s.resolveMin, uptimeTarget: Number(s.uptimeTarget), monthlyUpliftPct: Number(s.monthlyUpliftPct), sort: s.sort }));
}

export async function upsertSlaTier(input: z.infer<typeof upsertSlaSchema>, staffId: string) {
  const values = { ...input, uptimeTarget: String(input.uptimeTarget), monthlyUpliftPct: String(input.monthlyUpliftPct) };
  const [row] = await db.insert(slaTiers).values(values).onConflictDoUpdate({ target: slaTiers.code, set: values }).returning();
  await audit({ actorType: 'staff', actorId: staffId, action: 'sla.upsert', subjectType: 'sla_tier', subjectId: input.code, after: input });
  return row!;
}

export async function upsertPrice(input: z.infer<typeof upsertPriceSchema>, staffId: string) {
  const validFrom = input.validFrom ?? new Date().toISOString().slice(0, 10);
  const values = { ...input, monthly: String(input.monthly), setupFee: String(input.setupFee), validFrom };
  const [row] = await db
    .insert(priceList)
    .values(values)
    .onConflictDoUpdate({ target: [priceList.productSlug, priceList.size, priceList.residency, priceList.planCode, priceList.slaCode, priceList.currency, priceList.validFrom], set: { monthly: values.monthly, setupFee: values.setupFee } })
    .returning();
  await audit({ actorType: 'staff', actorId: staffId, action: 'price.upsert', subjectType: 'price', subjectId: `${input.productSlug}/${input.size}/${input.residency}/${input.planCode}/${input.slaCode}`, after: { monthly: input.monthly, currency: input.currency } });
  return row!;
}

export async function listPrices(productSlug?: string) {
  const where = productSlug ? [eq(priceList.productSlug, productSlug)] : [];
  return db.select().from(priceList).where(and(...where)).orderBy(asc(priceList.productSlug), asc(priceList.size));
}

/** Geçerli fiyat: valid_from ≤ bugün ve (valid_to boş veya ≥ bugün); en yeni valid_from kazanır. */
export async function findPrice(o: { productSlug: string; size: string; residency: Residency; planCode: string; slaCode: string; currency?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .select()
    .from(priceList)
    .where(
      and(
        eq(priceList.productSlug, o.productSlug),
        eq(priceList.size, o.size),
        eq(priceList.residency, o.residency),
        eq(priceList.planCode, o.planCode),
        eq(priceList.slaCode, o.slaCode),
        eq(priceList.currency, o.currency ?? 'TRY'),
        lte(priceList.validFrom, today),
        or(isNull(priceList.validTo), sql`${priceList.validTo} >= ${today}`),
      ),
    )
    .orderBy(desc(priceList.validFrom))
    .limit(1);
  return row ?? null;
}

export const TRIAL_DAYS = 14;

/** Fiyat teklifi — sipariş anındaki tutar sözleşmedir; deneme ilk dönem ücretsiz. */
export async function quote(o: { productSlug: string; size: string; residency: Residency; planCode: string; slaCode: string; trial?: boolean; currency?: string }): Promise<OrderQuote> {
  const p = await getProduct(o.productSlug);
  const price = await findPrice(o);
  if (!price) throw new ApiError(422, 'Bu bileşim için fiyat tanımlı değil', 'PRICE_NOT_FOUND', { productSlug: o.productSlug, size: o.size, residency: o.residency, planCode: o.planCode, slaCode: o.slaCode });
  const bpVersion = await publishedVersion(o.productSlug);
  let sizeTitle = o.size;
  if (p.blueprintSlug && bpVersion) {
    const bp = await getBlueprint(p.blueprintSlug, bpVersion.blueprintVersion);
    sizeTitle = bp.sizes.find((s) => s.code === o.size)?.title_tr ?? o.size;
  }
  const monthly = Number(price.monthly);
  const setupFee = Number(price.setupFee);
  const isTrial = Boolean(o.trial);
  return {
    productSlug: p.slug,
    productTitle: p.title,
    size: o.size,
    sizeTitle,
    residency: o.residency,
    planCode: o.planCode,
    slaCode: o.slaCode,
    currency: price.currency,
    monthly,
    setupFee: isTrial ? 0 : setupFee,
    firstInvoiceTotal: isTrial ? 0 : monthly + setupFee,
    trialDays: isTrial ? TRIAL_DAYS : 0,
    isTrial,
  };
}
