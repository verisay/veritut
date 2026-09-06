import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { BillingCustomer, IBillingProvider, PushUsageResult, UsageLine } from './types.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../redis.js';

/**
 * Mock faturalama omurgası (dev/test). Gerçek FOSSBilling'in yerine geçer: fatura üretir,
 * ödeme linki verir, ödeme simülasyonu webhook'u tetikler. Durum Redis'te; Core'un fatura
 * tablosuna DOĞRUDAN yazmaz — akış her zaman webhook üzerinden gider (D17).
 */
export class MockBillingProvider implements IBillingProvider {
  readonly name = 'mock';
  readonly configured = true;

  async syncCustomer(c: BillingCustomer): Promise<string> {
    const ref = `mock-cust-${c.tenantSlug}`;
    await redis.set(`billing:mock:customer:${ref}`, JSON.stringify(c), 'EX', 90 * 86400);
    return ref;
  }

  async pushUsage(customerRef: string, period: string, lines: UsageLine[], idempotencyKey: string): Promise<PushUsageResult> {
    const existing = await redis.get(`billing:mock:idem:${idempotencyKey}`);
    if (existing) return JSON.parse(existing) as PushUsageResult;
    const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const billingRef = `mock-inv-${randomUUID().slice(0, 8)}`;
    const result: PushUsageResult = {
      billingRef,
      invoiceNumber: `VT-${period.replace('-', '')}-${billingRef.slice(-4).toUpperCase()}`,
      status: total > 0 ? 'unpaid' : 'paid',
      total,
      currency: lines[0]?.currency ?? 'TRY',
      payUrl: total > 0 ? `${env.PORTAL_URL}/panel/faturalar?mock_pay=${billingRef}` : null,
      dueAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
    };
    await redis.set(`billing:mock:idem:${idempotencyKey}`, JSON.stringify(result), 'EX', 90 * 86400);
    await redis.set(`billing:mock:invoice:${billingRef}`, JSON.stringify({ customerRef, period, lines, ...result }), 'EX', 90 * 86400);
    logger.info({ billingRef, total, customerRef }, 'mock billing: fatura üretildi');
    return result;
  }

  async payLink(billingRef: string): Promise<string | null> {
    const raw = await redis.get(`billing:mock:invoice:${billingRef}`);
    if (!raw) return null;
    return (JSON.parse(raw) as { payUrl: string | null }).payUrl;
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const sig = String(headers['x-veritut-signature'] ?? '');
    const expected = createHmac('sha256', env.BILLING_WEBHOOK_SECRET).update(rawBody).digest('hex');
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  parseWebhook(body: unknown): unknown {
    return body; // mock zaten kanonik biçimde gönderir
  }
}
