import { pgTable, uuid, text, timestamp, boolean, integer, bigint, jsonb, numeric, date, serial, unique, primaryKey } from 'drizzle-orm/pg-core';
import { tenants, users } from './tenants.js';
import { staff } from './staff.js';
import { workloads, runs } from './workloads.js';
import { backupJobs } from './k1.js';
import { slaTiers } from './k3.js';
import { evidenceEvents } from './evidence.js';

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  fingerprint: text('fingerprint').notNull(),
  status: text('status').notNull(),
  severity: text('severity').notNull().default('warning'),
  alertname: text('alertname').notNull(),
  labels: jsonb('labels').notNull().default({}),
  annotations: jsonb('annotations').notNull().default({}),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  workloadId: uuid('workload_id').references(() => workloads.id, { onDelete: 'set null' }),
  incidentId: uuid('incident_id'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const incidents = pgTable('incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: serial('number'),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  severity: text('severity').notNull(),
  status: text('status').notNull().default('open'),
  source: text('source').notNull().default('alert'),
  customerVisible: boolean('customer_visible').notNull().default(false),
  slaCode: text('sla_code').references(() => slaTiers.code),
  responseDueAt: timestamp('response_due_at', { withTimezone: true }),
  resolveDueAt: timestamp('resolve_due_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  clockPausedS: integer('clock_paused_s').notNull().default(0),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  responseBreached: boolean('response_breached').notNull().default(false),
  resolveBreached: boolean('resolve_breached').notNull().default(false),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  assignedStaffId: uuid('assigned_staff_id').references(() => staff.id),
  postmortem: text('postmortem'),
  createdBy: uuid('created_by').references(() => staff.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const incidentUpdates = pgTable('incident_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  status: text('status'),
  customerVisible: boolean('customer_visible').notNull().default(false),
  author: text('author').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const incidentWorkloads = pgTable(
  'incident_workloads',
  {
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    workloadId: uuid('workload_id')
      .notNull()
      .references(() => workloads.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.incidentId, t.workloadId] })],
);

export const maintenanceWindows = pgTable('maintenance_windows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  workloadId: uuid('workload_id').references(() => workloads.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  customerVisible: boolean('customer_visible').notNull().default(true),
  createdBy: uuid('created_by').references(() => staff.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oncallShifts = pgTable('oncall_shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  escalationLevel: integer('escalation_level').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationChannels = pgTable('notification_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  targetSealed: text('target_sealed').notNull(),
  targetHint: text('target_hint').notNull().default(''),
  events: text('events').array().notNull().default([]),
  active: boolean('active').notNull().default(true),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const slaPeriods = pgTable(
  'sla_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workloadId: uuid('workload_id').references(() => workloads.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    slaCode: text('sla_code')
      .notNull()
      .references(() => slaTiers.code),
    uptimePct: numeric('uptime_pct', { precision: 6, scale: 3 }).notNull().default('100'),
    uptimeTarget: numeric('uptime_target', { precision: 5, scale: 2 }).notNull().default('99.50'),
    downtimeMin: integer('downtime_min').notNull().default(0),
    maintenanceMin: integer('maintenance_min').notNull().default(0),
    incidents: integer('incidents').notNull().default(0),
    responseBreaches: integer('response_breaches').notNull().default(0),
    resolveBreaches: integer('resolve_breaches').notNull().default(0),
    creditPct: numeric('credit_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    creditAmount: numeric('credit_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('TRY'),
    creditAppliedAt: timestamp('credit_applied_at', { withTimezone: true }),
    reportKey: text('report_key'),
    reportSha256: text('report_sha256'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tenantId, t.workloadId, t.period)],
);

export const restoreDrills = pgTable('restore_drills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workloadId: uuid('workload_id')
    .notNull()
    .references(() => workloads.id, { onDelete: 'cascade' }),
  backupJobId: uuid('backup_job_id').references(() => backupJobs.id, { onDelete: 'set null' }),
  runId: uuid('run_id').references(() => runs.id),
  scheduledFor: date('scheduled_for').notNull(),
  status: text('status').notNull().default('scheduled'),
  snapshotId: text('snapshot_id'),
  checksumOk: boolean('checksum_ok'),
  appCheckOk: boolean('app_check_ok'),
  restoredBytes: bigint('restored_bytes', { mode: 'number' }),
  durationS: integer('duration_s'),
  error: text('error'),
  evidenceId: uuid('evidence_id').references(() => evidenceEvents.id),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    period: text('period'),
    version: integer('version').notNull().default(1),
    title: text('title').notNull(),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    bytes: integer('bytes').notNull().default(0),
    generatedFrom: jsonb('generated_from').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tenantId, t.kind, t.period, t.version)],
);

export const evidenceBundles = pgTable(
  'evidence_bundles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    fromSeq: bigint('from_seq', { mode: 'number' }).notNull(),
    toSeq: bigint('to_seq', { mode: 'number' }).notNull(),
    anchorHash: text('anchor_hash').notNull(),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    jsonSha256: text('json_sha256').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tenantId, t.period)],
);

export const auditorLinks = pgTable('auditor_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scope: text('scope').array().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessCalendar = pgTable('business_calendar', {
  day: date('day').primaryKey(),
  title: text('title').notNull(),
  halfDay: boolean('half_day').notNull().default(false),
});
