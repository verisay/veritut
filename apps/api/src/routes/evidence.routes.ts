import { Router } from 'express';
import { requireUser } from '../middleware/requireUser.js';
import { resolveTenant } from '../middleware/resolveTenant.js';
import { getTenantBySlug } from '../services/tenant.service.js';
import { listEvidence, verifyEvidenceChain } from '../services/evidence.service.js';
import { ApiError } from '../utils/ApiError.js';

export const evidenceRouter: Router = Router();

/**
 * PUBLIC doğrulama (D13): kiracı slug'ı ile zincir bütünlüğü — denetçi kimliksiz doğrular.
 * Yalnız sonuç (ok/brokenAt/lastHash) döner; olay içeriği DÖNMEZ.
 */
evidenceRouter.get('/public/verify', async (req, res, next) => {
  try {
    const slug = String(req.query['tenant'] ?? '');
    const tenantId = slug === 'platform' ? null : ((await getTenantBySlug(slug))?.id ?? undefined);
    if (tenantId === undefined) throw ApiError.notFound();
    res.json(await verifyEvidenceChain(tenantId));
  } catch (e) {
    next(e);
  }
});

const scoped = Router();
scoped.use(requireUser, resolveTenant);
scoped.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(200, Number(req.query['limit'] ?? 50) || 50);
    const kind = typeof req.query['kind'] === 'string' ? req.query['kind'] : undefined;
    res.json(await listEvidence(req.ctx!.tenantId, { limit, kind }));
  } catch (e) {
    next(e);
  }
});
scoped.get('/verify', async (req, res, next) => {
  try {
    res.json(await verifyEvidenceChain(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
evidenceRouter.use('/', scoped);
