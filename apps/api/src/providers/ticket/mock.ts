import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ITicketProvider, TicketCreate, TicketRef } from './types.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../redis.js';

/** Mock destek masası (dev/test) — Zammad'ın yerine geçer, durum Redis'te. */
export class MockTicketProvider implements ITicketProvider {
  readonly name = 'mock';
  readonly configured = true;

  async create(t: TicketCreate): Promise<TicketRef> {
    const id = randomUUID().slice(0, 8);
    const ref: TicketRef = { externalRef: `mock-tkt-${id}`, number: `TKT-${id.toUpperCase()}`, state: 'new' };
    await redis.set(`ticket:mock:${ref.externalRef}`, JSON.stringify({ ...t, ...ref, minutes: 0 }), 'EX', 90 * 86400);
    logger.info({ ref: ref.externalRef, tenant: t.tenantSlug }, 'mock ticket açıldı');
    return ref;
  }

  async reply(externalRef: string, body: string, author: { email: string; name: string }): Promise<{ externalRef: string }> {
    const id = `mock-art-${randomUUID().slice(0, 8)}`;
    await redis.rpush(`ticket:mock:${externalRef}:articles`, JSON.stringify({ externalRef: id, body, author: author.email, at: new Date().toISOString() }));
    return { externalRef: id };
  }

  async timeAccounting(period: string): Promise<Array<{ externalRef: string; minutes: number }>> {
    const raw = await redis.get(`ticket:mock:time:${period}`);
    return raw ? (JSON.parse(raw) as Array<{ externalRef: string; minutes: number }>) : [];
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const sig = String(headers['x-veritut-signature'] ?? '');
    const expected = createHmac('sha256', env.TICKET_WEBHOOK_SECRET).update(rawBody).digest('hex');
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  parseWebhook(body: unknown): unknown {
    return body;
  }
}
