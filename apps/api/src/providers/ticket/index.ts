import type { ITicketProvider } from './types.js';
import { MockTicketProvider } from './mock.js';
import { ZammadTicketProvider } from './zammad.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let instance: ITicketProvider | null = null;

export function createTicketProvider(): ITicketProvider {
  if (instance) return instance;
  if (env.TICKET_PROVIDER === 'zammad') {
    const p = new ZammadTicketProvider();
    if (!p.configured) logger.error('TICKET_PROVIDER=zammad ama URL/token yok');
    instance = p;
  } else {
    instance = new MockTicketProvider();
  }
  logger.info({ provider: instance.name }, 'ticket provider hazır');
  return instance;
}
export type { ITicketProvider } from './types.js';
