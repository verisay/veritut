import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, numeric, date, unique, primaryKey } from 'drizzle-orm/pg-core';
import { tenants, users } from './tenants.js';
import { staff } from './staff.js';
import { workloads, runs } from './workloads.js';

export const products = pgTable('products', {
  slug: text('slug').primaryKey(),
  layer: integer('layer').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  blueprintSlug: text('blueprint_slug'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  bodyMd: text('body_md').notNull().default(''),
  faq: jsonb('faq').notNull().default([]),
  compare: jsonb('compare').notNull().default([]),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(100),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productVersions = pgTable(
  'product_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productSlug: text('product_slug')
      .notNull()
      .references(() => products.slug, { onDelete: 'cascade' }),
    blueprintVersion: text('blueprint_version').notNull(),
    status: text('status').notNull().default('draft'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.productSlug, t.blueprintVersion)],
);

export const plans = pgTable('plans', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  features: jsonb('features').notNull().default({}),
  sort: integer('sort').notNull().default(100),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const slaTiers = pgTable('sla_tiers', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  coverage: text('coverage').notNull(),
  responseMin: integer('response_min').notNull(),
  resolveMin: integer('resolve_min').notNull(),
  uptimeTarget: numeric('uptime_target', { precision: 5, scale: 2 }).notNull().default('99.50'),
  monthlyUpliftPct: numeric('monthly_uplift_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(100),
});

export const priceList = pgTable('price_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  productSlug: text('product_slug')
    .notNull()
    .references(() => products.slug, { onDelete: 'cascade' }),
  size: text('size').notNull(),
  residency: text('residency').notNull(),
  planCode: text('plan_code')
    .notNull()
    .references(() => plans.code),
  slaCode: text('sla_code')
    .notNull()
    .references(() => slaTiers.code),
  currency: text('currency').notNull().default('TRY'),
  monthly: numeric('monthly', { precision: 12, scale: 2 }).notNull(),
  setupFee: numeric('setup_fee', { precision: 12, scale: 2 }).notNull().default('0'),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const addons = pgTable('addons', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  unit: text('unit').notNull(),
  currency: text('currency').notNull().default('TRY'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 4 }).notNull(),
  active: boolean('active').notNull().default(true),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  productSlug: text('product_slug')
    .notNull()
    .references(() => products.slug),
  productVersionId: uuid('product_version_id').references(() => productVersions.id),
  planCode: text('plan_code')
    .notNull()
    .references(() => plans.code),
  slaCode: text('sla_code')
    .notNull()
    .references(() => slaTiers.code),
  residency: text('residency').notNull(),
  region: text('region').notNull(),
  size: text('size').notNull(),
  workloadSlug: text('workload_slug').notNull(),
  workloadName: text('workload_name').notNull(),
  inputs: jsonb('inputs').notNull().default({}),
  currency: text('currency').notNull().default('TRY'),
  monthly: numeric('monthly', { precision: 12, scale: 2 }).notNull().default('0'),
  setupFee: numeric('setup_fee', { precision: 12, scale: 2 }).notNull().default('0'),
  isTrial: boolean('is_trial').notNull().default(false),
  trialDays: integer('trial_days').notNull().default(0),
  status: text('status').notNull().default('draft'),
  workloadId: uuid('workload_id').references(() => workloads.id),
  runId: uuid('run_id').references(() => runs.id),
  orderedBy: uuid('ordered_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => staff.id),
  rejectReason: text('reject_reason'),
  utm: jsonb('utm').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSubscriptions = pgTable('tenant_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  workloadId: uuid('workload_id').references(() => workloads.id, { onDelete: 'set null' }),
  planCode: text('plan_code')
    .notNull()
    .references(() => plans.code),
  slaCode: text('sla_code')
    .notNull()
    .references(() => slaTiers.code),
  status: text('status').notNull().default('trialing'),
  currency: text('currency').notNull().default('TRY'),
  monthly: numeric('monthly', { precision: 12, scale: 2 }).notNull().default('0'),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  billingRef: text('billing_ref'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantFeatureOverrides = pgTable(
  'tenant_feature_overrides',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    value: jsonb('value').notNull(),
    note: text('note'),
    setBy: uuid('set_by').references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.feature] })],
);

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workloadId: uuid('workload_id').references(() => workloads.id, { onDelete: 'set null' }),
    period: text('period').notNull(),
    metric: text('metric').notNull(),
    qty: numeric('qty', { precision: 14, scale: 4 }).notNull(),
    unit: text('unit').notNull().default('month'),
    currency: text('currency').notNull().default('TRY'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
    note: text('note'),
    pushedAt: timestamp('pushed_at', { withTimezone: true }),
    billingRef: text('billing_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tenantId, t.period, t.metric, t.workloadId)],
);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  billingRef: text('billing_ref').notNull().unique(),
  number: text('number').notNull().default(''),
  status: text('status').notNull(),
  currency: text('currency').notNull().default('TRY'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  payUrl: text('pay_url'),
  lines: jsonb('lines').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  workloadId: uuid('workload_id').references(() => workloads.id, { onDelete: 'set null' }),
  externalRef: text('external_ref').notNull().unique(),
  number: text('number').notNull().default(''),
  title: text('title').notNull(),
  state: text('state').notNull().default('new'),
  priority: text('priority').notNull().default('normal'),
  createdBy: uuid('created_by').references(() => users.id),
  minutesSpent: numeric('minutes_spent', { precision: 8, scale: 2 }).notNull().default('0'),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  externalRef: text('external_ref').unique(),
  author: text('author').notNull(),
  fromCustomer: boolean('from_customer').notNull().default(true),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const kpiSnapshots = pgTable('kpi_snapshots', {
  period: text('period').primaryKey(),
  mrr: numeric('mrr', { precision: 14, scale: 2 }).notNull().default('0'),
  nrr: numeric('nrr', { precision: 6, scale: 2 }),
  churnPct: numeric('churn_pct', { precision: 6, scale: 2 }),
  grossMarginPct: numeric('gross_margin_pct', { precision: 6, scale: 2 }),
  supportMinPerCustomer: numeric('support_min_per_customer', { precision: 8, scale: 2 }),
  slaBreaches: integer('sla_breaches').notNull().default(0),
  activeTenants: integer('active_tenants').notNull().default(0),
  activeWorkloads: integer('active_workloads').notNull().default(0),
  cac: numeric('cac', { precision: 12, scale: 2 }),
  ltv: numeric('ltv', { precision: 12, scale: 2 }),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const utmAttributions = pgTable('utm_attributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  source: text('source'),
  medium: text('medium'),
  campaign: text('campaign'),
  landingPath: text('landing_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
