import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  kcSub: text('kc_sub').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  role: text('role').notNull().default('operator'),
  localTotpEnc: text('local_totp_enc'),
  active: boolean('active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const staffSessions = pgTable('staff_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  kcRefreshEnc: text('kc_refresh_enc'),
  kcIdTokenEnc: text('kc_id_token_enc'),
  userAgent: text('user_agent'),
  ip: text('ip'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});
