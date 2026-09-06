import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { createTicketSchema, ticketWebhookSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { ticketMessages, tickets, tenants, users, workloads } from '../db/schema/index.js';
import { createTicketProvider } from '../providers/ticket/index.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { notifyTenant } from './notification.service.js';

/** D18: destek masası Zammad; Core ayna tutar (portal görünümü + destek dakikası KPI'ı). */
export async function createTicket(tenantId: string, userId: string, input: z.infer<typeof createTicketSchema>) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!t || !u) throw ApiError.notFound();
  let workloadSlug: string | null = null;
  if (input.workloadId) {
    const [w] = await db.select({ slug: workloads.slug }).from(workloads).where(and(eq(workloads.id, input.workloadId), eq(workloads.tenantId, tenantId))).limit(1);
    if (!w) throw ApiError.notFound();
    workloadSlug = w.slug;
  }
  const ref = await createTicketProvider().create({ tenantSlug: t.slug, tenantName: t.name, requesterEmail: u.email, requesterName: u.displayName, title: input.title, body: input.body, priority: input.priority, workloadSlug });
  const [row] = await db
    .insert(tickets)
    .values({ tenantId, workloadId: input.workloadId ?? null, externalRef: ref.externalRef, number: ref.number, title: input.title, state: 'new', priority: input.priority, createdBy: userId, lastActivityAt: new Date() })
    .returning();
  await db.insert(ticketMessages).values({ ticketId: row!.id, author: u.email, fromCustomer: true, body: input.body });
  await audit({ actorType: 'user', actorId: userId, tenantId, action: 'ticket.create', subjectType: 'ticket', subjectId: row!.id, after: { number: ref.number, priority: input.priority } });
  return row!;
}

export async function replyTicket(tenantId: string, ticketId: string, userId: string, body: string) {
  const t = await getTicket(tenantId, ticketId);
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const r = await createTicketProvider().reply(t.ticket.externalRef, body, { email: u!.email, name: u!.displayName });
  await db.insert(ticketMessages).values({ ticketId: t.ticket.id, externalRef: r.externalRef, author: u!.email, fromCustomer: true, body });
  await db.update(tickets).set({ state: t.ticket.state === 'resolved' || t.ticket.state === 'closed' ? 'open' : t.ticket.state, lastActivityAt: new Date() }).where(eq(tickets.id, t.ticket.id));
  return { ok: true };
}

export async function listTickets(tenantId: string) {
  return db.select().from(tickets).where(eq(tickets.tenantId, tenantId)).orderBy(desc(tickets.lastActivityAt), desc(tickets.createdAt)).limit(50);
}

export async function getTicket(tenantId: string, id: string) {
  const [t] = await db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId))).limit(1);
  if (!t) throw ApiError.notFound();
  const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, t.id)).orderBy(asc(ticketMessages.createdAt));
  return { ticket: t, messages };
}

/** Zammad webhook → ayna (durum, ajan yanıtı, harcanan dakika) + müşteri bildirimi. */
export async function applyTicketEvent(e: z.infer<typeof ticketWebhookSchema>) {
  const [t] = await db.select().from(tickets).where(eq(tickets.externalRef, e.externalRef)).limit(1);
  if (!t) return { ok: false };
  const patch: Partial<typeof tickets.$inferInsert> = { lastActivityAt: new Date() };
  if (e.state) patch.state = e.state;
  if (e.minutesSpent !== undefined) patch.minutesSpent = String(e.minutesSpent);
  await db.update(tickets).set(patch).where(eq(tickets.id, t.id));
  if (e.article) {
    await db
      .insert(ticketMessages)
      .values({ ticketId: t.id, externalRef: e.article.externalRef, author: e.article.author, fromCustomer: e.article.fromCustomer, body: e.article.body })
      .onConflictDoNothing();
    if (!e.article.fromCustomer) {
      await notifyTenant(t.tenantId, ['owner', 'admin', 'technical'], { kind: 'system', title: `Destek talebinize yanıt geldi: ${t.title}`, body: e.article.body.slice(0, 200), link: `/panel/destek/${t.id}` });
    }
  }
  return { ok: true };
}

/** Dönem içi destek dakikası (KPI). Sağlayıcıdan çeker, aynaya yazar. */
export async function syncTimeAccounting(period: string): Promise<number> {
  const rows = await createTicketProvider().timeAccounting(period);
  for (const r of rows) await db.update(tickets).set({ minutesSpent: String(r.minutes) }).where(eq(tickets.externalRef, r.externalRef));
  return rows.length;
}

export async function supportMinutesByTenant(period: string) {
  return db
    .select({ tenantId: tickets.tenantId, minutes: sql<string>`coalesce(sum(${tickets.minutesSpent}),0)`, n: sql<number>`count(*)::int` })
    .from(tickets)
    .where(sql`to_char(${tickets.createdAt}, 'YYYY-MM') = ${period}`)
    .groupBy(tickets.tenantId);
}
