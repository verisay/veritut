import { defineMachine } from './machine.js';

export const RUN_STATUSES = ['queued', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_KINDS = [
  'provision',
  'upgrade',
  'resize',
  'destroy',
  'patch',
  'rotate-secrets',
  'drill',
  'drift-plan',
  'provider-sync',
  'backup',
  'echo',
] as const;
export type RunKind = (typeof RUN_KINDS)[number];

/** `awaiting_approval` yalnız risk=high çalıştırmalarda (plan §3.3 adım 3). */
export const runMachine = defineMachine<RunStatus>({
  name: 'run',
  initial: 'queued',
  transitions: {
    queued: ['running', 'failed', 'cancelled'], // failed: ilk adıma varamadan (kilit, kuyruk) düşen job
    running: ['awaiting_approval', 'succeeded', 'failed', 'cancelled'],
    awaiting_approval: ['running', 'cancelled'],
    succeeded: [],
    failed: [],
    cancelled: [],
  },
  terminal: ['succeeded', 'failed', 'cancelled'],
});

export const RUN_STEPS = ['validate', 'unseal', 'plan', 'apply', 'configure', 'verify', 'register', 'handoff'] as const;
export type RunStep = (typeof RUN_STEPS)[number];
