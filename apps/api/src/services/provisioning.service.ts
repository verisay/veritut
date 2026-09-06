import { and, desc, eq, sql } from 'drizzle-orm';
import {
  checkResidency,
  requiresApproval,
  riskFor,
  runMachine,
  transition,
  workloadMachine,
  type PlanSummary,
  type ProviderCode,
  type Residency,
  type RunKind,
  type RunStatus,
  type WorkloadStatus,
} from '@veritut/types';
import { compileInputs, splitSecrets, type ProvisionRequest } from '@veritut/validators';
import type { z } from 'zod';
import type { registerWorkloadSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { backupPolicies, backupRepos, changes, providerAccounts, runs, tenants, workloadSecrets, workloads } from '../db/schema/index.js';
import { env } from '../config/env.js';
import { seal } from '../lib/seal.js';
import { redis } from '../redis.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { getBlueprint } from './blueprint.service.js';
import { appendEvidence } from './evidence.service.js';
import { createRun, runChannel } from './run.service.js';
import { syncWorkloadComponent } from './workload.service.js';
import { notifyStaff, notifyTenant } from './notification.service.js';

/** Hetzner/mock bölge → ikametgâh (driver capabilities ile aynı tablo; K5'te driver'dan okunur). */
const REGION_RESIDENCY: Record<string, Residency> = { fsn1: 'EU', nbg1: 'EU', hel1: 'EU', ash: 'US', hil: 'US', 'tr-ist': 'TR', 'eu-fra': 'EU', local: 'TR' };

async function setWorkloadStatus(id: string, to: WorkloadStatus, patch: Partial<typeof workloads.$inferInsert> = {}) {
  const [cur] = await db.select({ status: workloads.status }).from(workloads).where(eq(workloads.id, id)).limit(1);
  if (!cur) throw ApiError.notFound('İş yükü bulunamadı');
  const next = transition(workloadMachine, cur.status as WorkloadStatus, to);
  await db.update(workloads).set({ status: next, ...patch }).where(eq(workloads.id, id));
}

/**
 * Provizyon isteği (ops K2; portal sipariş K3 aynı fonksiyonu çağırır):
 * blueprint çöz → inputs derle → politika (ikametgâh × bölge, tedarikçi) → workload(requested) + sırlar mühürlü → run(provision).
 */
export async function requestProvision(req: ProvisionRequest, staffId: string | null, ip: string | null) {
  const bp = await getBlueprint(req.blueprint, req.version);
  const [t] = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(eq(tenants.id, req.tenantId)).limit(1);
  if (!t) throw ApiError.notFound('Kiracı bulunamadı');
  const [acc] = await db.select().from(providerAccounts).where(eq(providerAccounts.id, req.providerAccountId)).limit(1);
  if (!acc || !acc.active) throw ApiError.badRequest('Tedarikçi hesabı yok veya pasif');
  if (!acc.credentialsSealed) throw ApiError.badRequest('Tedarikçi hesabının kimlik bilgisi yok');
  const provider = acc.providerCode as ProviderCode;
  if (!bp.providers.includes(provider)) throw ApiError.badRequest(`Blueprint ${provider} tedarikçisini desteklemiyor`);
  if (!bp.residencies.includes(req.residency)) throw ApiError.badRequest(`Blueprint ${req.residency} ikametgâhını desteklemiyor`);
  const regions = bp.regions[provider] ?? [];
  if (regions.length > 0 && !regions.includes(req.region)) throw ApiError.badRequest(`Bölge ${req.region} bu blueprint/tedarikçi için tanımlı değil`);
  const size = bp.sizes.find((s) => s.code === req.size);
  if (!size) throw ApiError.badRequest('Boyut geçersiz');
  const regionRes = REGION_RESIDENCY[req.region] ?? null;
  if (regionRes) {
    const v = checkResidency({ workload: req.residency, region: regionRes });
    if (v.length) throw new ApiError(422, 'İkametgâh politikası ihlali', 'POLICY_VIOLATION', v.map((x) => ({ policy: 'residency', code: `${x.subject}:${x.actual}→${x.expected}` })));
  }
  const parsedInputs = compileInputs(bp.inputs).safeParse(req.inputs);
  if (!parsedInputs.success) throw new ApiError(422, 'Blueprint girdileri geçersiz', 'VALIDATION_ERROR', parsedInputs.error.flatten().fieldErrors);
  const { plain, secrets } = splitSecrets(bp.inputs, parsedInputs.data);

  const [dup] = await db.select({ id: workloads.id }).from(workloads).where(and(eq(workloads.tenantId, t.id), eq(workloads.slug, req.slug))).limit(1);
  if (dup) throw ApiError.conflict('Bu kiracıda aynı kısa adlı iş yükü var');

  const w = await db.transaction(async (tx) => {
    const [w] = await tx
      .insert(workloads)
      .values({
        tenantId: t.id,
        slug: req.slug,
        name: req.name,
        productSlug: bp.product_slug,
        blueprintSlug: bp.slug,
        blueprintVersion: bp.version,
        residency: req.residency,
        providerCode: provider,
        providerAccountId: acc.id,
        region: req.region,
        size: req.size,
        slaTier: req.slaTier,
        status: workloadMachine.initial,
        inputs: plain,
      })
      .returning();
    for (const [name, value] of Object.entries(secrets)) {
      await tx.insert(workloadSecrets).values({ workloadId: w!.id, name, valueSealed: seal(value, env.RUNNER_PUBLIC_KEY) });
    }
    return w!;
  });
  // Yedek politikası: blueprint'in politikası + ikametgâh/3-2-1'e uyan depolar (yoksa ops uyarısı, K2 kabul: kurulumla birlikte politika)
  if (bp.backup_policy) await autoBackupPolicy(w.id, req.residency, provider, bp.backup_policy);

  const run = await createRun({ kind: 'provision', tenantId: t.id, workloadId: w.id, providerAccountId: acc.id, staffId, payload: { blueprint: bp.slug, version: bp.version, tenantSlug: t.slug, workloadSlug: w.slug, region: req.region, size: req.size, sizeVars: size.vars, residency: req.residency, provider } });
  await setWorkloadStatus(w.id, 'provisioning', { lastRunId: run.id });
  await audit({ actorType: staffId ? 'staff' : 'system', actorId: staffId, tenantId: t.id, action: 'workload.provision_request', subjectType: 'workload', subjectId: w.id, after: { blueprint: `${bp.slug}@${bp.version}`, region: req.region, size: req.size }, ip });
  const [fresh] = await db.select().from(workloads).where(eq(workloads.id, w.id)).limit(1);
  const { accessSealed: _a, ...safe } = fresh!;
  return { workload: safe, run };
}

async function autoBackupPolicy(workloadId: string, residency: Residency, provider: ProviderCode, pol: { schedule: string; retention: string; paths: string[] }) {
  const repos = await db.select().from(backupRepos).where(eq(backupRepos.active, true));
  const okRes = (r: string) => checkResidency({ workload: residency, region: residency, primaryBackup: r as Residency }).length === 0;
  const primary = repos.find((r) => okRes(r.residency) && r.credentialsSealed);
  const offsite = primary ? repos.find((r) => r.id !== primary.id && okRes(r.residency) && r.providerCode !== primary.providerCode && r.credentialsSealed) : undefined;
  if (!primary || !offsite) {
    await notifyStaff({ kind: 'system', title: 'Yedek politikası otomatik kurulamadı', body: `İş yükü ${workloadId}: ${residency} ikametgâhına uygun birincil+offsite (farklı tedarikçi) depo çifti yok. Depo tanımlayıp politikayı elle kaydedin.`, link: `/is-yukleri/${workloadId}` }, 'operator');
    return;
  }
  await db.insert(backupPolicies).values({ workloadId, primaryRepoId: primary.id, offsiteRepoId: offsite.id, schedule: pol.schedule, retention: pol.retention, paths: pol.paths, enabled: true }).onConflictDoNothing();
  void provider;
}

/** Runner plan raporu → risk → yüksekse `awaiting_approval` + change kaydı + kıdemli bildirimi. */
export async function reportPlan(runId: string, plan: PlanSummary): Promise<{ status: RunStatus; risk: string }> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw ApiError.notFound('Çalıştırma bulunamadı');
  const risk = riskFor(run.kind as RunKind, plan);
  let status = run.status as RunStatus;
  await db.update(runs).set({ planSummary: plan, risk }).where(eq(runs.id, runId));
  if (requiresApproval(risk) && status === 'running' && !run.approvedBy) {
    status = transition(runMachine, status, 'awaiting_approval');
    await db.update(runs).set({ status }).where(eq(runs.id, runId));
    await db.insert(changes).values({ tenantId: run.tenantId, workloadId: run.workloadId, kind: run.kind, risk, status: 'draft', requestedBy: run.triggeredByStaff, runId, summary: { plan } });
    await notifyStaff({ kind: 'system', title: `Onay bekliyor: ${run.kind} (${plan.destroy} silme, ${plan.replace} yeniden yaratma)`, body: 'Yüksek riskli değişiklik — talep edenden farklı bir kıdemli operatör onaylamalı.', link: `/calistirmalar/${runId}` }, 'senior');
    await redis.publish(runChannel(runId), JSON.stringify({ type: 'awaiting_approval', risk }));
  }
  return { status, risk };
}

/** Runner onay yoklaması: approved → running'e geçirilip `approved`; rejected → `cancelled`. */
export async function approvalState(runId: string): Promise<'pending' | 'approved' | 'rejected'> {
  const [run] = await db.select({ status: runs.status, approvedBy: runs.approvedBy }).from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw ApiError.notFound('Çalıştırma bulunamadı');
  if (run.status === 'cancelled') return 'rejected';
  if (run.status === 'running' && run.approvedBy) return 'approved';
  return 'pending';
}

/** Dört-göz: onaylayan ≠ talep eden; kıdemli rol middleware'de. */
export async function approveRun(runId: string, staffId: string, ip: string | null) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw ApiError.notFound('Çalıştırma bulunamadı');
  if (run.status !== 'awaiting_approval') throw ApiError.conflict('Çalıştırma onay beklemiyor');
  if (run.triggeredByStaff && run.triggeredByStaff === staffId) throw ApiError.forbidden('Dört-göz kuralı: talep eden onaylayamaz');
  const next = transition(runMachine, 'awaiting_approval', 'running');
  await db.update(runs).set({ status: next, approvedBy: staffId, approvedAt: new Date() }).where(eq(runs.id, runId));
  await db.update(changes).set({ status: 'approved', approvedBy: staffId }).where(and(eq(changes.runId, runId), eq(changes.status, 'draft')));
  await audit({ actorType: 'staff', actorId: staffId, tenantId: run.tenantId, action: 'run.approve', subjectType: 'run', subjectId: runId, after: { kind: run.kind, risk: run.risk }, ip });
  await redis.publish(runChannel(runId), JSON.stringify({ type: 'approved' }));
}

export async function rejectRun(runId: string, staffId: string, reason: string, ip: string | null) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw ApiError.notFound('Çalıştırma bulunamadı');
  if (run.status !== 'awaiting_approval') throw ApiError.conflict('Çalıştırma onay beklemiyor');
  await db.update(runs).set({ status: transition(runMachine, 'awaiting_approval', 'cancelled'), rejectedReason: reason, finishedAt: new Date() }).where(eq(runs.id, runId));
  await db.update(changes).set({ status: 'rejected', approvedBy: staffId, summary: sql`${changes.summary} || ${JSON.stringify({ reason })}::jsonb` }).where(and(eq(changes.runId, runId), eq(changes.status, 'draft')));
  if (run.workloadId && run.kind === 'provision') await setWorkloadStatus(run.workloadId, 'failed');
  // Reddedilen resize/upgrade: iş yükü eski hâline (boyut + active) döner; destroy: decommissioning → active.
  if (run.workloadId && (run.kind === 'resize' || run.kind === 'upgrade' || run.kind === 'destroy')) {
    const prev = (run.payload as { previousSize?: string }).previousSize;
    const [cur] = await db.select({ status: workloads.status }).from(workloads).where(eq(workloads.id, run.workloadId)).limit(1);
    if (cur && (cur.status === 'provisioning' || cur.status === 'decommissioning')) await setWorkloadStatus(run.workloadId, 'active', prev ? { size: prev } : {});
    else if (prev) await db.update(workloads).set({ size: prev }).where(eq(workloads.id, run.workloadId));
  }
  await audit({ actorType: 'staff', actorId: staffId, tenantId: run.tenantId, action: 'run.reject', subjectType: 'run', subjectId: runId, after: { reason }, ip });
  await redis.publish(runChannel(runId), JSON.stringify({ type: 'rejected', reason }));
}

/** Runner `register`: uç noktalar, erişim bilgisi (API mühürler), izleme hedefleri, çıktı; Prometheus hedefleri worker `file_sd`'ye yazar (K2 sonu). */
export async function registerWorkload(workloadId: string, r: z.infer<typeof registerWorkloadSchema>) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const outputs = Object.fromEntries(Object.entries(r.outputs).filter(([k]) => !/pass|secret|token|key/i.test(k)));
  await db
    .update(workloads)
    .set({ endpoints: r.endpoints, monitoringTargets: r.monitoringTargets, probeUrl: r.probeUrl ?? w.probeUrl, outputs, accessSealed: r.access ? seal(JSON.stringify(r.access), env.RUNNER_PUBLIC_KEY) : w.accessSealed })
    .where(eq(workloads.id, workloadId));
  await syncWorkloadComponent(workloadId);
  return { ok: true };
}

/** Runner `handoff`: verify yeşilse active + kanıt + müşteri bildirimi; değilse degraded (teslim edilmez). */
export async function handoffWorkload(workloadId: string, runId: string, verifyOk: boolean, checkResults: Array<{ name: string; ok: boolean; detail?: string }>) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const [run] = await db.select({ kind: runs.kind }).from(runs).where(eq(runs.id, runId)).limit(1);
  const kind = (run?.kind ?? 'provision') as RunKind;
  await setWorkloadStatus(workloadId, verifyOk ? 'active' : 'degraded', { provisionedAt: kind === 'provision' ? new Date() : w.provisionedAt, lastRunId: runId });
  const ev = await appendEvidence({
    tenantId: w.tenantId,
    kind: kind === 'provision' ? 'workload.provisioned' : 'workload.upgraded',
    subjectType: 'workload',
    subjectId: w.id,
    payload: { workloadSlug: w.slug, blueprint: `${w.blueprintSlug}@${w.blueprintVersion}`, provider: w.providerCode, region: w.region, size: w.size, residency: w.residency, runId, verifyOk, checks: checkResults, endpoints: w.endpoints },
    actor: 'runner',
  });
  if (kind === 'provision') {
    await notifyTenant(w.tenantId, ['owner', 'admin', 'technical'], {
      kind: 'system',
      title: verifyOk ? `${w.name} kuruldu ve doğrulandı` : `${w.name} kuruldu, doğrulama eksik — ekibimiz bakıyor`,
      body: verifyOk ? 'Erişim bilgileri portalda, ilk yedek zamanlandı; her adım kanıt defterinizde.' : `Başarısız kontroller: ${checkResults.filter((c) => !c.ok).map((c) => c.name).join(', ')}`,
      link: `/panel/is-yukleri/${w.id}`,
    });
  }
  await db.update(changes).set({ status: verifyOk ? 'verified' : 'executing' }).where(and(eq(changes.runId, runId), eq(changes.status, 'approved')));
  return { evidenceId: ev.id, status: verifyOk ? 'active' : 'degraded' };
}

/** Yıkım (yüksek risk → onay): yedek kanıtı şart (plan §5 workload makinesi). */
export async function requestDestroy(workloadId: string, staffId: string, ip: string | null) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  if (!w.blueprintSlug) throw ApiError.badRequest('Blueprint\'siz (legacy) iş yükü yıkılamaz; kaydı elle kapatın');
  const { backupJobs } = await import('../db/schema/index.js');
  const [lastOk] = await db.select({ id: backupJobs.id }).from(backupJobs).where(and(eq(backupJobs.workloadId, workloadId), eq(backupJobs.status, 'completed'))).orderBy(desc(backupJobs.finishedAt)).limit(1);
  if (!lastOk) throw new ApiError(422, 'Yıkım öncesi başarılı bir yedek kanıtı gerekir', 'BACKUP_REQUIRED');
  // ÖNCE durum geçişi (409 üretebilir), SONRA run — aksi hâlde reddedilen istek kuyrukta yetim run bırakır (K2 smoke bulgusu).
  const bp = await getBlueprint(w.blueprintSlug, w.blueprintVersion ?? '');
  const sizeVars = bp.sizes.find((s) => s.code === w.size)?.vars ?? {};
  await setWorkloadStatus(workloadId, 'decommissioning');
  const [t] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, w.tenantId)).limit(1);
  const run = await createRun({ kind: 'destroy', tenantId: w.tenantId, workloadId, providerAccountId: w.providerAccountId, risk: 'high', staffId, payload: { blueprint: w.blueprintSlug, version: w.blueprintVersion, workloadSlug: w.slug, tenantSlug: t?.slug, region: w.region, size: w.size, sizeVars, residency: w.residency, provider: w.providerCode } });
  await db.update(workloads).set({ lastRunId: run.id }).where(eq(workloads.id, workloadId));
  await audit({ actorType: 'staff', actorId: staffId, tenantId: w.tenantId, action: 'workload.destroy_request', subjectType: 'workload', subjectId: workloadId, ip });
  return run;
}

export async function completeDestroy(workloadId: string, runId: string) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  await setWorkloadStatus(workloadId, 'destroyed', { destroyedAt: new Date(), lastRunId: runId, endpoints: [], monitoringTargets: [], probeUrl: null });
  await syncWorkloadComponent(workloadId);
  await appendEvidence({ tenantId: w.tenantId, kind: 'workload.destroyed', subjectType: 'workload', subjectId: w.id, payload: { workloadSlug: w.slug, runId, provider: w.providerCode, region: w.region }, actor: 'runner' });
  await db.update(changes).set({ status: 'verified' }).where(and(eq(changes.runId, runId), eq(changes.status, 'approved')));
  return { ok: true };
}

/** Boyut değişikliği (resize): plan diff'e göre medium/high. */
export async function requestResize(workloadId: string, size: string, staffId: string, ip: string | null) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w || !w.blueprintSlug || !w.blueprintVersion) throw ApiError.notFound('İş yükü bulunamadı');
  const bp = await getBlueprint(w.blueprintSlug, w.blueprintVersion);
  const s = bp.sizes.find((x) => x.code === size);
  if (!s) throw ApiError.badRequest('Boyut geçersiz');
  if (s.code === w.size) throw ApiError.badRequest('Zaten bu boyutta');
  // ÖNCE durum geçişi (aktif değilse 409), SONRA boyut + run.
  await setWorkloadStatus(workloadId, 'provisioning');
  const [t] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, w.tenantId)).limit(1);
  const run = await createRun({ kind: 'resize', tenantId: w.tenantId, workloadId, providerAccountId: w.providerAccountId, risk: 'medium', staffId, payload: { blueprint: bp.slug, version: bp.version, tenantSlug: t?.slug, workloadSlug: w.slug, region: w.region, size, sizeVars: s.vars, residency: w.residency, provider: w.providerCode, previousSize: w.size } });
  await db.update(workloads).set({ size, lastRunId: run.id }).where(eq(workloads.id, workloadId));
  await audit({ actorType: 'staff', actorId: staffId, tenantId: w.tenantId, action: 'workload.resize_request', subjectType: 'workload', subjectId: workloadId, before: { size: w.size }, after: { size }, ip });
  return run;
}

/** Runner'ın açacağı sırlar: blueprint girdileri (mühürlü) — API çözmez. */
export async function sealedWorkloadSecrets(workloadId: string): Promise<Record<string, string>> {
  const rows = await db.select({ name: workloadSecrets.name, v: workloadSecrets.valueSealed }).from(workloadSecrets).where(eq(workloadSecrets.workloadId, workloadId));
  return Object.fromEntries(rows.map((r) => [r.name, r.v]));
}

export async function listChanges(limit = 100) {
  return db.select().from(changes).orderBy(desc(changes.createdAt)).limit(limit);
}

/** Runner hata bildirimi: provisioning'deki iş yükü `failed`; aktif iş yükünde resize/upgrade hatası → `degraded`. */
export async function failWorkload(workloadId: string, runId: string, error: string) {
  const [w] = await db.select({ status: workloads.status, tenantId: workloads.tenantId, slug: workloads.slug }).from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  const cur = w.status as WorkloadStatus;
  if (cur === 'provisioning') {
    const [run] = await db.select({ kind: runs.kind }).from(runs).where(eq(runs.id, runId)).limit(1);
    await setWorkloadStatus(workloadId, run?.kind === 'provision' ? 'failed' : 'degraded', { lastRunId: runId });
  } else if (cur === 'decommissioning') {
    await setWorkloadStatus(workloadId, 'failed', { lastRunId: runId });
  }
  await db.update(changes).set({ status: 'rolled_back', summary: sql`${changes.summary} || ${JSON.stringify({ error })}::jsonb` }).where(and(eq(changes.runId, runId), eq(changes.status, 'approved')));
  return { ok: true };
}
