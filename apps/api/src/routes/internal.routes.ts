import { Router } from 'express';
import { z } from 'zod';
import { EVIDENCE_KINDS } from '@veritut/types';
import { accessSessionSchema, backupResultSchema, inventoryReportSchema, probeResultsSchema, probeResultsV2Schema, runFinishSchema, runStepReportSchema } from '@veritut/validators';
import { applyInventoryReport } from '../services/provider.service.js';
import { applyBackupResult } from '../services/backup.service.js';
import { ingestAccessSession } from '../services/access.service.js';
import { sealedCredentialsFor } from '../services/run.service.js';
import { planReportSchema, registerWorkloadSchema } from '@veritut/validators';
import { approvalState, completeDestroy, failWorkload, handoffWorkload, registerWorkload, reportPlan, sealedWorkloadSecrets } from '../services/provisioning.service.js';
import { getBlueprint } from '../services/blueprint.service.js';
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

/** K2 provizyon boru hattı — runner uçları. */
internalRouter.get('/runs/:id/state', async (req, res, next) => {
  try {
    const { getRun } = await import('../services/run.service.js');
    const { run, steps } = await getRun(runId.parse(req.params['id']));
    res.json({ status: run.status, steps: steps.map((s) => ({ step: s.step, status: s.status })) });
  } catch (e) { next(e); }
});
internalRouter.get('/workloads/:id', async (req, res, next) => {
  try {
    const { getWorkloadOps } = await import('../services/workload.service.js');
    const w = await getWorkloadOps(runId.parse(req.params['id']));
    res.json({ id: w.id, slug: w.slug, tenantId: w.tenantId, inputs: w.inputs, outputs: w.outputs, residency: w.residency, region: w.region, size: w.size, status: w.status });
  } catch (e) { next(e); }
});
internalRouter.post('/workloads/:id/failed', validate(z.object({ runId: z.string().uuid(), error: z.string().max(1000) })), async (req, res, next) => {
  try { res.json(await failWorkload(runId.parse(req.params['id']), req.body.runId, req.body.error)); } catch (e) { next(e); }
});
internalRouter.post('/runs/:id/plan', validate(planReportSchema), async (req, res, next) => {
  try { res.json(await reportPlan(runId.parse(req.params['id']), req.body)); } catch (e) { next(e); }
});
internalRouter.get('/runs/:id/approval', async (req, res, next) => {
  try { res.json({ state: await approvalState(runId.parse(req.params['id'])) }); } catch (e) { next(e); }
});
internalRouter.get('/runs/:id/workload-secrets', async (req, res, next) => {
  try {
    const { runs } = await import('../db/schema/index.js');
    const { db } = await import('../db/db.js');
    const { eq } = await import('drizzle-orm');
    const [r] = await db.select({ w: runs.workloadId }).from(runs).where(eq(runs.id, runId.parse(req.params['id']))).limit(1);
    res.json(r?.w ? await sealedWorkloadSecrets(r.w) : {});
  } catch (e) { next(e); }
});
internalRouter.post('/workloads/:id/register', validate(registerWorkloadSchema), async (req, res, next) => {
  try { res.json(await registerWorkload(runId.parse(req.params['id']), req.body)); } catch (e) { next(e); }
});
internalRouter.post(
  '/workloads/:id/handoff',
  validate(z.object({ runId: z.string().uuid(), verifyOk: z.boolean(), checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().optional() })).default([]) })),
  async (req, res, next) => {
    try { res.json(await handoffWorkload(runId.parse(req.params['id']), req.body.runId, req.body.verifyOk, req.body.checks)); } catch (e) { next(e); }
  },
);
internalRouter.post('/workloads/:id/destroyed', validate(z.object({ runId: z.string().uuid() })), async (req, res, next) => {
  try { res.json(await completeDestroy(runId.parse(req.params['id']), req.body.runId)); } catch (e) { next(e); }
});
internalRouter.get('/blueprints/:slug/:version', async (req, res, next) => {
  try { res.json(await getBlueprint(String(req.params['slug']), String(req.params['version']))); } catch (e) { next(e); }
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
