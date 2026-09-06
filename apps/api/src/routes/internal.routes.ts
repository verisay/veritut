import { Router } from 'express';
import { z } from 'zod';
import { EVIDENCE_KINDS } from '@veritut/types';
import { accessSessionSchema, backupResultSchema, inventoryReportSchema, probeResultsSchema, probeResultsV2Schema, runFinishSchema, runStepReportSchema } from '@veritut/validators';
import { applyInventoryReport } from '../services/provider.service.js';
import { applyBackupResult } from '../services/backup.service.js';
import { ingestAccessSession } from '../services/access.service.js';
import { sealedCredentialsFor } from '../services/run.service.js';
import { internalAuth } from '../middleware/internalAuth.js';
import { validate } from '../middleware/validate.js';
import { finishRun, reportStep } from '../services/run.service.js';
import { applyProbeResults, applyProbeResultsV2, listPlatformComponents, listProbeTargets } from '../services/status.service.js';
import { appendEvidence } from '../services/evidence.service.js';

/** Servisler arası iç uçlar — worker/runner → api (INTERNAL_TOKEN). Dış dünyaya kapalı. */
export const internalRouter: Router = Router();
internalRouter.use(internalAuth);

const runId = z.string().uuid();

internalRouter.post('/runs/:id/steps', validate(runStepReportSchema), async (req, res, next) => {
  try {
    await reportStep(runId.parse(req.params['id']), req.body);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

internalRouter.post('/runs/:id/finish', validate(runFinishSchema), async (req, res, next) => {
  try {
    await finishRun(runId.parse(req.params['id']), req.body);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

internalRouter.get('/components', async (_req, res, next) => {
  try {
    const rows = await listPlatformComponents();
    res.json(rows.filter((r) => r.probeUrl).map((r) => ({ slug: r.slug, probeUrl: r.probeUrl })));
  } catch (e) {
    next(e);
  }
});

internalRouter.post('/probe-results', validate(probeResultsSchema), async (req, res, next) => {
  try {
    res.json(await applyProbeResults(req.body));
  } catch (e) {
    next(e);
  }
});

/** Runner: çalıştırmanın mühürlü kimlik bilgileri — API çözmez, iletir (D12). */
internalRouter.get('/runs/:id/credentials', async (req, res, next) => {
  try { res.json(await sealedCredentialsFor(runId.parse(req.params['id']))); } catch (e) { next(e); }
});
internalRouter.post('/provider-accounts/:id/inventory', validate(inventoryReportSchema), async (req, res, next) => {
  try { res.json(await applyInventoryReport(runId.parse(req.params['id']), req.body)); } catch (e) { next(e); }
});
internalRouter.post('/backup-result', validate(backupResultSchema.extend({ backupJobId: z.string().uuid().nullable().optional() })), async (req, res, next) => {
  try { res.status(201).json(await applyBackupResult(req.body)); } catch (e) { next(e); }
});
internalRouter.post('/access-session', validate(accessSessionSchema), async (req, res, next) => {
  try { res.status(201).json(await ingestAccessSession(req.body)); } catch (e) { next(e); }
});
/** Worker v2: tüm probe hedefleri (platform + kiracı) ve componentId bazlı sonuç. */
internalRouter.get('/probe-targets', async (_req, res, next) => {
  try { res.json(await listProbeTargets()); } catch (e) { next(e); }
});
internalRouter.post('/probe-results-v2', validate(probeResultsV2Schema), async (req, res, next) => {
  try { res.json(await applyProbeResultsV2(req.body.results)); } catch (e) { next(e); }
});

/** Runner/worker kanıt yazar (ör. backup.completed) — tür kapalı sözlükten. */
internalRouter.post(
  '/evidence',
  validate(
    z.object({
      tenantId: z.string().uuid().nullable(),
      kind: z.enum(EVIDENCE_KINDS),
      subjectType: z.string().min(1),
      subjectId: z.string().min(1),
      payload: z.record(z.unknown()).default({}),
      actor: z.string().default('runner'),
    }),
  ),
  async (req, res, next) => {
    try {
      res.status(201).json(await appendEvidence(req.body));
    } catch (e) {
      next(e);
    }
  },
);
