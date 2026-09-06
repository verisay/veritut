import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { workloads } from './workloads.js';

export const components = pgTable('components', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  workloadId: uuid('workload_id').references(() => workloads.id),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  probeUrl: text('probe_url'),
  state: text('state').notNull().default('unknown'),
  latencyMs: integer('latency_ms'),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  sort: integer('sort').notNull().default(100),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
