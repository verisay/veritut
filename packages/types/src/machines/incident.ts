import { defineMachine } from './machine.js';

export const INCIDENT_STATUSES = ['open', 'identified', 'monitoring', 'resolved', 'postmortem_done'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_SEVERITIES = ['sev1', 'sev2', 'sev3', 'sev4'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

/** SLA saati `open`'da başlar, `resolved`'da durur; sev1/sev2 post-mortem'siz kapanmaz (servis). */
export const incidentMachine = defineMachine<IncidentStatus>({
  name: 'incident',
  initial: 'open',
  transitions: {
    open: ['identified', 'resolved'],
    identified: ['monitoring', 'resolved'],
    monitoring: ['identified', 'resolved'],
    resolved: ['postmortem_done', 'monitoring'],
    postmortem_done: [],
  },
  terminal: ['postmortem_done'],
});
