import { and, eq, gt, isNull } from 'drizzle-orm';
import type { TenantRole } from '@veritut/types';
import { db } from '../db/db.js';
import { invitations, tenantMembers, tenants, users } from '../db/schema/index.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { notifyEmail } from './notification.service.js';

export async function inviteMember(tenantId: string, email: string, role: TenantRole, inviterId: string, ip: string | null) {
  const [t] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const token = randomToken(24);
  const [row] = await db.insert(invitations).values({ tenantId, email, role, tokenHash: sha256Hex(token), invitedBy: inviterId, expiresAt: new Date(Date.now() + 7 * 86400_000) }).returning({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt });
  const link = `${env.PORTAL_URL}/panel/davet/${token}`;
  await notifyEmail(email, { kind: 'invitation', title: `${t?.name ?? 'VERITUT'} sizi ekibe davet ediyor`, body: `Daveti kabul etmek için: ${link} (7 gün geçerli)`, link });
  await audit({ actorType: 'user', actorId: inviterId, tenantId, action: 'invitation.create', subjectType: 'invitation', subjectId: row!.id, after: { email, role }, ip });
  // Dev kolaylığı: token yalnız development'ta yanıtta döner (mail mock loglar).
  return { ...row!, token: env.NODE_ENV === 'development' ? token : undefined };
}

export async function listInvitations(tenantId: string) {
  return db.select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, createdAt: invitations.createdAt }).from(invitations).where(eq(invitations.tenantId, tenantId)).orderBy(invitations.createdAt);
}

/** Kabul: token'ın e-postası oturumdaki kullanıcının e-postasıyla eşleşmeli (başkasının daveti kullanılamaz). */
export async function acceptInvitation(token: string, userId: string) {
  const [inv] = await db.select().from(invitations).where(and(eq(invitations.tokenHash, sha256Hex(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()))).limit(1);
  if (!inv) throw ApiError.notFound('Davet bulunamadı veya süresi dolmuş');
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.email.toLowerCase() !== inv.email.toLowerCase()) throw ApiError.forbidden('Bu davet başka bir e-posta adresine gönderildi');
  await db.transaction(async (tx) => {
    await tx.insert(tenantMembers).values({ tenantId: inv.tenantId, userId, role: inv.role }).onConflictDoUpdate({ target: [tenantMembers.tenantId, tenantMembers.userId], set: { role: inv.role } });
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
  });
  await audit({ actorType: 'user', actorId: userId, tenantId: inv.tenantId, action: 'invitation.accept', subjectType: 'invitation', subjectId: inv.id });
  return { tenantId: inv.tenantId, role: inv.role };
}

export async function setMemberRole(tenantId: string, targetUserId: string, role: TenantRole, actorId: string) {
  if (role === 'owner') {
    // Sahiplik devri: yalnız mevcut owner; eski owner admin olur (tek owner ilkesi K1'de zorlanmaz, çoklu owner serbest)
  }
  const [r] = await db.update(tenantMembers).set({ role }).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, targetUserId))).returning();
  if (!r) throw ApiError.notFound('Üye bulunamadı');
  await audit({ actorType: 'user', actorId: actorId, tenantId, action: 'member.role', subjectType: 'user', subjectId: targetUserId, after: { role } });
  return r;
}

export async function removeMember(tenantId: string, targetUserId: string, actorId: string) {
  if (targetUserId === actorId) throw ApiError.badRequest('Kendinizi çıkaramazsınız');
  const owners = await db.select({ userId: tenantMembers.userId }).from(tenantMembers).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.role, 'owner')));
  if (owners.length === 1 && owners[0]!.userId === targetUserId) throw ApiError.badRequest('Son sahip çıkarılamaz');
  await db.delete(tenantMembers).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, targetUserId)));
  await audit({ actorType: 'user', actorId: actorId, tenantId, action: 'member.remove', subjectType: 'user', subjectId: targetUserId });
}
