import { pgTable, uuid, text, timestamp, bigint, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

/** Append-only — DB trigger UPDATE/DELETE'i reddeder (D13). */
export const evidenceEvents = pgTable('evidence_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  kind: text('kind').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  payload: jsonb('payload').notNull().default({}),
  actor: text('actor').notNull().default('system'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
});

export const evidenceAnchors = pgTable('evidence_anchors', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  period: text('period').notNull(),
  lastSeq: bigint('last_seq', { mode: 'number' }).notNull(),
  anchorHash: text('anchor_hash').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  publishedTo: text('published_to').array().notNull().default([]),
});
