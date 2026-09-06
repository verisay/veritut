import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  addSlaMinutes,
  incidentMachine,
  POSTMORTEM_REQUIRED,
  SEVERITY_RESOLVE_FACTOR,
  transition,
  type IncidentSeverity,
  type IncidentStatus,
  type SlaCoverage,
} from '@veritut/types';
import type { z } from 'zod';
import type { createIncidentSchema, incidentUpdateSchema, maintenanceSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { businessCalendar, incidentUpdates, incidentWorkloads, incidents, maintenanceWindows, slaTiers, staff, tenants, workloads } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { appendEvidence } from './evidence.service.js';
import { notifyStaff, notifyTenant } from './notification.service.js';
import { currentOncall, escalate } from './oncall.service.js';
import { dispatchChannels } from './channel.service.js';

/** Olay yönetimi + SLA saati (plan §8.2/§8.3). Saat `open`'da başlar, `resolved`'da durur. */

async function holidays(): Promise<Set<string>> {
  const rows = await db.select({ day: businessCalendar.day }).from(businessCalendar);
  return new Set(rows.map((r) => String(r.day)));
}

/** Etkilenen iş yüklerinin SLA katmanı: en sıkı olan (en kısa yanıt süresi) geçerlidir. */
async function resolveSla(tenantId: string | null, workloadIds: string[]) {
  const codes = new Set<string>();
  if (workloadIds.length) {
    const rows = await db.select({ sla: workloads.slaTier }).from(workloads).where(inArray(workloads.id, workloadIds));
    for (const r of rows) codes.add(r.sla);
  }
  if (codes.size === 0 && tenantId) {
    const rows = await db.select({ sla: workloads.slaTier }).from(workloads).where(and(eq(workloads.tenantId, tenantId), sql`${workloads.status} <> 'destroyed'`));
    for (const r of rows) codes.add(r.sla);
  }
  if (codes.size === 0) return null;
  const rows = await db.select().from(slaTiers).where(inArray(slaTiers.code, [...codes]));
  return rows.sort((a, b) => a.responseMin - b.responseMin)[0] ?? null;
}

export async function createIncident(input: z.infer<typeof createIncidentSchema>, staffId: string | null, source: 'alert' | 'manual' | 'customer' | 'probe' = 'manual') {
  const sla = await resolveSla(input.tenantId ?? null, input.workloadIds);
  const now = new Date();
  const hol = await holidays();
  const coverage = (sla?.coverage ?? '24x7') as SlaCoverage;
  const factor = SEVERITY_RESOLVE_FACTOR[input.severity];
  const responseDueAt = sla ? addSlaMinutes(now, sla.responseMin, coverage, hol) : null;
  const resolveDueAt = sla ? addSlaMinutes(now, Math.round(sla.resolveMin * factor), coverage, hol) : null;

  const inc = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(incidents)
      .values({
        tenantId: input.tenantId ?? null,
        title: input.title,
        summary: input.summary,
        severity: input.severity,
        status: incidentMachine.initial,
        source,
        customerVisible: input.customerVisible,
        slaCode: sla?.code ?? null,
        responseDueAt,
        resolveDueAt,
        createdBy: staffId,
      })
      .returning();
    if (input.workloadIds.length) await tx.insert(incidentWorkloads).values(input.workloadIds.map((workloadId) => ({ incidentId: row!.id, workloadId }))).onConflictDoNothing();
    await tx.insert(incidentUpdates).values({ incidentId: row!.id, body: input.summary || input.title, status: 'open', customerVisible: input.customerVisible, author: staffId ? `staff:${staffId}` : source });
    return row!;
  });

  const oncall = await currentOncall(1);
  await notifyStaff(
    { kind: 'system', title: `${input.severity.toUpperCase()} olay #${inc.number}: ${input.title}`, body: `Yanıt hedefi: ${responseDueAt ? responseDueAt.toISOString() : 'SLA yok'}${oncall ? ` · nöbetçi: ${oncall.email}` : ' · NÖBETÇİ ATANMAMIŞ'}`, link: `/olaylar/${inc.id}` },
    'operator',
  );
  if (input.tenantId && input.customerVisible) {
    await notifyTenant(input.tenantId, ['owner', 'admin', 'technical'], { kind: 'system', title: `Hizmetinizde bir olay açıldı: ${input.title}`, body: 'Ekibimiz çalışıyor; gelişmeleri buradan ve durum sayfasından izleyebilirsiniz.', link: `/panel/olaylar/${inc.id}` });
    await dispatchChannels(input.tenantId, 'incident.opened', { title: input.title, severity: input.severity, incidentId: inc.id, number: inc.number });
  }
  await audit({ actorType: staffId ? 'staff' : 'system', actorId: staffId, tenantId: input.tenantId ?? null, action: 'incident.create', subjectType: 'incident', subjectId: inc.id, after: { severity: input.severity, source } });
  return inc;
}

export async function addUpdate(id: string, input: z.infer<typeof incidentUpdateSchema>, staffId: string) {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  if (!inc) throw ApiError.notFound('Olay bulunamadı');
  let status = inc.status as IncidentStatus;
  if (input.status && input.status !== status) status = transition(incidentMachine, status, input.status);
  const patch: Partial<typeof incidents.$inferInsert> = { status };
  // İlk operatör güncellemesi = ilk yanıt (SLA yanıt saati durur).
  if (!inc.respondedAt) {
    patch.respondedAt = new Date();
    patch.responseBreached = inc.responseDueAt ? new Date() > inc.responseDueAt : false;
  }
  await db.update(incidents).set(patch).where(eq(incidents.id, id));
  await db.insert(incidentUpdates).values({ incidentId: id, body: input.body, status: input.status ?? null, customerVisible: input.customerVisible, author: `staff:${staffId}` });
  if (input.customerVisible && inc.tenantId) {
    await notifyTenant(inc.tenantId, ['owner', 'admin', 'technical'], { kind: 'system', title: `Olay güncellemesi: ${inc.title}`, body: input.body.slice(0, 200), link: `/panel/olaylar/${id}` });
  }
  await audit({ actorType: 'staff', actorId: staffId, tenantId: inc.tenantId, action: 'incident.update', subjectType: 'incident', subjectId: id, after: { status: input.status } });
  return { status };
}

/** Müşteri bilgisi beklenirken saat durur; süre `clock_paused_s`'e eklenir ve raporda gösterilir. */
export async function setClockPaused(id: string, paused: boolean, staffId: string) {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  if (!inc) throw ApiError.notFound('Olay bulunamadı');
  if (paused && !inc.pausedAt) {
    await db.update(incidents).set({ pausedAt: new Date() }).where(eq(incidents.id, id));
  } else if (!paused && inc.pausedAt) {
    const add = Math.round((Date.now() - inc.pausedAt.getTime()) / 1000);
    const hol = await holidays();
    const [sla] = inc.slaCode ? await db.select().from(slaTiers).where(eq(slaTiers.code, inc.slaCode)).limit(1) : [];
    // Duran süre kadar hedefleri ileri al (SLA saati adil olmalı).
    const patch: Partial<typeof incidents.$inferInsert> = { pausedAt: null, clockPausedS: inc.clockPausedS + add };
    if (sla && inc.resolveDueAt) patch.resolveDueAt = addSlaMinutes(inc.resolveDueAt, Math.round(add / 60), sla.coverage as SlaCoverage, hol);
    await db.update(incidents).set(patch).where(eq(incidents.id, id));
  }
  await audit({ actorType: 'staff', actorId: staffId, tenantId: inc.tenantId, action: paused ? 'incident.pause' : 'incident.resume', subjectType: 'incident', subjectId: id });
  return { paused };
}

export async function resolveIncident(id: string, body: string, customerVisible: boolean, staffId: string) {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  if (!inc) throw ApiError.notFound('Olay bulunamadı');
  const status = transition(incidentMachine, inc.status as IncidentStatus, 'resolved');
  const now = new Date();
  await db
    .update(incidents)
    .set({ status, resolvedAt: now, resolveBreached: inc.resolveDueAt ? now > inc.resolveDueAt : false, respondedAt: inc.respondedAt ?? now, pausedAt: null })
    .where(eq(incidents.id, id));
  await db.insert(incidentUpdates).values({ incidentId: id, body, status: 'resolved', customerVisible, author: `staff:${staffId}` });
  const wl = await db.select({ id: incidentWorkloads.workloadId }).from(incidentWorkloads).where(eq(incidentWorkloads.incidentId, id));
  await appendEvidence({
    tenantId: inc.tenantId,
    kind: 'incident.resolved',
    subjectType: 'incident',
    subjectId: id,
    payload: {
      number: inc.number,
      title: inc.title,
      severity: inc.severity,
      openedAt: inc.createdAt.toISOString(),
      resolvedAt: now.toISOString(),
      durationMin: Math.round((now.getTime() - inc.createdAt.getTime()) / 60000),
      pausedSeconds: inc.clockPausedS,
      slaCode: inc.slaCode,
      responseBreached: inc.responseBreached,
      resolveBreached: inc.resolveDueAt ? now > inc.resolveDueAt : false,
      workloads: wl.map((w) => w.id),
    },
    actor: `staff:${staffId}`,
  });
  if (inc.tenantId && (customerVisible || inc.customerVisible)) {
    await notifyTenant(inc.tenantId, ['owner', 'admin', 'technical'], { kind: 'system', title: `Olay çözüldü: ${inc.title}`, body, link: `/panel/olaylar/${id}` });
    await dispatchChannels(inc.tenantId, 'incident.resolved', { title: inc.title, incidentId: id, number: inc.number });
  }
  await audit({ actorType: 'staff', actorId: staffId, tenantId: inc.tenantId, action: 'incident.resolve', subjectType: 'incident', subjectId: id });
  return { status, postmortemRequired: POSTMORTEM_REQUIRED.includes(inc.severity as IncidentSeverity) };
}

/** sev1/sev2 post-mortem'siz kapanmaz (plan §8.3). */
export async function writePostmortem(id: string, text: string, staffId: string) {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  if (!inc) throw ApiError.notFound('Olay bulunamadı');
  const status = transition(incidentMachine, inc.status as IncidentStatus, 'postmortem_done');
  await db.update(incidents).set({ postmortem: text, status }).where(eq(incidents.id, id));
  await audit({ actorType: 'staff', actorId: staffId, tenantId: inc.tenantId, action: 'incident.postmortem', subjectType: 'incident', subjectId: id });
  return { status };
}

export async function listIncidents(opts: { tenantId?: string; open?: boolean; limit?: number; customerVisibleOnly?: boolean } = {}) {
  const where = [];
  if (opts.tenantId) where.push(eq(incidents.tenantId, opts.tenantId));
  if (opts.open) where.push(sql`${incidents.status} NOT IN ('resolved','postmortem_done')`);
  if (opts.customerVisibleOnly) where.push(eq(incidents.customerVisible, true));
  return db
    .select({ incident: incidents, tenantName: tenants.name, assignee: staff.email })
    .from(incidents)
    .leftJoin(tenants, eq(tenants.id, incidents.tenantId))
    .leftJoin(staff, eq(staff.id, incidents.assignedStaffId))
    .where(where.length ? and(...where) : sql`true`)
    .orderBy(desc(incidents.createdAt))
    .limit(opts.limit ?? 100);
}

export async function getIncident(id: string, opts: { tenantId?: string; customerView?: boolean } = {}) {
  const where = [eq(incidents.id, id)];
  if (opts.tenantId) where.push(eq(incidents.tenantId, opts.tenantId));
  if (opts.customerView) where.push(eq(incidents.customerVisible, true));
  const [inc] = await db.select().from(incidents).where(and(...where)).limit(1);
  if (!inc) throw ApiError.notFound();
  const updates = await db
    .select()
    .from(incidentUpdates)
    .where(opts.customerView ? and(eq(incidentUpdates.incidentId, id), eq(incidentUpdates.customerVisible, true)) : eq(incidentUpdates.incidentId, id))
    .orderBy(incidentUpdates.createdAt);
  const wl = await db
    .select({ id: workloads.id, name: workloads.name, slug: workloads.slug })
    .from(incidentWorkloads)
    .innerJoin(workloads, eq(workloads.id, incidentWorkloads.workloadId))
    .where(eq(incidentWorkloads.incidentId, id));
  const safe = opts.customerView ? { ...inc, postmortem: null, createdBy: null, assignedStaffId: null } : inc;
  return { incident: safe, updates, workloads: wl };
}

/** Eskalasyon: yanıt hedefine 15 dk kalan veya hedefi aşan açık olaylar (cron, her dakika). */
export async function escalateDueIncidents(): Promise<number> {
  const soon = new Date(Date.now() + 15 * 60_000);
  const rows = await db
    .select()
    .from(incidents)
    .where(and(sql`${incidents.status} NOT IN ('resolved','postmortem_done')`, isNull(incidents.respondedAt), isNull(incidents.escalatedAt), sql`${incidents.responseDueAt} IS NOT NULL`, lte(incidents.responseDueAt, soon)));
  for (const inc of rows) {
    await db.update(incidents).set({ escalatedAt: new Date(), responseBreached: inc.responseDueAt ? new Date() > inc.responseDueAt : false }).where(eq(incidents.id, inc.id));
    await escalate(inc.id, inc.title, inc.severity as IncidentSeverity, inc.responseDueAt);
    logger.warn({ incidentId: inc.id, number: inc.number }, 'olay eskalasyonu');
  }
  return rows.length;
}

/** Hedefi aşan açık olayları ihlal olarak işaretle (cron). */
export async function markBreaches(): Promise<number> {
  const now = new Date();
  const res = await db
    .update(incidents)
    .set({ resolveBreached: true })
    .where(and(sql`${incidents.status} NOT IN ('resolved','postmortem_done')`, eq(incidents.resolveBreached, false), sql`${incidents.resolveDueAt} IS NOT NULL`, lte(incidents.resolveDueAt, now)))
    .returning({ id: incidents.id });
  return res.length;
}

export async function createMaintenance(input: z.infer<typeof maintenanceSchema>, staffId: string) {
  const [row] = await db
    .insert(maintenanceWindows)
    .values({ tenantId: input.tenantId ?? null, workloadId: input.workloadId ?? null, title: input.title, body: input.body, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), customerVisible: input.customerVisible, createdBy: staffId })
    .returning();
  if (input.tenantId && input.customerVisible) {
    await notifyTenant(input.tenantId, ['owner', 'admin', 'technical'], { kind: 'system', title: `Planlı bakım: ${input.title}`, body: `${new Date(input.startsAt).toLocaleString('tr-TR')} — ${new Date(input.endsAt).toLocaleString('tr-TR')}. ${input.body}`, link: '/panel/olaylar' });
    await dispatchChannels(input.tenantId, 'maintenance.scheduled', { title: input.title, startsAt: input.startsAt, endsAt: input.endsAt });
  }
  await audit({ actorType: 'staff', actorId: staffId, tenantId: input.tenantId ?? null, action: 'maintenance.create', subjectType: 'maintenance', subjectId: row!.id, after: { title: input.title } });
  return row!;
}

export async function listMaintenance(opts: { tenantId?: string; upcomingOnly?: boolean } = {}) {
  const where = [];
  if (opts.tenantId) where.push(or(eq(maintenanceWindows.tenantId, opts.tenantId), isNull(maintenanceWindows.tenantId)));
  if (opts.upcomingOnly) where.push(gte(maintenanceWindows.endsAt, new Date()));
  return db.select().from(maintenanceWindows).where(where.length ? and(...where) : sql`true`).orderBy(desc(maintenanceWindows.startsAt)).limit(50);
}

/** Dönem içi planlı bakım dakikası (uptime hesabında düşülür). */
export async function maintenanceMinutes(period: string, workloadId: string | null, tenantId: string): Promise<number> {
  const start = new Date(`${period}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const rows = await db
    .select({ s: maintenanceWindows.startsAt, e: maintenanceWindows.endsAt })
    .from(maintenanceWindows)
    .where(and(lte(maintenanceWindows.startsAt, end), gte(maintenanceWindows.endsAt, start), or(isNull(maintenanceWindows.tenantId), eq(maintenanceWindows.tenantId, tenantId)), workloadId ? or(isNull(maintenanceWindows.workloadId), eq(maintenanceWindows.workloadId, workloadId)) : sql`true`));
  let min = 0;
  for (const r of rows) {
    const s = Math.max(r.s.getTime(), start.getTime());
    const e = Math.min(r.e.getTime(), end.getTime());
    if (e > s) min += Math.round((e - s) / 60000);
  }
  return min;
}
