/**
 * IBillingProvider (D9/D17) — Core para TOPLAMAZ. Fatura kesme, tahsilat ve ödeme sayfası
 * faturalama omurgasındadır (FOSSBilling → Entranet). Core yalnız ölçer ve aynayı gösterir.
 */
export interface BillingCustomer {
  tenantId: string;
  tenantSlug: string;
  name: string;
  email: string;
}

export interface UsageLine {
  title: string;
  qty: number;
  unitAmount: number;
  amount: number;
  currency: string;
  metric: string;
  workloadId?: string | null;
}

export interface PushUsageResult {
  billingRef: string;
  invoiceNumber: string;
  status: 'draft' | 'unpaid' | 'paid';
  total: number;
  currency: string;
  payUrl: string | null;
  dueAt: string | null;
}

export interface IBillingProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Kiracıyı omurgada açar/günceller → `billing_ref`. */
  syncCustomer(c: BillingCustomer): Promise<string>;
  /** Dönem kalemlerini gönderir → fatura. Idempotens anahtarı `idempotencyKey`. */
  pushUsage(customerRef: string, period: string, lines: UsageLine[], idempotencyKey: string): Promise<PushUsageResult>;
  /** Ödeme sayfası derin linki. */
  payLink(billingRef: string): Promise<string | null>;
  /** Webhook imza doğrulaması (raw body). */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  /** Sağlayıcıya özgü webhook gövdesini kanonik biçime çevirir. */
  parseWebhook(body: unknown): unknown;
}
