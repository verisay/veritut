import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { ChannelEvent, ChannelKind } from '@veritut/types';
import type { z } from 'zod';
import type { notificationChannelSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { notificationChannels } from '../db/schema/index.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { queue } from '../queues.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';

/**
 * Müşteri alarm kanalları (plan §14 K4/9). Hedef (URL, e-posta, telefon) simetrik şifreli saklanır:
 * gönderimi API/worker yapar, bu yüzden D12 asimetrik zarfı DEĞİL `SESSION_ENC_KEY` kullanılır.
 * Listeleme hedefi ASLA düz döndürmez; yalnız maskeli ipucu gösterilir.
 */
function hint(kind: ChannelKind, target: string): string {
  if (kind === 'email') {
    const [u, d] = target.split('@');
    return `${(u ?? '').slice(0, 2)}***@${d ?? ''}`;
  }
  if (kind === 'sms') return `***${target.slice(-4)}`;
  try {
    const u = new URL(target);
    return `${u.protocol}//${u.host}/***`;
  } catch {
    return `${target.slice(0, 8)}***`;
  }
}

export async function createChannel(tenantId: string, input: z.infer<typeof notificationChannelSchema>, userId: string) {
  const [row] = await db
    .insert(notificationChannels)
    .values({ tenantId, kind: input.kind, label: input.label, targetSealed: encryptSecret(input.target), targetHint: hint(input.kind, input.target), events: input.events })
    .returning({ id: notificationChannels.id, kind: notificationChannels.kind, label: notificationChannels.label, targetHint: notificationChannels.targetHint, events: notificationChannels.events, active: notificationChannels.active });
  await audit({ actorType: 'user', actorId: userId, tenantId, action: 'channel.create', subjectType: 'notification_channel', subjectId: row!.id, after: { kind: input.kind, label: input.label, events: input.events } });
  return row!;
}

export async function listChannels(tenantId: string) {
  return db
    .select({ id: notificationChannels.id, kind: notificationChannels.kind, label: notificationChannels.label, targetHint: notificationChannels.targetHint, events: notificationChannels.events, active: notificationChannels.active, lastSentAt: notificationChannels.lastSentAt, lastError: notificationChannels.lastError, createdAt: notificationChannels.createdAt })
    .from(notificationChannels)
    .where(eq(notificationChannels.tenantId, tenantId))
    .orderBy(notificationChannels.createdAt);
}

export async function deleteChannel(tenantId: string, id: string, userId: string) {
  const [row] = await db.delete(notificationChannels).where(and(eq(notificationChannels.id, id), eq(notificationChannels.tenantId, tenantId))).returning({ id: notificationChannels.id });
  if (!row) throw ApiError.notFound();
  await audit({ actorType: 'user', actorId: userId, tenantId, action: 'channel.delete', subjectType: 'notification_channel', subjectId: id });
}

/** Olay yayını: kanal başına worker `notify` kuyruğuna iş. Webhook'lar HMAC ile imzalanır. */
export async function dispatchChannels(tenantId: string, event: ChannelEvent, payload: Record<string, unknown>): Promise<number> {
  const rows = await db.select().from(notificationChannels).where(and(eq(notificationChannels.tenantId, tenantId), eq(notificationChannels.active, true)));
  const targets = rows.filter((r) => (r.events as string[]).includes(event));
  for (const c of targets) {
    let target: string;
    try {
      target = decryptSecret(c.targetSealed);
    } catch (err) {
      logger.error({ err, channelId: c.id }, 'kanal hedefi çözülemedi');
      continue;
    }
    const body = { event, tenant: tenantId, at: new Date().toISOString(), ...payload };
    const signature = c.kind === 'webhook' || c.kind === 'slack' || c.kind === 'teams' ? createHmac('sha256', env.BILLING_WEBHOOK_SECRET).update(JSON.stringify(body)).digest('hex') : undefined;
    await queue('notify').add('channel', { channelId: c.id, kind: c.kind, target, body, signature }, { removeOnComplete: 200, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  }
  return targets.length;
}

export async function markChannelResult(channelId: string, error: string | null): Promise<void> {
  await db.update(notificationChannels).set({ lastSentAt: new Date(), lastError: error }).where(eq(notificationChannels.id, channelId));
}
