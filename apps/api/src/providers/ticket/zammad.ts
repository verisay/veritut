import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ITicketProvider, TicketCreate, TicketRef } from './types.js';
import { env } from '../../config/env.js';

/**
 * Zammad adaptörü (D18). Token: `ZAMMAD_TOKEN` (Token Access). Müşteri portalı bu adaptör
 * üzerinden ticket açar/yanıtlar; ops Zammad arayüzünü doğrudan kullanır.
 */
export class ZammadTicketProvider implements ITicketProvider {
  readonly name = 'zammad';
  readonly configured = Boolean(env.ZAMMAD_URL && env.ZAMMAD_TOKEN);

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.configured) throw new Error('Zammad yapılandırılmadı (ZAMMAD_URL / ZAMMAD_TOKEN)');
    const res = await fetch(`${env.ZAMMAD_URL}/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Token token=${env.ZAMMAD_TOKEN}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`zammad ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async create(t: TicketCreate): Promise<TicketRef> {
    const prio: Record<string, string> = { low: '1 low', normal: '2 normal', high: '3 high', urgent: '3 high' };
    const r = await this.call<{ id: number; number: string; state: string }>('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: t.title,
        group: 'Users',
        customer: t.requesterEmail,
        priority: prio[t.priority] ?? '2 normal',
        article: { subject: t.title, body: t.body, type: 'note', internal: false },
        note: `VERITUT kiracı: ${t.tenantName} (${t.tenantSlug})${t.workloadSlug ? ` · iş yükü: ${t.workloadSlug}` : ''}`,
      }),
    });
    return { externalRef: String(r.id), number: r.number, state: r.state ?? 'new' };
  }

  async reply(externalRef: string, body: string, author: { email: string; name: string }): Promise<{ externalRef: string }> {
    const r = await this.call<{ id: number }>('/ticket_articles', { method: 'POST', body: JSON.stringify({ ticket_id: Number(externalRef), body, type: 'note', internal: false, from: `${author.name} <${author.email}>` }) });
    return { externalRef: String(r.id) };
  }

  async timeAccounting(period: string): Promise<Array<{ externalRef: string; minutes: number }>> {
    const [y, m] = period.split('-');
    const rows = await this.call<Array<{ ticket_id: number; time_unit: string }>>(`/time_accounting/log/by_ticket/${y}/${m}`).catch(() => []);
    const agg = new Map<string, number>();
    for (const r of rows) agg.set(String(r.ticket_id), (agg.get(String(r.ticket_id)) ?? 0) + Number(r.time_unit));
    return [...agg].map(([externalRef, minutes]) => ({ externalRef, minutes }));
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const sig = String(headers['x-hub-signature'] ?? headers['x-veritut-signature'] ?? '').replace(/^sha1=|^sha256=/, '');
    const expected = createHmac('sha256', env.TICKET_WEBHOOK_SECRET).update(rawBody).digest('hex');
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  /** Zammad webhook gövdesi → kanonik biçim. */
  parseWebhook(body: unknown): unknown {
    const b = body as { ticket?: { id: number; state: string }; article?: { id: number; body: string; sender: string; created_by?: { email?: string } } };
    const stateMap: Record<string, string> = { new: 'new', open: 'open', 'pending reminder': 'pending', 'pending close': 'pending', closed: 'closed', resolved: 'resolved' };
    return {
      event: b.article ? 'article.created' : 'ticket.updated',
      externalRef: String(b.ticket?.id ?? ''),
      state: stateMap[String(b.ticket?.state)] ?? 'open',
      article: b.article ? { externalRef: String(b.article.id), author: b.article.created_by?.email ?? 'agent', fromCustomer: b.article.sender === 'Customer', body: b.article.body } : null,
    };
  }
}
