import { Router } from 'express';
import { z } from 'zod';
import { RESIDENCIES } from '@veritut/types';
import { getProduct, listPlans, listPrices, listProducts, listSlaTiers, publishedVersion, quote } from '../services/catalog.service.js';
import { getBlueprint } from '../services/blueprint.service.js';
import { rateLimit } from '../middleware/rateLimit.js';

/** Katalog — KİMLİKSİZ (pazarlama sayfaları + fiyat hesaplayıcı). Yalnız yayımlanmış ürünler. */
export const catalogRouter: Router = Router();
catalogRouter.use(rateLimit({ keyPrefix: 'catalog', windowSec: 60, max: 240 }));

catalogRouter.get('/', async (_req, res, next) => {
  try {
    const [products, plans, slaTiers] = await Promise.all([listProducts({ onlyActive: true }), listPlans(), listSlaTiers()]);
    const withVersion = await Promise.all(products.map(async (p) => ({ ...p, published: Boolean(await publishedVersion(p.slug)) })));
    res.json({ products: withVersion, plans, slaTiers });
  } catch (e) {
    next(e);
  }
});

/** Ürün detayı + teknik seçenekler (boyut, bölge, ikametgâh, girdi şeması) + fiyat matrisi. */
catalogRouter.get('/products/:slug', async (req, res, next) => {
  try {
    const p = await getProduct(String(req.params['slug']));
    const version = await publishedVersion(p.slug);
    const bp = p.blueprintSlug && version ? await getBlueprint(p.blueprintSlug, version.blueprintVersion) : null;
    const prices = await listPrices(p.slug);
    res.json({
      product: p,
      published: Boolean(version),
      blueprintVersion: version?.blueprintVersion ?? null,
      sizes: bp?.sizes.map((s) => ({ code: s.code, title: s.title_tr, priceHint: s.price_hint_eur ?? null })) ?? [],
      residencies: bp?.residencies ?? [],
      regions: bp?.regions ?? {},
      providers: bp?.providers ?? [],
      inputs: bp ? { properties: Object.fromEntries(Object.entries(bp.inputs.properties).filter(([, f]) => !f.ops_only)), required: bp.inputs.required.filter((k) => !bp.inputs.properties[k]?.ops_only) } : { properties: {}, required: [] },
      backup: bp?.backup_policy ?? null,
      sso: bp?.sso.oidc ?? false,
      checks: bp?.checks.map((c) => c.name) ?? [],
      prices: prices.map((x) => ({ size: x.size, residency: x.residency, planCode: x.planCode, slaCode: x.slaCode, currency: x.currency, monthly: Number(x.monthly), setupFee: Number(x.setupFee) })),
    });
  } catch (e) {
    next(e);
  }
});

const quoteQuery = z.object({ product: z.string(), size: z.string(), residency: z.enum(RESIDENCIES), plan: z.string(), sla: z.string(), trial: z.enum(['0', '1']).optional() });
catalogRouter.get('/quote', async (req, res, next) => {
  try {
    const q = quoteQuery.parse(req.query);
    res.json(await quote({ productSlug: q.product, size: q.size, residency: q.residency, planCode: q.plan, slaCode: q.sla, trial: q.trial === '1' }));
  } catch (e) {
    next(e);
  }
});
