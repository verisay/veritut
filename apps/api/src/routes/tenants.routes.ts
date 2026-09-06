import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { createTenantSchema, inviteSchema, memberRoleSchema } from '@veritut/validators';
import { z } from 'zod';
import { db } from '../db/db.js';
import { tenantMembers, users } from '../db/schema/index.js';
import { requireUser } from '../middleware/requireUser.js';
import { requireTenantRole, resolveTenant } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { createTenant, getTenant, listUserTenants } from '../services/tenant.service.js';
import { inviteMember, listInvitations, removeMember, setMemberRole } from '../services/invitation.service.js';

export const tenantsRouter: Router = Router();
tenantsRouter.use(requireUser);

tenantsRouter.get('/mine', async (req, res, next) => {
  try {
    res.json(await listUserTenants(req.user!.id));
  } catch (e) {
    next(e);
  }
});

tenantsRouter.post('/', validate(createTenantSchema), async (req, res, next) => {
  try {
    const t = await createTenant(req.body, req.user!.id, req.ip ?? null);
    res.status(201).json(t);
  } catch (e) {
    next(e);
  }
});

// Kiracı-kapsamlı alt yollar — HEPSİ resolveTenant altında (D7).
const scoped = Router();
scoped.use(resolveTenant);
scoped.get('/', async (req, res, next) => {
  try {
    res.json({ ...(await getTenant(req.ctx!.tenantId)), myRole: req.ctx!.role });
  } catch (e) {
    next(e);
  }
});
scoped.get('/members', async (req, res, next) => {
  try {
    const rows = await db
      .select({ userId: users.id, email: users.email, displayName: users.displayName, role: tenantMembers.role, since: tenantMembers.createdAt })
      .from(tenantMembers)
      .innerJoin(users, eq(users.id, tenantMembers.userId))
      .where(eq(tenantMembers.tenantId, req.ctx!.tenantId));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
scoped.get('/invitations', requireTenantRole('admin'), async (req, res, next) => {
  try {
    res.json(await listInvitations(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
scoped.post('/invitations', requireTenantRole('admin'), validate(inviteSchema), async (req, res, next) => {
  try {
    res.status(201).json(await inviteMember(req.ctx!.tenantId, req.body.email, req.body.role, req.user!.id, req.ip ?? null));
  } catch (e) {
    next(e);
  }
});
scoped.patch('/members/:userId', requireTenantRole('owner'), validate(memberRoleSchema), async (req, res, next) => {
  try {
    res.json(await setMemberRole(req.ctx!.tenantId, z.string().uuid().parse(req.params['userId']), req.body.role, req.user!.id));
  } catch (e) {
    next(e);
  }
});
scoped.delete('/members/:userId', requireTenantRole('owner'), async (req, res, next) => {
  try {
    await removeMember(req.ctx!.tenantId, z.string().uuid().parse(req.params['userId']), req.user!.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
tenantsRouter.use('/current', scoped);
