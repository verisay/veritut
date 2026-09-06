import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { NotificationKind, TenantRole } from '@veritut/types';
import { db } from '../db/db.js';
import { notifications, staff, tenantMembers, users } from '../db/schema/index.js';
import { queue } from '../queues.js';

/** Bildirim çekirdeği: in-app satır + `notify` kuyruğuna e-posta işi (worker IMailProvider). */
interface Notify {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string | null;
}

export async function notifyTenant(tenantId: string, roles: TenantRole[], n: Notify): Promise<number> {
  const rows = await db
    .select({ userId: users.id, email: users.email })
    .from(tenantMembers)
    .innerJoin(users, eq(users.id, tenantMembers.userId))
    .where(and(eq(tenantMembers.tenantId, tenantId), inArray(tenantMembers.role, roles)));
  if (rows.length === 0) return 0;
  await db.insert(notifications).values(rows.map((r) => ({ tenantId, userId: r.userId, kind: n.kind, title: n.title, body: n.body ?? '', link: n.link ?? null })));
  await queue('notify').add('mail', { to: rows.map((r) => r.email), subject: n.title, text: n.body ?? n.title, kind: n.kind }, { removeOnComplete: 100 });
  return rows.length;
}

export async function notifyStaff(n: Notify, minRole: 'operator' | 'senior' | 'platform_admin' = 'operator'): Promise<number> {
  const order = ['operator', 'senior', 'platform_admin'];
  const rows = await db.select({ id: staff.id, email: staff.email, role: staff.role }).from(staff).where(eq(staff.active, true));
  const target = rows.filter((r) => order.indexOf(r.role) >= order.indexOf(minRole));
  if (target.length === 0) return 0;
  await db.insert(notifications).values(target.map((r) => ({ staffId: r.id, kind: n.kind, title: n.title, body: n.body ?? '', link: n.link ?? null })));
  await queue('notify').add('mail', { to: target.map((r) => r.email), subject: `[ops] ${n.title}`, text: n.body ?? n.title, kind: n.kind }, { removeOnComplete: 100 });
  return target.length;
}

export async function notifyEmail(email: string, n: Notify): Promise<void> {
  await queue('notify').add('mail', { to: [email], subject: n.title, text: n.body ?? n.title, kind: n.kind, link: n.link ?? null }, { removeOnComplete: 100 });
}

export async function listUserNotifications(userId: string, limit = 50) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}
export async function listStaffNotifications(staffId: string, limit = 50) {
  return db.select().from(notifications).where(eq(notifications.staffId, staffId)).orderBy(desc(notifications.createdAt)).limit(limit);
}
export async function markRead(id: string, who: { userId?: string; staffId?: string }): Promise<void> {
  const owner = who.userId ? eq(notifications.userId, who.userId) : eq(notifications.staffId, who.staffId ?? '');
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), owner, isNull(notifications.readAt)));
}
