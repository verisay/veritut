import { defineMachine } from './machine.js';

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'suspended', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Yalnız billing webhook'u ilerletir; Core elle dokunmaz (D17). */
export const subscriptionMachine = defineMachine<SubscriptionStatus>({
  name: 'subscription',
  initial: 'trialing',
  transitions: {
    trialing: ['active', 'suspended', 'cancelled'],
    active: ['past_due', 'cancelled'],
    past_due: ['active', 'suspended', 'cancelled'],
    suspended: ['active', 'cancelled'],
    cancelled: [],
  },
  terminal: ['cancelled'],
});
