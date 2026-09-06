import { defineMachine } from './machine.js';

export const WORKLOAD_STATUSES = [
  'requested',
  'provisioning',
  'active',
  'degraded',
  'suspended',
  'decommissioning',
  'destroyed',
  'failed',
] as const;
export type WorkloadStatus = (typeof WORKLOAD_STATUSES)[number];

/**
 * plan §5: `active`'e geçiş yalnız verify adımı yeşilse (servis kontrol eder);
 * `destroyed` yalnız onaylı change + yedek kanıtı varsa; `suspended` veri silmez.
 */
export const workloadMachine = defineMachine<WorkloadStatus>({
  name: 'workload',
  initial: 'requested',
  transitions: {
    requested: ['provisioning', 'failed'],
    provisioning: ['active', 'degraded', 'failed'],
    active: ['degraded', 'suspended', 'decommissioning', 'provisioning'],
    degraded: ['active', 'suspended', 'decommissioning'],
    suspended: ['active', 'decommissioning'],
    decommissioning: ['destroyed', 'failed'],
    destroyed: [],
    failed: ['provisioning', 'decommissioning'],
  },
  terminal: ['destroyed'],
});
