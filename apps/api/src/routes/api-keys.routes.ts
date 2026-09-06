import { Router } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { createApiKeySchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { apiKeys } from '../db/schema/index.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { requireUser } from '../middleware/requireUser.js';
import { requireTenantRole, resolveTenant } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { apiKeyLimiter } from '../middleware/rateLimit.js';
import { assertApiKeyQuota } from '../services/entitlement.service.js';
import { audit } from '../services/audit.service.js';
import { ApiError } from '../utils/ApiError.js';

/** API anahtarları (D19). Ham anahtar YALNIZ üretim anında döner; sonra sha256'sı saklanır. */
export const apiKeysRouter: Router = Router();
apiKeysRouter.use(requireUser, resolveTenant, requireTenantRole('admin'));

apiKeysRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, scopes: apiKeys.scopes, ipAllow: apiKeys.ipAllow, lastUsedAt: apiKeys.lastUsedAt, expiresAt: apiKeys.expiresAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, req.ctx!.tenantId))
      .orderBy(desc(apiKeys.createdAt));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

apiKeysRouter.post('/', apiKeyLimiter, validate(createApiKeySchema), async (req, res, next) => {
  try {
    await assertApiKeyQuota(req.ctx!.tenantId);
    const token = `vt_${randomToken(24)}`;
    const [row] = await db
      .insert(apiKeys)
      .values({
        tenantId: req.ctx!.tenantId,
        name: req.body.name,
        keyPrefix: token.slice(0, 11),
        keyHash: sha256Hex(token),
        scopes: req.body.scopes,
        ipAllow: req.body.ipAllow,
        expiresAt: req.body.expiresInDays ? new Date(Date.now() + req.body.expiresInDays * 86400_000) : null,
        createdBy: req.user!.id,
      })
      .returning({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, scopes: apiKeys.scopes, expiresAt: apiKeys.expiresAt });
    await audit({ actorType: 'user', actorId: req.user!.id, tenantId: req.ctx!.tenantId, action: 'api_key.create', subjectType: 'api_key', subjectId: row!.id, after: { name: req.body.name, scopes: req.body.scopes }, ip: req.ip ?? null });
    res.status(201).json({ ...row!, token });
  } catch (e) {
    next(e);
  }
});

apiKeysRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params['id']);
    const [row] = await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, req.ctx!.tenantId), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
    if (!row) throw ApiError.notFound();
    await audit({ actorType: 'user', actorId: req.user!.id, tenantId: req.ctx!.tenantId, action: 'api_key.revoke', subjectType: 'api_key', subjectId: id });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
