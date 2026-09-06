import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { staff } from './staff.js';
import { workloads, runs } from './workloads.js';

export const workloadSecrets = pgTable(
  'workload_secrets',
  {
    workloadId: uuid('workload_id')
      .notNull()
      .references(() => workloads.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    valueSealed: text('value_sealed').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workloadId, t.name] })],
);

export const changes = pgTable('changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  workloadId: uuid('workload_id').references(() => workloads.id),
  kind: text('kind').notNull(),
  risk: text('risk').notNull(),
  status: text('status').notNull().default('draft'),
  requestedBy: uuid('requested_by').references(() => staff.id),
  approvedBy: uuid('approved_by').references(() => staff.id),
  runId: uuid('run_id').references(() => runs.id),
  rollbackRunId: uuid('rollback_run_id'),
  summary: jsonb('summary').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const driftReports = pgTable('drift_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  workloadId: uuid('workload_id')
    .notNull()
    .references(() => workloads.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').references(() => runs.id),
  diff: jsonb('diff').notNull(),
  hasDrift: boolean('has_drift').notNull(),
  acknowledgedBy: uuid('acknowledged_by').references(() => staff.id),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
