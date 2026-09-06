import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/requireUser.js';
import { resolveTenant } from '../middleware/resolveTenant.js';
import { healthCards, workloadDetailForTenant } from '../services/workload.service.js';

/** Portal iş yükleri — TÜMÜ resolveTenant altında (D7); kapsam dışı 404. */
export const workloadsRouter: Router = Router();
workloadsRouter.use(requireUser, resolveTenant);

workloadsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await healthCards(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
workloadsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await workloadDetailForTenant(req.ctx!.tenantId, z.string().uuid().parse(req.params['id'])));
  } catch (e) {
    next(e);
  }
});
