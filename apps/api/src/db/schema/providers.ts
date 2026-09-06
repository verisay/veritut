import { pgTable, uuid, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';

export const providers = pgTable('providers', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  partnerStatus: text('partner_status').notNull().default('none'),
  exitPlanDoc: text('exit_plan_doc'),
  active: boolean('active').notNull().default(true),
});

export const providerAccounts = pgTable('provider_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerCode: text('provider_code')
    .notNull()
    .references(() => providers.code),
  label: text('label').notNull(),
  /** D12: asimetrik zarf — API yazar, yalnız runner açar. */
  credentialsSealed: text('credentials_sealed'),
  keyVersion: integer('key_version').notNull().default(1),
  regions: text('regions').array().notNull().default([]),
  residencies: text('residencies').array().notNull().default([]),
  quota: jsonb('quota').notNull().default({}),
  health: text('health').notNull().default('unknown'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
