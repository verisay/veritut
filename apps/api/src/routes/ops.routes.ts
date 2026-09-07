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
import { provisionRequestSchema } from '@veritut/validators';
import { listBlueprints, loadBlueprints } from '../services/blueprint.service.js';
import { approveRun, listChanges, rejectRun, requestDestroy, requestProvision, requestResize } from '../services/provisioning.service.js';
import { featureOverrideSchema, publishVersionSchema, upsertPlanSchema, upsertPriceSchema, upsertProductSchema, upsertSlaSchema } from '@veritut/validators';
import { listPlans, listPrices, listProducts, listSlaTiers, listVersions, publishProductVersion, upsertPlan, upsertPrice, upsertProduct, upsertSlaTier } from '../services/catalog.service.js';
import { clearOverride, getFeatures, effectivePlanCode, setOverride } from '../services/entitlement.service.js';
import { listAllOrders, rejectOrder } from '../services/order.service.js';
import { computeKpi, listKpi } from '../services/kpi.service.js';
import { pushPeriod, expireTrials } from '../services/billing.service.js';
import { createIncidentSchema, drillTriggerSchema, incidentUpdateSchema, maintenanceSchema, oncallShiftSchema, pauseClockSchema, postmortemSchema, resolveIncidentSchema, slaComputeSchema } from '@veritut/validators';
import { addUpdate, createIncident, createMaintenance, escalateDueIncidents, getIncident, listIncidents, listMaintenance, markBreaches, resolveIncident, setClockPaused, writePostmortem } from '../services/incident.service.js';
import { createShift, deleteShift, currentOncall, listShifts } from '../services/oncall.service.js';
import { applyCredits, computeSlaPeriod, listSlaPeriods } from '../services/sla.service.js';
import { listDrills, scheduleMonthlyDrills, triggerDrill } from '../services/drill.service.js';
import { acknowledgeDrift, listDrift, scheduleDriftPlans } from '../services/drift.service.js';
import { alertNoiseReport, listAlerts } from '../services/alert.service.js';
import { generateDpa, generateEvidenceBundle, generateSlaReport, generateSubprocessors } from '../services/document.service.js';

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

// ── Blueprint kataloğu + provizyon (K2) ───────────────────────────────────
opsRouter.get('/blueprints', async (_req, res, next) => {
  try { res.json(await listBlueprints()); } catch (e) { next(e); }
});
opsRouter.post('/blueprints/reload', requireStaffRole('platform_admin'), async (_req, res, next) => {
  try { res.json({ n: (await loadBlueprints(true)).size }); } catch (e) { next(e); }
});
opsRouter.post('/workloads/provision', validate(provisionRequestSchema), async (req, res, next) => {
  try { res.status(201).json(await requestProvision(req.body, req.staff!.id, req.ip ?? null)); } catch (e) { next(e); }
});
opsRouter.post('/workloads/:id/destroy', requireStaffRole('senior'), async (req, res, next) => {
  try { res.status(201).json(await requestDestroy(uuid.parse(req.params['id']), req.staff!.id, req.ip ?? null)); } catch (e) { next(e); }
});
opsRouter.post('/workloads/:id/resize', validate(z.object({ size: z.string().min(1).max(40) })), async (req, res, next) => {
  try { res.status(201).json(await requestResize(uuid.parse(req.params['id']), req.body.size, req.staff!.id, req.ip ?? null)); } catch (e) { next(e); }
});
opsRouter.post('/runs/:id/approve', requireStaffRole('senior'), async (req, res, next) => {
  try { await approveRun(uuid.parse(req.params['id']), req.staff!.id, req.ip ?? null); res.status(204).end(); } catch (e) { next(e); }
});
opsRouter.post('/runs/:id/reject', requireStaffRole('senior'), validate(z.object({ reason: z.string().min(2).max(500) })), async (req, res, next) => {
  try { await rejectRun(uuid.parse(req.params['id']), req.staff!.id, req.body.reason, req.ip ?? null); res.status(204).end(); } catch (e) { next(e); }
});
opsRouter.get('/changes', async (_req, res, next) => {
  try { res.json(await listChanges()); } catch (e) { next(e); }
});

// ── Katalog yönetimi (K3) ─────────────────────────────────────────────────
opsRouter.get('/catalog', async (_req, res, next) => {
  try {
    const [products, plans, slas, prices] = await Promise.all([listProducts(), listPlans(false), listSlaTiers(false), listPrices()]);
    const withVersions = await Promise.all(products.map(async (p) => ({ ...p, versions: await listVersions(p.slug) })));
    res.json({ products: withVersions, plans, slaTiers: slas, prices: prices.map((x) => ({ ...x, monthly: Number(x.monthly), setupFee: Number(x.setupFee) })) });
  } catch (e) { next(e); }
});
opsRouter.put('/catalog/products', requireStaffRole('platform_admin'), validate(upsertProductSchema), async (req, res, next) => {
  try { res.json(await upsertProduct(req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/catalog/products/:slug/publish', requireStaffRole('platform_admin'), validate(publishVersionSchema), async (req, res, next) => {
  try { res.status(201).json(await publishProductVersion(String(req.params['slug']), req.body.blueprintVersion, req.body.notes, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.put('/catalog/plans', requireStaffRole('platform_admin'), validate(upsertPlanSchema), async (req, res, next) => {
  try { res.json(await upsertPlan(req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.put('/catalog/sla-tiers', requireStaffRole('platform_admin'), validate(upsertSlaSchema), async (req, res, next) => {
  try { res.json(await upsertSlaTier(req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.put('/catalog/prices', requireStaffRole('platform_admin'), validate(upsertPriceSchema), async (req, res, next) => {
  try { res.json(await upsertPrice(req.body, req.staff!.id)); } catch (e) { next(e); }
});

// ── Siparişler + entitlement ──────────────────────────────────────────────
opsRouter.get('/orders', async (_req, res, next) => {
  try { res.json(await listAllOrders()); } catch (e) { next(e); }
});
opsRouter.post('/orders/:id/reject', requireStaffRole('senior'), validate(z.object({ reason: z.string().min(2).max(500) })), async (req, res, next) => {
  try { await rejectOrder(uuid.parse(req.params['id']), req.body.reason, req.staff!.id); res.status(204).end(); } catch (e) { next(e); }
});
opsRouter.get('/tenants/:id/entitlement', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params['id']);
    const [planCode, features] = await Promise.all([effectivePlanCode(id), getFeatures(id)]);
    res.json({ planCode, features });
  } catch (e) { next(e); }
});
opsRouter.put('/tenants/:id/entitlement', requireStaffRole('senior'), validate(featureOverrideSchema), async (req, res, next) => {
  try { await setOverride(uuid.parse(req.params['id']), req.body.feature, req.body.value, req.body.note, req.staff!.id); res.status(204).end(); } catch (e) { next(e); }
});
opsRouter.delete('/tenants/:id/entitlement/:feature', requireStaffRole('senior'), async (req, res, next) => {
  try { await clearOverride(uuid.parse(req.params['id']), String(req.params['feature']), req.staff!.id); res.status(204).end(); } catch (e) { next(e); }
});

// ── KPI + dönem kapanışı ──────────────────────────────────────────────────
opsRouter.get('/kpi', async (_req, res, next) => {
  try { res.json(await listKpi()); } catch (e) { next(e); }
});
opsRouter.post('/kpi/compute', async (req, res, next) => {
  try { res.json(await computeKpi(periodSchema.parse(req.body?.period ?? new Date().toISOString().slice(0, 7)))); } catch (e) { next(e); }
});
opsRouter.post('/billing/push', requireStaffRole('senior'), async (req, res, next) => {
  try { res.json(await pushPeriod(periodSchema.parse(req.body?.period ?? new Date().toISOString().slice(0, 7)))); } catch (e) { next(e); }
});
opsRouter.post('/billing/expire-trials', requireStaffRole('senior'), async (_req, res, next) => {
  try { res.json({ expired: await expireTrials() }); } catch (e) { next(e); }
});

// ── Olaylar (K4) ──────────────────────────────────────────────────────────
opsRouter.get('/incidents', async (req, res, next) => {
  try { res.json(await listIncidents({ open: req.query['acik'] === '1', tenantId: typeof req.query['tenant'] === 'string' ? req.query['tenant'] : undefined })); } catch (e) { next(e); }
});
opsRouter.post('/incidents', validate(createIncidentSchema), async (req, res, next) => {
  try { res.status(201).json(await createIncident(req.body, req.staff!.id, 'manual')); } catch (e) { next(e); }
});
opsRouter.get('/incidents/:id', async (req, res, next) => {
  try { res.json(await getIncident(uuid.parse(req.params['id']))); } catch (e) { next(e); }
});
opsRouter.post('/incidents/:id/updates', validate(incidentUpdateSchema), async (req, res, next) => {
  try { res.json(await addUpdate(uuid.parse(req.params['id']), req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/incidents/:id/pause', validate(pauseClockSchema), async (req, res, next) => {
  try { res.json(await setClockPaused(uuid.parse(req.params['id']), req.body.paused, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/incidents/:id/resolve', validate(resolveIncidentSchema), async (req, res, next) => {
  try { res.json(await resolveIncident(uuid.parse(req.params['id']), req.body.body, req.body.customerVisible, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/incidents/:id/postmortem', validate(postmortemSchema), async (req, res, next) => {
  try { res.json(await writePostmortem(uuid.parse(req.params['id']), req.body.postmortem, req.staff!.id)); } catch (e) { next(e); }
});
/** SLA saati elle tetikleme (cron her dakika koşar; nöbet provası ve teşhis için). */
opsRouter.post('/incidents/escalate-due', async (_req, res, next) => {
  try { res.json({ escalated: await escalateDueIncidents(), breached: await markBreaches() }); } catch (e) { next(e); }
});
opsRouter.get('/alerts', async (_req, res, next) => {
  try { res.json({ alerts: await listAlerts(), noise: await alertNoiseReport() }); } catch (e) { next(e); }
});

// ── Bakım pencereleri + nöbet ─────────────────────────────────────────────
opsRouter.get('/maintenance', async (_req, res, next) => {
  try { res.json(await listMaintenance({})); } catch (e) { next(e); }
});
opsRouter.post('/maintenance', validate(maintenanceSchema), async (req, res, next) => {
  try { res.status(201).json(await createMaintenance(req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.get('/oncall', async (_req, res, next) => {
  try { res.json({ shifts: await listShifts(), current: await currentOncall(1), backup: await currentOncall(2) }); } catch (e) { next(e); }
});
opsRouter.post('/oncall', requireStaffRole('senior'), validate(oncallShiftSchema), async (req, res, next) => {
  try { res.status(201).json(await createShift(req.body, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.delete('/oncall/:id', requireStaffRole('senior'), async (req, res, next) => {
  try { await deleteShift(uuid.parse(req.params['id']), req.staff!.id); res.status(204).end(); } catch (e) { next(e); }
});

// ── SLA + tatbikat + sapma ────────────────────────────────────────────────
opsRouter.get('/sla', async (req, res, next) => {
  try { res.json(await listSlaPeriods({ period: typeof req.query['period'] === 'string' ? req.query['period'] : undefined })); } catch (e) { next(e); }
});
opsRouter.post('/sla/compute', validate(slaComputeSchema), async (req, res, next) => {
  try { const r = await computeSlaPeriod(req.body.period, req.body.tenantId); res.json({ ...r, creditsApplied: await applyCredits(req.body.period) }); } catch (e) { next(e); }
});
opsRouter.get('/drills', async (_req, res, next) => {
  try { res.json(await listDrills({})); } catch (e) { next(e); }
});
opsRouter.post('/drills', validate(drillTriggerSchema), async (req, res, next) => {
  try { res.status(201).json(await triggerDrill(req.body.workloadId, req.staff!.id)); } catch (e) { next(e); }
});
opsRouter.post('/drills/schedule', requireStaffRole('senior'), async (_req, res, next) => {
  try { res.json({ scheduled: await scheduleMonthlyDrills() }); } catch (e) { next(e); }
});
opsRouter.get('/drift', async (req, res, next) => {
  try { res.json(await listDrift({ unacknowledgedOnly: req.query['yeni'] === '1' })); } catch (e) { next(e); }
});
const driftScanBody = z.object({ workloadId: z.string().uuid().optional() });
opsRouter.post('/drift/scan', requireStaffRole('senior'), async (req, res, next) => {
  try {
    const b = driftScanBody.parse(req.body ?? {});
    res.json({ scheduled: await scheduleDriftPlans(b.workloadId ? 1 : 20, { workloadId: b.workloadId }) });
  } catch (e) {
    next(e);
  }
});
opsRouter.post('/drift/:id/acknowledge', async (req, res, next) => {
  try { res.json(await acknowledgeDrift(uuid.parse(req.params['id']), req.staff!.id)); } catch (e) { next(e); }
});

// ── Belgeler (ops adına üretim) ───────────────────────────────────────────
opsRouter.post('/tenants/:id/documents/:kind', requireStaffRole('senior'), async (req, res, next) => {
  try {
    const tid = uuid.parse(req.params['id']);
    const kind = String(req.params['kind']);
    const p = typeof req.body?.period === 'string' ? req.body.period : new Date().toISOString().slice(0, 7);
    if (kind === 'dpa') return void res.status(201).json(await generateDpa(tid));
    if (kind === 'subprocessors') return void res.status(201).json(await generateSubprocessors(tid));
    if (kind === 'sla_report') return void res.status(201).json(await generateSlaReport(tid, p));
    if (kind === 'evidence_bundle') return void res.status(201).json(await generateEvidenceBundle(tid, p));
    throw ApiError.badRequest('Bilinmeyen belge türü');
  } catch (e) { next(e); }
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

const runsQuery = z.object({
  kind: z.string().min(1).optional(),
  workloadId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
opsRouter.get('/runs', async (req, res, next) => {
  try {
    const q = runsQuery.parse(req.query);
    res.json(await listRuns(q.limit, { kind: q.kind, workloadId: q.workloadId }));
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
