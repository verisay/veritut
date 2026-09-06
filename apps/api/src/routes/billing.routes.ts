import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/requireUser.js';
import { requireTenantRole, resolveTenant } from '../middleware/resolveTenant.js';
import { env } from '../config/env.js';
import { createHmac } from 'node:crypto';
import { listInvoices, listSubscriptions, listUsage } from '../services/billing.service.js';
import { getFeatures, effectivePlanCode } from '../services/entitlement.service.js';
import { ApiError } from '../utils/ApiError.js';
import { validate } from '../middleware/validate.js';

/** Portal mali sekmesi: fatura aynası, abonelikler, kullanım, plan/özellikler. */
export const billingRouter: Router = Router();
billingRouter.use(requireUser, resolveTenant);

billingRouter.get('/invoices', requireTenantRole('billing'), async (req, res, next) => {
  try {
    res.json(await listInvoices(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});

billingRouter.get('/subscriptions', async (req, res, next) => {
  try {
    res.json(await listSubscriptions(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});

billingRouter.get('/usage', requireTenantRole('billing'), async (req, res, next) => {
  try {
    const period = z.string().regex(/^\d{4}-\d{2}$/).default(new Date().toISOString().slice(0, 7)).parse(req.query['period'] ?? undefined);
    res.json(await listUsage(req.ctx!.tenantId, period));
  } catch (e) {
    next(e);
  }
});

billingRouter.get('/plan', async (req, res, next) => {
  try {
    const [planCode, features] = await Promise.all([effectivePlanCode(req.ctx!.tenantId), getFeatures(req.ctx!.tenantId)]);
    res.json({ planCode, features });
  } catch (e) {
    next(e);
  }
});

/**
 * Ödeme simülasyonu — YALNIZ development + mock omurga. Gerçek ödeme faturalama omurgasında (D17);
 * burada yapılan tek şey, sağlayıcının göndereceği webhook'u aynı imzayla tetiklemektir.
 */
billingRouter.post('/mock-pay', validate(z.object({ billingRef: z.string().min(3) })), async (req, res, next) => {
  try {
    if (env.NODE_ENV !== 'development' || env.BILLING_PROVIDER !== 'mock') throw ApiError.notFound();
    const [{ invoices }, { db }, { eq, and }] = await Promise.all([import('../db/schema/index.js'), import('../db/db.js'), import('drizzle-orm')]);
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.billingRef, req.body.billingRef), eq(invoices.tenantId, req.ctx!.tenantId))).limit(1);
    if (!inv) throw ApiError.notFound('Fatura bulunamadı');
    const { tenants } = await import('../db/schema/index.js');
    const [t] = await db.select({ ref: tenants.billingRef }).from(tenants).where(eq(tenants.id, req.ctx!.tenantId)).limit(1);
    const body = JSON.stringify({ event: 'invoice.paid', tenantRef: t!.ref, invoice: { billingRef: inv.billingRef, number: inv.number, status: 'paid', currency: inv.currency, total: Number(inv.total), paidAt: new Date().toISOString(), lines: inv.lines } });
    const sig = createHmac('sha256', env.BILLING_WEBHOOK_SECRET).update(Buffer.from(body)).digest('hex');
    const r = await fetch(`http://127.0.0.1:${env.API_PORT}/api/v1/webhooks/billing`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-veritut-signature': sig }, body });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch (e) {
    next(e);
  }
});
