import { Router } from 'express';
import { z } from 'zod';
import { auditorLinkSchema, notificationChannelSchema } from '@veritut/validators';
import { requireUser } from '../middleware/requireUser.js';
import { requireTenantRole, resolveTenant } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { getIncident, listIncidents, listMaintenance } from '../services/incident.service.js';
import { listSlaPeriods } from '../services/sla.service.js';
import { listDrills } from '../services/drill.service.js';
import { generateDpa, generateEvidenceBundle, generateSlaReport, generateSubprocessors, getDocumentRow, listDocuments } from '../services/document.service.js';
import { getDocument } from '../services/storage.service.js';
import { createChannel, deleteChannel, listChannels } from '../services/channel.service.js';
import { createAuditorLink, listAuditorLinks, revokeAuditorLink } from '../services/auditor.service.js';
import { requireFeatureFor } from '../services/entitlement.service.js';

/** Portal güvence sekmesi: olaylar, SLA, tatbikatlar, belgeler, alarm kanalları, denetçi bağlantıları. */
export const guvenceRouter: Router = Router();
guvenceRouter.use(requireUser, resolveTenant);
const uuid = z.string().uuid();
const period = z.string().regex(/^\d{4}-\d{2}$/);

guvenceRouter.get('/incidents', async (req, res, next) => {
  try {
    const rows = await listIncidents({ tenantId: req.ctx!.tenantId, customerVisibleOnly: true, limit: 50 });
    res.json(rows.map((r) => r.incident));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.get('/incidents/:id', async (req, res, next) => {
  try {
    res.json(await getIncident(uuid.parse(req.params['id']), { tenantId: req.ctx!.tenantId, customerView: true }));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.get('/maintenance', async (req, res, next) => {
  try {
    res.json(await listMaintenance({ tenantId: req.ctx!.tenantId, upcomingOnly: false }));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.get('/sla', async (req, res, next) => {
  try {
    const rows = await listSlaPeriods({ tenantId: req.ctx!.tenantId });
    res.json(rows.map((r) => ({ ...r.sla, workloadName: r.workloadName })));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.get('/drills', async (req, res, next) => {
  try {
    const rows = await listDrills({ tenantId: req.ctx!.tenantId, limit: 50 });
    res.json(rows.map((r) => ({ ...r.drill, workloadName: r.workloadName })));
  } catch (e) {
    next(e);
  }
});

// ── Belgeler ──────────────────────────────────────────────────────────────
guvenceRouter.get('/documents', async (req, res, next) => {
  try {
    res.json(await listDocuments(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.get('/documents/:id/download', async (req, res, next) => {
  try {
    const d = await getDocumentRow(req.ctx!.tenantId, uuid.parse(req.params['id']));
    const buf = await getDocument(d.storageKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${d.kind}-${d.period ?? 'guncel'}-v${d.version}.pdf"`);
    res.setHeader('X-Document-Sha256', d.sha256);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});
guvenceRouter.post('/documents/subprocessors', requireTenantRole('admin'), async (req, res, next) => {
  try {
    res.status(201).json(await generateSubprocessors(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.post('/documents/dpa', requireTenantRole('admin'), async (req, res, next) => {
  try {
    res.status(201).json(await generateDpa(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.post('/documents/sla-report', requireTenantRole('admin'), validate(z.object({ period })), async (req, res, next) => {
  try {
    res.status(201).json(await generateSlaReport(req.ctx!.tenantId, req.body.period));
  } catch (e) {
    next(e);
  }
});
/** Kanıt paketi plan özelliğidir (`evidence.bundle`) — planda yoksa 403. */
guvenceRouter.post('/documents/evidence-bundle', requireTenantRole('admin'), validate(z.object({ period })), async (req, res, next) => {
  try {
    await requireFeatureFor(req.ctx!.tenantId, 'evidence.bundle');
    res.status(201).json(await generateEvidenceBundle(req.ctx!.tenantId, req.body.period));
  } catch (e) {
    next(e);
  }
});

// ── Alarm kanalları ───────────────────────────────────────────────────────
guvenceRouter.get('/channels', async (req, res, next) => {
  try {
    res.json(await listChannels(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.post('/channels', requireTenantRole('technical'), validate(notificationChannelSchema), async (req, res, next) => {
  try {
    res.status(201).json(await createChannel(req.ctx!.tenantId, req.body, req.user!.id));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.delete('/channels/:id', requireTenantRole('technical'), async (req, res, next) => {
  try {
    await deleteChannel(req.ctx!.tenantId, uuid.parse(req.params['id']), req.user!.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ── Denetçi bağlantıları ──────────────────────────────────────────────────
guvenceRouter.get('/auditor-links', requireTenantRole('admin'), async (req, res, next) => {
  try {
    res.json(await listAuditorLinks(req.ctx!.tenantId));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.post('/auditor-links', requireTenantRole('admin'), validate(auditorLinkSchema), async (req, res, next) => {
  try {
    res.status(201).json(await createAuditorLink(req.ctx!.tenantId, req.body, req.user!.id));
  } catch (e) {
    next(e);
  }
});
guvenceRouter.delete('/auditor-links/:id', requireTenantRole('admin'), async (req, res, next) => {
  try {
    await revokeAuditorLink(req.ctx!.tenantId, uuid.parse(req.params['id']), req.user!.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
