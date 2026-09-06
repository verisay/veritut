import { Router } from 'express';
import { z } from 'zod';
import { acceptInviteSchema } from '@veritut/validators';
import { requireUser } from '../middleware/requireUser.js';
import { validate } from '../middleware/validate.js';
import { listUserNotifications, markRead } from '../services/notification.service.js';
import { acceptInvitation } from '../services/invitation.service.js';

export const meRouter: Router = Router();
meRouter.use(requireUser);

meRouter.get('/notifications', async (req, res, next) => {
  try {
    res.json(await listUserNotifications(req.user!.id));
  } catch (e) {
    next(e);
  }
});
meRouter.post('/notifications/:id/read', async (req, res, next) => {
  try {
    await markRead(z.string().uuid().parse(req.params['id']), { userId: req.user!.id });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
/** Davet kabulü — kiracı bağlamı gerekmez (henüz üye değil). */
meRouter.post('/invitations/accept', validate(acceptInviteSchema), async (req, res, next) => {
  try {
    res.json(await acceptInvitation(req.body.token, req.user!.id));
  } catch (e) {
    next(e);
  }
});
