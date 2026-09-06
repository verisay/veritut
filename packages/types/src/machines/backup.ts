import { defineMachine } from './machine.js';

export const BACKUP_JOB_STATUSES = ['scheduled', 'running', 'completed', 'failed'] as const;
export type BackupJobStatus = (typeof BACKUP_JOB_STATUSES)[number];

export const backupJobMachine = defineMachine<BackupJobStatus>({
  name: 'backup_job',
  initial: 'scheduled',
  transitions: {
    scheduled: ['running'],
    running: ['completed', 'failed'],
    completed: [],
    failed: [],
  },
  terminal: ['completed', 'failed'],
});

export const RESTORE_DRILL_STATUSES = ['scheduled', 'running', 'passed', 'failed'] as const;
export type RestoreDrillStatus = (typeof RESTORE_DRILL_STATUSES)[number];

export const restoreDrillMachine = defineMachine<RestoreDrillStatus>({
  name: 'restore_drill',
  initial: 'scheduled',
  transitions: {
    scheduled: ['running'],
    running: ['passed', 'failed'],
    passed: [],
    failed: [],
  },
  terminal: ['passed', 'failed'],
});
