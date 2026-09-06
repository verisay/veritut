import { pgTable, uuid, text, timestamp, integer, jsonb, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { providerAccounts } from './providers.js';

export const workloads = pgTable(
  'workloads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    productSlug: text('product_slug').notNull().default('legacy'),
    blueprintVersion: text('blueprint_version'),
    residency: text('residency').notNull(),
    providerAccountId: uuid('provider_account_id').references(() => providerAccounts.id),
    region: text('region'),
    size: text('size'),
    slaTier: text('sla_tier').notNull().default('std_9x5'),
    status: text('status').notNull().default('requested'),
    inputs: jsonb('inputs').notNull().default({}),
    endpoints: jsonb('endpoints').notNull().default([]),
    accessSealed: text('access_sealed'),
    monitoringTargets: jsonb('monitoring_targets').notNull().default([]),
    costCenter: text('cost_center'),
    providerCode: text('provider_code'),
    notes: text('notes'),
    probeUrl: text('probe_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tenantId, t.slug)],
);

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  workloadId: uuid('workload_id').references(() => workloads.id),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('queued'),
  risk: text('risk').notNull().default('low'),
  triggeredByStaff: uuid('triggered_by_staff'),
  triggeredByUser: uuid('triggered_by_user'),
  changeId: uuid('change_id'),
  providerAccountId: uuid('provider_account_id').references(() => providerAccounts.id),
  payload: jsonb('payload').notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  exitCode: integer('exit_code'),
  summary: jsonb('summary').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const runSteps = pgTable(
  'run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    status: text('status').notNull(),
    summary: text('summary'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [unique().on(t.runId, t.step)],
);
