import { z } from 'zod';
import { ALERT_SEVERITIES, CHANNEL_EVENTS, CHANNEL_KINDS, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '@veritut/types';
import { periodSchema } from './k1.js';

/** Alertmanager webhook gövdesi (v4). */
export const alertmanagerSchema = z.object({
  version: z.string().optional(),
  status: z.enum(['firing', 'resolved']),
  receiver: z.string().optional(),
  alerts: z
    .array(
      z.object({
        status: z.enum(['firing', 'resolved']),
        labels: z.record(z.string()).default({}),
        annotations: z.record(z.string()).default({}),
        startsAt: z.string(),
        endsAt: z.string().optional(),
        fingerprint: z.string().min(1),
      }),
    )
    .min(1)
    .max(200),
});

export const createIncidentSchema = z.object({
  title: z.string().trim().min(4).max(200),
  summary: z.string().max(4000).default(''),
  severity: z.enum(INCIDENT_SEVERITIES),
  tenantId: z.string().uuid().nullable().optional(),
  workloadIds: z.array(z.string().uuid()).max(50).default([]),
  customerVisible: z.boolean().default(false),
});

export const incidentUpdateSchema = z.object({
  body: z.string().trim().min(2).max(4000),
  status: z.enum(INCIDENT_STATUSES).optional(),
  customerVisible: z.boolean().default(false),
});

export const resolveIncidentSchema = z.object({ body: z.string().trim().min(2).max(4000), customerVisible: z.boolean().default(true) });
export const postmortemSchema = z.object({ postmortem: z.string().trim().min(50, 'Post-mortem en az 50 karakter olmalı').max(20_000) });
export const pauseClockSchema = z.object({ paused: z.boolean() });

export const maintenanceSchema = z
  .object({
    tenantId: z.string().uuid().nullable().optional(),
    workloadId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(4).max(200),
    body: z.string().max(4000).default(''),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    customerVisible: z.boolean().default(true),
  })
  .refine((m) => new Date(m.endsAt) > new Date(m.startsAt), { message: 'Bitiş başlangıçtan sonra olmalı', path: ['endsAt'] });

export const oncallShiftSchema = z
  .object({
    staffId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    escalationLevel: z.coerce.number().int().min(1).max(3).default(1),
  })
  .refine((s) => new Date(s.endsAt) > new Date(s.startsAt), { message: 'Bitiş başlangıçtan sonra olmalı', path: ['endsAt'] });

export const notificationChannelSchema = z.object({
  kind: z.enum(CHANNEL_KINDS),
  label: z.string().trim().min(2).max(60),
  /** E-posta/telefon/URL — mühürlenir, geri okunmaz. */
  target: z.string().trim().min(3).max(500),
  events: z.array(z.enum(CHANNEL_EVENTS)).min(1),
});

export const auditorLinkSchema = z.object({
  label: z.string().trim().min(2).max(80),
  scope: z.array(z.enum(['evidence', 'sla', 'subprocessors'])).min(1).default(['evidence']),
  expiresInDays: z.coerce.number().int().min(1).max(365).default(30),
});

export const drillTriggerSchema = z.object({ workloadId: z.string().uuid() });
export const drillResultSchema = z.object({
  drillId: z.string().uuid(),
  workloadId: z.string().uuid(),
  runId: z.string().uuid().nullable().optional(),
  status: z.enum(['passed', 'failed']),
  snapshotId: z.string().nullable().optional(),
  checksumOk: z.boolean().nullable().optional(),
  appCheckOk: z.boolean().nullable().optional(),
  restoredBytes: z.number().int().nonnegative().nullable().optional(),
  durationS: z.number().int().nonnegative().nullable().optional(),
  error: z.string().max(4000).nullable().optional(),
});

export const driftResultSchema = z.object({
  workloadId: z.string().uuid(),
  runId: z.string().uuid().nullable().optional(),
  hasDrift: z.boolean(),
  diff: z.object({ add: z.number().int(), change: z.number().int(), destroy: z.number().int(), replace: z.number().int(), resources: z.array(z.object({ address: z.string(), action: z.string() })).max(500) }),
});

export const slaComputeSchema = z.object({ period: periodSchema, tenantId: z.string().uuid().optional() });
export const alertSeveritySchema = z.enum(ALERT_SEVERITIES);
