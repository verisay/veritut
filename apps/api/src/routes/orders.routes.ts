import { Router } from 'express';
import { z } from 'zod';
import { createOrderSchema, quoteSchema } from '@veritut/validators';
import { requireUser } from '../middleware/requireUser.js';
import { requireTenantRole, resolveTenant } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { orderLimiter } from '../middleware/rateLimit.js';
import { createOrder, getOrder, listOrders } from '../services/order.service.js';
import { quote } from '../services/catalog.service.js';

/** Portal sipariş akışı — kiracı kapsamlı (D7). Sipariş verme yetkisi: admin+ (technical/mali/viewer veremez). */
export const ordersRouter: Router = Router();
ordersRouter.use(requireUser, resolveTenant);

ordersRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listOrders(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});

ordersRouter.post('/quote', validate(quoteSchema), async (req, res, next) => {
  try {
    res.json(await quote({ productSlug: req.body.productSlug, size: req.body.size, residency: req.body.residency, planCode: req.body.planCode, slaCode: req.body.slaCode, trial: req.body.trial }));
  } catch (e) {
    next(e);
  }
});

ordersRouter.post('/', requireTenantRole('admin'), orderLimiter, validate(createOrderSchema), async (req, res, next) => {
  try {
    const r = await createOrder(req.ctx!.tenantId, req.user!.id, req.body);
    res.status(201).json({ orderId: r.order.id, workloadId: r.workload.id, runId: r.run.id, status: r.order.status });
  } catch (e) {
    next(e);
  }
});

ordersRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await getOrder(req.ctx!.tenantId, z.string().uuid().parse(req.params['id'])));
  } catch (e) {
    next(e);
  }
});
