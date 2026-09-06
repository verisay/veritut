import type { IBillingProvider } from './types.js';
import { MockBillingProvider } from './mock.js';
import { FossBillingProvider } from './fossbilling.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let instance: IBillingProvider | null = null;

/** Factory (D9): `BILLING_PROVIDER` env — mock (dev) · fossbilling (K3 canlı) · entranet (K6). */
export function createBillingProvider(): IBillingProvider {
  if (instance) return instance;
  const kind = env.BILLING_PROVIDER;
  if (kind === 'fossbilling') {
    const p = new FossBillingProvider();
    if (!p.configured) logger.error('BILLING_PROVIDER=fossbilling ama URL/API anahtarı yok — faturalama çağrıları hata verecek');
    instance = p;
  } else {
    instance = new MockBillingProvider();
  }
  logger.info({ provider: instance.name }, 'billing provider hazır');
  return instance;
}
export type { IBillingProvider, UsageLine, PushUsageResult } from './types.js';
