import { pgTable, uuid, text, timestamp, boolean, integer, bigint, bigserial, jsonb, numeric, unique, primaryKey } from 'drizzle-orm/pg-core';
import { tenants, users } from './tenants.js';
import { staff } from './staff.js';
import { providerAccounts, providers } from './providers.js';
import { workloads, runs } from './workloads.js';
import { components } from './components.js';
import { evidenceEvents } from './evidence.js';

export const providerInventory = pgTable(
  'provider_inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerAccountId: uuid('provider_account_id')
      .notNull()
      .references(() => providerAccounts.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    region: text('region'),
    residency: text('residency'),
    status: text('status').notNull().default(''),
    specs: jsonb('specs').notNull().default({}),
    tags: jsonb('tags').notNull().default({}),
    monthlyCostEstimate: numeric('monthly_cost_estimate', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('EUR'),
    matchedWorkloadId: uuid('matched_workload_id').references(() => workloads.id, { onDelete: 'set null' }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    goneAt: timestamp('gone_at', { withTimezone: true }),
  },
  (t) => [unique().on(t.providerAccountId, t.externalId)],
);

export const providerCostLines = pgTable(
  'provider_cost_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerAccountId: uuid('provider_account_id')
      .notNull()
      .references(() => providerAccounts.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    resourceRef: text('resource_ref').notNull(),
    description: text('description').notNull().default(''),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('EUR'),
    source: text('source').notNull(),
    raw: jsonb('raw').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.providerAccountId, t.period, t.resourceRef, t.source)],
);

export const costAllocations = pgTable(
  'cost_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workloadId: uuid('workload_id')
      .notNull()
      .references(() => workloads.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('EUR'),
    method: text('method').notNull(),
    sourceLineId: uuid('source_line_id').references(() => providerCostLines.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workloadId, t.period, t.sourceLineId)],
);

export const workloadRevenue = pgTable(
  'workload_revenue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workloadId: uuid('workload_id')
      .notNull()
      .references(() => workloads.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('EUR'),
    note: text('note'),
    enteredBy: uuid('entered_by').references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workloadId, t.period)],
);

export const fxRates = pgTable(
  'fx_rates',
  {
    period: text('period').notNull(),
    currency: text('currency').notNull(),
    toTry: numeric('to_try', { precision: 12, scale: 4 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.period, t.currency] })],
);

export const backupRepos = pgTable('backup_repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  providerAccountId: uuid('provider_account_id').references(() => providerAccounts.id),
  providerCode: text('provider_code')
    .notNull()
    .references(() => providers.code),
  repoUrl: text('repo_url').notNull(),
  residency: text('residency').notNull(),
  credentialsSealed: text('credentials_sealed'),
  keyVersion: integer('key_version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const backupPolicies = pgTable('backup_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  workloadId: uuid('workload_id')
    .notNull()
    .unique()
    .references(() => workloads.id, { onDelete: 'cascade' }),
  schedule: text('schedule').notNull().default('0 2 * * *'),
  retention: text('retention').notNull().default('--keep-daily 7 --keep-weekly 4 --keep-monthly 6'),
  primaryRepoId: uuid('primary_repo_id').references(() => backupRepos.id),
  offsiteRepoId: uuid('offsite_repo_id').references(() => backupRepos.id),
  paths: text('paths').array().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const backupJobs = pgTable('backup_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workloadId: uuid('workload_id')
    .notNull()
    .references(() => workloads.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => backupRepos.id),
  runId: uuid('run_id').references(() => runs.id),
  status: text('status').notNull(),
  snapshotId: text('snapshot_id'),
  bytes: bigint('bytes', { mode: 'number' }),
  files: integer('files'),
  durationS: integer('duration_s'),
  error: text('error'),
  evidenceId: uuid('evidence_id').references(() => evidenceEvents.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const accessSessions = pgTable('access_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  workloadId: uuid('workload_id').references(() => workloads.id),
  staffId: uuid('staff_id').references(() => staff.id),
  actorLabel: text('actor_label').notNull(),
  source: text('source').notNull().default('bastion'),
  target: text('target').notNull(),
  reason: text('reason'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  recordingRef: text('recording_ref'),
  evidenceId: uuid('evidence_id').references(() => evidenceEvents.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const probeResults = pgTable('probe_results', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  componentId: uuid('component_id')
    .notNull()
    .references(() => components.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
  latencyMs: integer('latency_ms'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  link: text('link'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
