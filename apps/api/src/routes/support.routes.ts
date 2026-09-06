import { Router } from 'express';
import { z } from 'zod';
import { createTicketSchema, replyTicketSchema } from '@veritut/validators';
import { requireUser } from '../middleware/requireUser.js';
import { resolveTenant } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { ticketLimiter } from '../middleware/rateLimit.js';
import { createTicket, getTicket, listTickets, replyTicket } from '../services/ticket.service.js';

export const supportRouter: Router = Router();
supportRouter.use(requireUser, resolveTenant);
const uuid = z.string().uuid();

supportRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listTickets(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
supportRouter.post('/', ticketLimiter, validate(createTicketSchema), async (req, res, next) => {
  try {
    res.status(201).json(await createTicket(req.ctx!.tenantId, req.user!.id, req.body));
  } catch (e) {
    next(e);
  }
});
supportRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await getTicket(req.ctx!.tenantId, uuid.parse(req.params['id'])));
  } catch (e) {
    next(e);
  }
});
supportRouter.post('/:id/reply', ticketLimiter, validate(replyTicketSchema), async (req, res, next) => {
  try {
    res.json(await replyTicket(req.ctx!.tenantId, uuid.parse(req.params['id']), req.user!.id, req.body.body));
  } catch (e) {
    next(e);
  }
});
