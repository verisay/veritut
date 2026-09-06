import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { ALERT_TO_INCIDENT, type AlertSeverity } from '@veritut/types';
import type { z } from 'zod';
import type { alertmanagerSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { alerts, components, incidentWorkloads, incidents, workloads } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import { createIncident } from './incident.service.js';

/**
 * Alertmanager → alarm → olay kuralı (plan §8.3).
 * Kural: aynı iş yükünde 5 dk içinde ≥1 `critical` alarm → otomatik olay (sev2), müşteri görünürlüğü
 * operatör onayıyla açılır (yanlış alarmla müşteriyi telaşlandırmamak için).
 */
export async function applyAlertmanager(payload: z.infer<typeof alertmanagerSchema>) {
  let created = 0;
  let incidentsOpened = 0;
  for (const a of payload.alerts) {
    const labels = a.labels as Record<string, string>;
    const severity = (['critical', 'warning', 'info'].includes(labels['severity'] ?? '') ? labels['severity'] : 'warning') as AlertSeverity;
    let workloadId: string | null = null;
    let tenantId: string | null = null;
    if (labels['workload']) {
      const [w] = await db.select({ id: workloads.id, tenantId: workloads.tenantId }).from(workloads).where(eq(workloads.slug, labels['workload'])).limit(1);
      workloadId = w?.id ?? null;
      tenantId = w?.tenantId ?? null;
    }
    if (!workloadId && labels['component']) {
      const [c] = await db.select({ workloadId: components.workloadId, tenantId: components.tenantId }).from(components).where(eq(components.slug, labels['component'])).limit(1);
      workloadId = c?.workloadId ?? null;
      tenantId = c?.tenantId ?? null;
    }
    const startsAt = new Date(a.startsAt);
    const [row] = await db
      .insert(alerts)
      .values({
        fingerprint: a.fingerprint,
        status: a.status,
        severity,
        alertname: labels['alertname'] ?? 'unknown',
        labels,
        annotations: a.annotations,
        tenantId,
        workloadId,
        startsAt,
        endsAt: a.status === 'resolved' && a.endsAt ? new Date(a.endsAt) : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({ target: [alerts.fingerprint, alerts.startsAt], set: { status: a.status, endsAt: a.status === 'resolved' && a.endsAt ? new Date(a.endsAt) : null, annotations: a.annotations, updatedAt: new Date() } })
      .returning();
    created++;
    if (a.status !== 'firing' || severity === 'info') continue;

    // Aynı alarmın açık olayı var mı? (5 dk penceresi)
    const [openIncident] = await db
      .select({ id: incidents.id })
      .from(alerts)
      .innerJoin(incidents, eq(incidents.id, alerts.incidentId))
      .where(and(eq(alerts.fingerprint, a.fingerprint), sql`${incidents.status} NOT IN ('resolved','postmortem_done')`))
      .limit(1);
    if (openIncident) {
      await db.update(alerts).set({ incidentId: openIncident.id }).where(eq(alerts.id, row!.id));
      continue;
    }
    // Aynı iş yükünde son 5 dk içinde açılmış olay varsa ona bağla (alarm fırtınası tek olaya düşer).
    if (workloadId) {
      const [recent] = await db
        .select({ id: incidents.id })
        .from(incidents)
        .innerJoin(incidentWorkloads, eq(incidentWorkloads.incidentId, incidents.id))
        .where(and(eq(incidentWorkloads.workloadId, workloadId), sql`${incidents.status} NOT IN ('resolved','postmortem_done')`, gte(incidents.createdAt, new Date(Date.now() - 5 * 60_000))))
        .limit(1);
      if (recent) {
        await db.update(alerts).set({ incidentId: recent.id }).where(eq(alerts.id, row!.id));
        continue;
      }
    }
    const inc = await createIncident(
      {
        title: a.annotations['summary'] ?? labels['alertname'] ?? 'İzleme alarmı',
        summary: a.annotations['description'] ?? `Alarm: ${labels['alertname']} · ${Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(' ')}`,
        severity: ALERT_TO_INCIDENT[severity],
        tenantId,
        workloadIds: workloadId ? [workloadId] : [],
        customerVisible: false,
      },
      null,
      'alert',
    );
    await db.update(alerts).set({ incidentId: inc.id }).where(eq(alerts.id, row!.id));
    incidentsOpened++;
    logger.info({ alertname: labels['alertname'], incident: inc.number }, 'alarmdan olay açıldı');
  }
  return { alerts: created, incidentsOpened };
}

export async function listAlerts(limit = 100) {
  return db.select().from(alerts).orderBy(desc(alerts.startsAt)).limit(limit);
}

/** Gürültü raporu (haftalık): en çok tekrar eden ve olaya dönüşmeyen alarmlar. */
export async function alertNoiseReport(days = 7) {
  const since = new Date(Date.now() - days * 86400_000);
  return db
    .select({ alertname: alerts.alertname, n: sql<number>`count(*)::int`, incidents: sql<number>`count(${alerts.incidentId})::int` })
    .from(alerts)
    .where(gte(alerts.startsAt, since))
    .groupBy(alerts.alertname)
    .orderBy(sql`count(*) desc`)
    .limit(20);
}

export { isNull };
