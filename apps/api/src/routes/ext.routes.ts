import { Router } from 'express';
import { z } from 'zod';
import { createOrderSchema } from '@veritut/validators';
import { apiKeyAuth, requireScope } from '../middleware/apiKeyAuth.js';
import { publicApiLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { healthCards, workloadDetailForTenant } from '../services/workload.service.js';
import { listEvidence, verifyEvidenceChain } from '../services/evidence.service.js';
import { getOrder, listOrders } from '../services/order.service.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Public API (D19) — `Authorization: Bearer vt_…`. Kiracı bağlamı ANAHTARDAN gelir.
 * Kapsamlar: workloads:read · evidence:read · orders:read · orders:write · status:read.
 * OpenAPI: `GET /ext/openapi.json`.
 */
export const extRouter: Router = Router();

extRouter.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.1.0',
    info: { title: 'VERITUT API', version: '1.0.0', description: 'Yönetilen iş yükleriniz, kanıt defteriniz ve siparişleriniz için salt-okunur ve sipariş uçları.' },
    servers: [{ url: '/api/v1/ext' }],
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Portal → API anahtarları bölümünden üretilir (vt_…)' } } },
    paths: {
      '/workloads': { get: { summary: 'İş yükleri (sağlık kartı)', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Liste' } } } },
      '/workloads/{id}': { get: { summary: 'İş yükü detayı', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Detay' }, 404: { description: 'Bulunamadı' } } } },
      '/evidence': { get: { summary: 'Kanıt olayları', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'Liste' } } } },
      '/evidence/verify': { get: { summary: 'Kanıt zinciri doğrulama', responses: { 200: { description: '{ok, checked, brokenAt, lastHash}' } } } },
      '/orders': { get: { summary: 'Siparişler', responses: { 200: { description: 'Liste' } } }, post: { summary: 'Sipariş oluştur', responses: { 201: { description: 'Oluşturuldu' }, 403: { description: 'Kapsam veya plan yetersiz' } } } },
    },
  });
});

extRouter.use(apiKeyAuth, publicApiLimiter);

extRouter.get('/whoami', (req, res) => {
  res.json({ tenant: req.ctx!.tenantSlug, scopes: req.apiKey!.scopes });
});

extRouter.get('/workloads', requireScope('workloads:read'), async (req, res, next) => {
  try {
    res.json(await healthCards(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});

extRouter.get('/workloads/:id', requireScope('workloads:read'), async (req, res, next) => {
  try {
    res.json(await workloadDetailForTenant(req.ctx!.tenantId, z.string().uuid().parse(req.params['id'])));
  } catch (e) {
    next(e);
  }
});

extRouter.get('/evidence', requireScope('evidence:read'), async (req, res, next) => {
  try {
    const limit = Math.min(200, Number(req.query['limit'] ?? 50) || 50);
    res.json(await listEvidence(req.ctx!.tenantId, { limit, kind: typeof req.query['kind'] === 'string' ? req.query['kind'] : undefined }));
  } catch (e) {
    next(e);
  }
});

extRouter.get('/evidence/verify', requireScope('evidence:read'), async (req, res, next) => {
  try {
    res.json(await verifyEvidenceChain(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});

extRouter.get('/orders', requireScope('orders:read'), async (req, res, next) => {
  try {
    res.json(await listOrders(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});

extRouter.get('/orders/:id', requireScope('orders:read'), async (req, res, next) => {
  try {
    res.json(await getOrder(req.ctx!.tenantId, z.string().uuid().parse(req.params['id'])));
  } catch (e) {
    next(e);
  }
});

/** Sipariş oluşturma: anahtarın kiracısı adına; kullanıcı bağlamı yok → siparişi kiracı sahibi adına açar. */
extRouter.post('/orders', requireScope('orders:write'), validate(createOrderSchema), async (req, res, next) => {
  try {
    const { db } = await import('../db/db.js');
    const { tenantMembers } = await import('../db/schema/index.js');
    const { and, eq } = await import('drizzle-orm');
    const [owner] = await db.select({ userId: tenantMembers.userId }).from(tenantMembers).where(and(eq(tenantMembers.tenantId, req.ctx!.tenantId), eq(tenantMembers.role, 'owner'))).limit(1);
    if (!owner) throw ApiError.forbidden('Kiracının sahibi tanımlı değil');
    const { createOrder } = await import('../services/order.service.js');
    const r = await createOrder(req.ctx!.tenantId, owner.userId, req.body);
    res.status(201).json({ orderId: r.order.id, workloadId: r.workload.id, runId: r.run.id, status: r.order.status });
  } catch (e) {
    next(e);
  }
});
