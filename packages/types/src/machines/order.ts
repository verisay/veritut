import { defineMachine } from './machine.js';

export const ORDER_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'provisioning',
  'fulfilled',
  'rejected',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderMachine = defineMachine<OrderStatus>({
  name: 'order',
  initial: 'draft',
  transitions: {
    draft: ['submitted', 'cancelled'],
    submitted: ['approved', 'rejected', 'cancelled'],
    approved: ['provisioning', 'cancelled'],
    provisioning: ['fulfilled', 'cancelled'],
    fulfilled: [],
    rejected: [],
    cancelled: [],
  },
  terminal: ['fulfilled', 'rejected', 'cancelled'],
});
