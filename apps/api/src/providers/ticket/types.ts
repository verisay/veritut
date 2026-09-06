/** ITicketProvider (D18) — destek masası Zammad'dır (dogfood); Core yalnız ayna tutar. */
export interface TicketCreate {
  tenantSlug: string;
  tenantName: string;
  requesterEmail: string;
  requesterName: string;
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  workloadSlug?: string | null;
}

export interface TicketRef {
  externalRef: string;
  number: string;
  state: string;
}

export interface ITicketProvider {
  readonly name: string;
  readonly configured: boolean;
  create(t: TicketCreate): Promise<TicketRef>;
  reply(externalRef: string, body: string, author: { email: string; name: string }): Promise<{ externalRef: string }>;
  /** Dönem içi harcanan destek dakikası (KPI: müşteri başına destek dakikası). */
  timeAccounting(period: string): Promise<Array<{ externalRef: string; minutes: number }>>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: unknown): unknown;
}
