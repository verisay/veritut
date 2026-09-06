import { Router } from 'express';
import { z } from 'zod';
import { auditorDocument, auditorView } from '../services/auditor.service.js';
import { getDocument } from '../services/storage.service.js';
import { rateLimit } from '../middleware/rateLimit.js';

/** Denetçi görünümü — KİMLİKSİZ, süreli token ile salt-okuma (plan §1.3). */
export const denetciRouter: Router = Router();
denetciRouter.use(rateLimit({ keyPrefix: 'denetci', windowSec: 60, max: 60 }));
const token = z.string().min(16).max(200);

denetciRouter.get('/:token', async (req, res, next) => {
  try {
    const { view } = await auditorView(token.parse(req.params['token']));
    res.json(view);
  } catch (e) {
    next(e);
  }
});

denetciRouter.get('/:token/documents/:id', async (req, res, next) => {
  try {
    const d = await auditorDocument(token.parse(req.params['token']), z.string().uuid().parse(req.params['id']));
    const buf = await getDocument(d.storageKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${d.kind}-${d.period ?? 'guncel'}.pdf"`);
    res.setHeader('X-Document-Sha256', d.sha256);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});
