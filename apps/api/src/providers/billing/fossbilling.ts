import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BillingCustomer, IBillingProvider, PushUsageResult, UsageLine } from './types.js';
import { env } from '../../config/env.js';

/**
 * FOSSBilling adaptörü (K3 — canlı credential ile devreye girer). Admin API anahtarı ile
 * müşteri/fatura yönetimi; PayTR tahsilatı FOSSBilling içindedir (Core kart görmez).
 * Uç adları FOSSBilling Admin API'sine göre; kurulumda `FOSSBILLING_URL` + `FOSSBILLING_API_KEY` gerekir.
 */
export class FossBillingProvider implements IBillingProvider {
  readonly name = 'fossbilling';
  readonly configured = Boolean(env.FOSSBILLING_URL && env.FOSSBILLING_API_KEY);

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.configured) throw new Error('FOSSBilling yapılandırılmadı (FOSSBILLING_URL / FOSSBILLING_API_KEY)');
    const res = await fetch(`${env.FOSSBILLING_URL}/api/admin/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`admin:${env.FOSSBILLING_API_KEY}`).toString('base64')}` },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`fossbilling ${method} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { result?: T; error?: { message: string } };
    if (j.error) throw new Error(`fossbilling ${method}: ${j.error.message}`);
    return j.result as T;
  }

  async syncCustomer(c: BillingCustomer): Promise<string> {
    const found = await this.call<Array<{ id: number }>>('client/get_list', { email: c.email }).catch(() => []);
    if (Array.isArray(found) && found[0]?.id) return String(found[0].id);
    const id = await this.call<number>('client/create', { email: c.email, first_name: c.name, company: c.name, status: 'active' });
    return String(id);
  }

  async pushUsage(customerRef: string, period: string, lines: UsageLine[], idempotencyKey: string): Promise<PushUsageResult> {
    const invoiceId = await this.call<number>('invoice/prepare', { client_id: Number(customerRef), approve: true, items: lines.map((l) => ({ title: `${l.title} (${period})`, price: l.unitAmount, quantity: l.qty, taxed: true })), text: `VERITUT ${period} · ${idempotencyKey}` });
    const inv = await this.call<{ id: number; nr: string; status: string; total: number; currency: string; due_at: string | null; hash: string }>('invoice/get', { id: invoiceId });
    return {
      billingRef: String(inv.id),
      invoiceNumber: inv.nr ?? String(inv.id),
      status: inv.status === 'paid' ? 'paid' : 'unpaid',
      total: Number(inv.total),
      currency: inv.currency ?? 'TRY',
      payUrl: `${env.FOSSBILLING_URL}/invoice/${inv.hash}`,
      dueAt: inv.due_at,
    };
  }

  async payLink(billingRef: string): Promise<string | null> {
    const inv = await this.call<{ hash: string }>('invoice/get', { id: Number(billingRef) });
    return inv?.hash ? `${env.FOSSBILLING_URL}/invoice/${inv.hash}` : null;
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const sig = String(headers['x-veritut-signature'] ?? '');
    const expected = createHmac('sha256', env.BILLING_WEBHOOK_SECRET).update(rawBody).digest('hex');
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  /** FOSSBilling olay gövdesi → kanonik `billingWebhookSchema` biçimi. */
  parseWebhook(body: unknown): unknown {
    const b = body as { event?: string; params?: Record<string, unknown> };
    const p = (b.params ?? {}) as Record<string, string | number>;
    const map: Record<string, string> = { onAfterAdminInvoiceApprove: 'invoice.created', onAfterClientInvoicePaymentReceived: 'invoice.paid', onAfterAdminInvoiceDelete: 'invoice.cancelled' };
    return {
      event: map[String(b.event)] ?? 'invoice.created',
      tenantRef: String(p['client_id'] ?? ''),
      invoice: { billingRef: String(p['id'] ?? ''), number: String(p['nr'] ?? ''), status: String(p['status'] ?? 'unpaid'), currency: String(p['currency'] ?? 'TRY'), total: Number(p['total'] ?? 0), lines: [] },
    };
  }
}
