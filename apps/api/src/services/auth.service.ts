import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Realm, StaffRole } from '@veritut/types';
import { db } from '../db/db.js';
import { sessions, staff, staffSessions, users } from '../db/schema/index.js';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from '../lib/crypto.js';
import { env } from '../config/env.js';
import type { IdClaims, TokenSet } from '../lib/oidc.js';

/**
 * Oturum servisi (D6): Keycloak kimliği → yerel yansıma + opak çerez token'ı.
 * İki realm iki tablo; fonksiyonlar birbirinin yerine kullanılmaz.
 */
export interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
}

export async function upsertUserFromClaims(c: IdClaims): Promise<{ id: string; email: string; displayName: string }> {
  const email = (c.email ?? c.preferred_username ?? `${c.sub}@unknown.local`).toLowerCase();
  const displayName = c.name ?? c.preferred_username ?? email;
  const [row] = await db
    .insert(users)
    .values({ kcSub: c.sub!, email, displayName, lastLoginAt: new Date() })
    .onConflictDoUpdate({ target: users.kcSub, set: { email, displayName, lastLoginAt: new Date() } })
    .returning({ id: users.id, email: users.email, displayName: users.displayName });
  return row!;
}

export async function upsertStaffFromClaims(
  c: IdClaims,
  roleFromToken: StaffRole | null,
): Promise<{ id: string; email: string; displayName: string; role: StaffRole } | null> {
  const email = (c.email ?? c.preferred_username ?? `${c.sub}@unknown.local`).toLowerCase();
  const displayName = c.name ?? c.preferred_username ?? email;
  // Personel yalnız ops realm'inde hesabı olanlar; rol Keycloak realm rolünden (operator/senior/platform_admin).
  const role: StaffRole = roleFromToken ?? 'operator';
  const [row] = await db
    .insert(staff)
    .values({ kcSub: c.sub!, email, displayName, role, lastLoginAt: new Date() })
    .onConflictDoUpdate({ target: staff.kcSub, set: { email, displayName, role, lastLoginAt: new Date() } })
    .returning({ id: staff.id, email: staff.email, displayName: staff.displayName, role: staff.role, active: staff.active });
  if (!row || !row.active) return null;
  return { id: row.id, email: row.email, displayName: row.displayName, role: row.role as StaffRole };
}

export async function createSession(realm: Realm, principalId: string, tokens: TokenSet, meta: SessionMeta): Promise<string> {
  const token = randomToken(32);
  const hours = realm === 'ops' ? env.SESSION_TTL_HOURS_OPS : env.SESSION_TTL_HOURS_PORTAL;
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  const common = {
    tokenHash: sha256Hex(token),
    kcRefreshEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
    kcIdTokenEnc: encryptSecret(tokens.id_token),
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt,
  };
  if (realm === 'ops') await db.insert(staffSessions).values({ ...common, staffId: principalId });
  else await db.insert(sessions).values({ ...common, userId: principalId });
  return token;
}

export async function readUserSession(token: string) {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  void db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId)).catch(() => undefined);
  return row;
}

export async function readStaffSession(token: string) {
  const [row] = await db
    .select({
      sessionId: staffSessions.id,
      id: staff.id,
      email: staff.email,
      displayName: staff.displayName,
      role: staff.role,
      active: staff.active,
    })
    .from(staffSessions)
    .innerJoin(staff, eq(staff.id, staffSessions.staffId))
    .where(
      and(eq(staffSessions.tokenHash, sha256Hex(token)), isNull(staffSessions.revokedAt), gt(staffSessions.expiresAt, new Date())),
    )
    .limit(1);
  if (!row || !row.active) return null;
  void db.update(staffSessions).set({ lastSeenAt: new Date() }).where(eq(staffSessions.id, row.sessionId)).catch(() => undefined);
  return { sessionId: row.sessionId, id: row.id, email: row.email, displayName: row.displayName, role: row.role as StaffRole };
}

/** Oturumu iptal eder; Keycloak çıkışı için id_token'ı döner (varsa). */
export async function revokeSession(realm: Realm, token: string): Promise<string | null> {
  const hash = sha256Hex(token);
  if (realm === 'ops') {
    const [row] = await db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(eq(staffSessions.tokenHash, hash))
      .returning({ idTok: staffSessions.kcIdTokenEnc });
    return row?.idTok ? decryptSecret(row.idTok) : null;
  }
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hash))
    .returning({ idTok: sessions.kcIdTokenEnc });
  return row?.idTok ? decryptSecret(row.idTok) : null;
}
