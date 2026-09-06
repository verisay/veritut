import { Router } from 'express';
import { z } from 'zod';
import { EVIDENCE_KINDS } from '@veritut/types';
import { env } from '../config/env.js';
import { requireStaff, requireStaffRole } from '../middleware/requireStaff.js';
import { validate } from '../middleware/validate.js';
import { listAllTenants } from '../services/tenant.service.js';
import { createRun, getRun, listRuns, readRunLog } from '../services/run.service.js';
import { listPlatformComponents } from '../services/status.service.js';
import { appendEvidence, listEvidence, verifyEvidenceChain } from '../services/evidence.service.js';
import { queueCounts } from '../queues.js';
import { audit } from '../services/audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import {
  backupPolicySchema, createBackupRepoSchema, createFromInventorySchema, createProviderAccountSchema, createTenantOpsSchema, createWorkloadSchema,
  fxRateSchema, importCsvSchema, invoiceCsvSchema, matchInventorySchema, periodSchema, revenueSchema, updateWorkloadSchema,
} from '@veritut/validators';
import { createTenantOps, tenant360 } from '../services/tenant.service.js';
import { createProviderAccount, getProviderAccount, listInventory, listProviderAccounts, matchInventory, triggerProviderSync } from '../services/provider.service.js';
import { createWorkload, getWorkloadOps, importWorkloadsCsv, listWorkloadsOps, updateWorkload } from '../services/workload.service.js';
import { importInvoiceCsv, marginReport, upsertFx, upsertRevenue } from '../services/cost.service.js';
import { createRepo, getPolicy, listJobs, listRepos, triggerBackup, upsertPolicy } from '../services/backup.service.js';
import { listStaffNotifications, markRead } from '../services/notification.service.js';

/** Personel uçları — tümü `requireStaff` altında; kiracı bağlamı açık parametre + audit. */
export const opsRouter: Router = Router();
opsRouter.use(requireStaff);

opsRouter.get('/overview', async (_req, res, next) => {
  try {
    const [tenants, components, queues, runs] = await Promise.all([listAllTenants(), listPlatformComponents(), queueCounts(), listRuns(10)]);
    res.json({ tenantCount: tenants.length, components, queues, recentRuns: runs });
  } catch (e) {
    next(e);
  }
});

opsRouter.get('/tenants', async (_req, res, next) => {
  try {
    res.json(await listAllTenants());
  } catch (e) {
    next(e);
  }
});

const uuid = z.string().uuid();

// ── Kiracılar ─────────────────────────────────────────────────────────────
opsRouter.post('/tenants', requireStaffRole('platform_admin'), validate(createTenantOpsSchema), async (req, res, next) => {
  try { res.status(201).json(await createTenantOps(req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.get('/tenants/:id', async (req, res, next) => {
  try { res.json(await tenant360(uuid.parse(req.params['id']))); } catch (e) { next(e); }
});

// ── Tedarikçi hesapları (kimlik bilgisi mühürlü; kıdemli) ─────────────────
opsRouter.get('/provider-accounts', async (_req, res, next) => {
  try { res.json(await listProviderAccounts()); } catch (e) { next(e); }
});
opsRouter.post('/provider-accounts', requireStaffRole('senior'), validate(createProviderAccountSchema), async (req, res, next) => {
  try { res.status(201).json(await createProviderAccount(req.body, req.staff!.id, req.ip ?? null)); } catch (e) { next(e); }
});
opsRouter.get('/provider-accounts/:id', async (req, res, next) => {
  try { res.json(await getProviderAccount(uuid.parse(req.params['id']))); } catch (e) { next(e); }
});
opsRouter.post('/provider-accounts/:id/sync', async (req, res, next) => {
  try { res.status(201).json(await triggerProviderSync(uuid.parse(req.params['id']), req.staff!.id)); } catch (e) { next(e); }
});

// ── Envanter ──────────────────────────────────────────────────────────────
opsRouter.get('/inventory', async (req, res, next) => {
  try { res.json(await listInventory({ unmatchedOnly: req.query['sahipsiz'] === '1', accountId: typeof req.query['account'] === 'string' ? req.query['account'] : undefined })); } catch (e) { next(e); }
});
opsRouter.post('/inventory/:id/match', validate(matchInventorySchema), async (req, res, next) => {
  try { res.json(await matchInventory(uuid.parse(req.params['id']), req.body.workloadId, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/inventory/:id/create-workload', validate(createFromInventorySchema), async (req, res, next) => {
  try {
    const id = uuid.parse(req.params['id']);
    const items = await listInventory({});
    const item = items.find((i) => i.id === id);
    if (!item) throw ApiError.notFound('Envanter kalemi bulunamadı');
    const w = await createWorkload({ tenantId: req.body.tenantId, slug: req.body.slug, name: req.body.name, productSlug: 'legacy', residency: (item.residency as 'TR' | 'EU' | 'US' | null) ?? 'EU', providerCode: item.providerCode as 'hetzner', providerAccountId: item.providerAccountId, region: item.region, size: String((item.specs as { serverType?: string }).serverType ?? ''), slaTier: 'std_9x5', status: 'active' }, { staffId: req.staff!.id }, req.ip ?? null);
    await matchInventory(id, w.id, req.staff!.id);
    res.status(201).json(w);
  } catch (e) { next(e); }
});

// ── İş yükleri ────────────────────────────────────────────────────────────
opsRouter.get('/workloads', async (req, res, next) => {
  try { res.json(await listWorkloadsOps({ tenantId: typeof req.query['tenant'] === 'string' ? req.query['tenant'] : undefined })); } catch (e) { next(e); }
});
opsRouter.post('/workloads', validate(createWorkloadSchema), async (req, res, next) => {
  try { res.status(201).json(await createWorkload(req.body, { staffId: req.staff!.id }, req.ip ?? null)); } catch (e) { next(e); }
});
opsRouter.get('/workloads/:id', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params['id']);
    const [w, policy, jobs] = await Promise.all([getWorkloadOps(id), getPolicy(id), listJobs({ workloadId: id, limit: 20 })]);
    const { accessSealed: _a, ...safe } = w;
    res.json({ workload: safe, policy, jobs });
  } catch (e) { next(e); }
});
opsRouter.patch('/workloads/:id', validate(updateWorkloadSchema), async (req, res, next) => {
  try { res.json(await updateWorkload(uuid.parse(req.params['id']), req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/workloads/import-csv', requireStaffRole('senior'), validate(importCsvSchema), async (req, res, next) => {
  try { res.json(await importWorkloadsCsv(req.body.csv, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.put('/workloads/:id/revenue', validate(revenueSchema), async (req, res, next) => {
  try { res.json(await upsertRevenue(uuid.parse(req.params['id']), req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.put('/workloads/:id/backup-policy', validate(backupPolicySchema), async (req, res, next) => {
  try { res.json(await upsertPolicy(uuid.parse(req.params['id']), req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/workloads/:id/backup', async (req, res, next) => {
  try { res.status(201).json(await triggerBackup(uuid.parse(req.params['id']), req.staff!.id)); } catch (e) { next(e); }
});

// ── Maliyet & marj ────────────────────────────────────────────────────────
opsRouter.get('/margin', async (req, res, next) => {
  try { res.json(await marginReport(periodSchema.parse(req.query['period'] ?? new Date().toISOString().slice(0, 7)))); } catch (e) { next(e); }
});
opsRouter.post('/cost/invoice-csv', requireStaffRole('senior'), validate(invoiceCsvSchema), async (req, res, next) => {
  try { res.json(await importInvoiceCsv(req.body.providerAccountId, req.body.period, req.body.csv, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.put('/fx', requireStaffRole('senior'), validate(fxRateSchema), async (req, res, next) => {
  try { await upsertFx(req.body.period, req.body.currency, req.body.toTry); res.status(204).end(); } catch (e) { next(e); }
});

// ── Yedek depoları / işler ────────────────────────────────────────────────
opsRouter.get('/backup-repos', async (_req, res, next) => {
  try { res.json(await listRepos()); } catch (e) { next(e); }
});
opsRouter.post('/backup-repos', requireStaffRole('senior'), validate(createBackupRepoSchema), async (req, res, next) => {
  try { res.status(201).json(await createRepo(req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.get('/backup-jobs', async (_req, res, next) => {
  try { res.json(await listJobs({ limit: 100 })); } catch (e) { next(e); }
});

// ── Bildirimler ───────────────────────────────────────────────────────────
opsRouter.get('/notifications', async (req, res, next) => {
  try { res.json(await listStaffNotifications(req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/notifications/:id/read', async (req, res, next) => {
  try { await markRead(uuid.parse(req.params['id']), { staffId: req.staff!.id }); res.status(204).end(); } catch (e) { next(e); }
});

opsRouter.get('/runs', async (_req, res, next) => {
  try {
    res.json(await listRuns(100));
  } catch (e) {
    next(e);
  }
});

opsRouter.get('/runs/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params['id']);
    const { run, steps } = await getRun(id);
    res.json({ run, steps, log: await readRunLog(id) });
  } catch (e) {
    next(e);
  }
});

/** K0 demo: runner boru hattını uçtan uca gösteren `echo` çalıştırması (gerçek IaC yok). */
opsRouter.post('/runs/echo', requireStaffRole('operator'), async (req, res, next) => {
  try {
    const run = await createRun({ kind: 'echo', staffId: req.staff!.id, payload: { lines: 8 } });
    res.status(201).json(run);
  } catch (e) {
    next(e);
  }
});

opsRouter.get('/evidence/platform', async (_req, res, next) => {
  try {
    const [events, verdict] = await Promise.all([listEvidence(null, { limit: 100 }), verifyEvidenceChain(null)]);
    res.json({ events, verdict });
  } catch (e) {
    next(e);
  }
});

/** Yalnız development: kanıt zincirini doldurup UI'ı görmek için. Prod'da 404. */
opsRouter.post(
  '/evidence/demo',
  validate(z.object({ kind: z.enum(EVIDENCE_KINDS).default('patch.applied'), note: z.string().max(200).default('demo') })),
  async (req, res, next) => {
    try {
      if (env.NODE_ENV !== 'development') throw ApiError.notFound();
      const ev = await appendEvidence({
        tenantId: null,
        kind: req.body.kind,
        subjectType: 'demo',
        subjectId: 'k0',
        payload: { note: req.body.note, by: req.staff!.email },
        actor: `staff:${req.staff!.id}`,
      });
      await audit({ actorType: 'staff', actorId: req.staff!.id, action: 'evidence.demo', subjectType: 'evidence', subjectId: ev.id });
      res.status(201).json(ev);
    } catch (e) {
      next(e);
    }
  },
);
