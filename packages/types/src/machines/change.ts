import { defineMachine } from './machine.js';

export const CHANGE_STATUSES = ['draft', 'approved', 'executing', 'verified', 'rolled_back', 'rejected'] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export const CHANGE_RISKS = ['low', 'medium', 'high'] as const;
export type ChangeRisk = (typeof CHANGE_RISKS)[number];

/** Yüksek risk: onaylayan ≠ talep eden (dört-göz) — servis zorlar. */
export const changeMachine = defineMachine<ChangeStatus>({
  name: 'change',
  initial: 'draft',
  transitions: {
    draft: ['approved', 'rejected'],
    approved: ['executing', 'rejected'],
    executing: ['verified', 'rolled_back'],
    verified: [],
    rolled_back: [],
    rejected: [],
  },
  terminal: ['verified', 'rolled_back', 'rejected'],
});
