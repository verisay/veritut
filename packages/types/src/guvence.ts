import type { IncidentSeverity, IncidentStatus } from './machines/incident.js';

/** Olay ciddiyeti — SLA saatini ve eskalasyonu belirler (plan §8.3). */
export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  sev1: 'Sev1 — hizmet durdu',
  sev2: 'Sev2 — ciddi bozulma',
  sev3: 'Sev3 — kısmi etki',
  sev4: 'Sev4 — düşük etki',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Açık',
  identified: 'Nedeni bulundu',
  monitoring: 'İzleniyor',
  resolved: 'Çözüldü',
  postmortem_done: 'Post-mortem tamam',
};

/** Post-mortem yazılmadan kapanamayan ciddiyetler. */
export const POSTMORTEM_REQUIRED: IncidentSeverity[] = ['sev1', 'sev2'];

/** Ciddiyet → çözüm hedefi çarpanı (SLA katmanının resolveMin'i üzerine). */
export const SEVERITY_RESOLVE_FACTOR: Record<IncidentSeverity, number> = { sev1: 0.5, sev2: 1, sev3: 2, sev4: 4 };

export const ALERT_SEVERITIES = ['critical', 'warning', 'info'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/** Alarm ciddiyeti → olay ciddiyeti (otomatik olay kuralı). */
export const ALERT_TO_INCIDENT: Record<AlertSeverity, IncidentSeverity> = { critical: 'sev2', warning: 'sev3', info: 'sev4' };

export const CHANNEL_KINDS = ['email', 'webhook', 'slack', 'teams', 'sms'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export const CHANNEL_KIND_LABEL: Record<ChannelKind, string> = { email: 'E-posta', webhook: 'Webhook', slack: 'Slack', teams: 'Teams', sms: 'SMS' };

/** Müşteri alarm kanallarının abone olabileceği olaylar. */
export const CHANNEL_EVENTS = ['incident.opened', 'incident.resolved', 'maintenance.scheduled', 'backup.failed', 'drill.failed', 'sla.breach'] as const;
export type ChannelEvent = (typeof CHANNEL_EVENTS)[number];
export const CHANNEL_EVENT_LABEL: Record<ChannelEvent, string> = {
  'incident.opened': 'Olay açıldı',
  'incident.resolved': 'Olay çözüldü',
  'maintenance.scheduled': 'Planlı bakım',
  'backup.failed': 'Yedek başarısız',
  'drill.failed': 'Tatbikat başarısız',
  'sla.breach': 'SLA ihlali',
};

export const DOCUMENT_KINDS = ['dpa', 'subprocessors', 'sla_report', 'evidence_bundle', 'terms'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  dpa: 'Veri işleme sözleşmesi',
  subprocessors: 'Alt işleyen listesi',
  sla_report: 'Aylık SLA raporu',
  evidence_bundle: 'Kanıt paketi',
  terms: 'Hizmet şartları',
};

export const DRILL_STATUS_LABEL: Record<string, string> = { scheduled: 'Planlandı', running: 'Çalışıyor', passed: 'Geçti', failed: 'Başarısız' };

/**
 * SLA kredi tablosu (sözleşme eki): hedefin altındaki her uptime dilimi için aylık ücretin yüzdesi.
 * Talep etmeye gerek yok — hesaplanır, raporlanır ve faturaya negatif kalem olarak düşer.
 */
export const SLA_CREDIT_TABLE: Array<{ minShortfallPct: number; creditPct: number }> = [
  { minShortfallPct: 0.05, creditPct: 5 },
  { minShortfallPct: 0.5, creditPct: 10 },
  { minShortfallPct: 1.5, creditPct: 25 },
  { minShortfallPct: 5, creditPct: 50 },
];

export function creditPctFor(uptimePct: number, targetPct: number): number {
  const shortfall = Math.round((targetPct - uptimePct) * 1000) / 1000;
  if (shortfall <= 0) return 0;
  let credit = 0;
  for (const row of SLA_CREDIT_TABLE) if (shortfall >= row.minShortfallPct) credit = row.creditPct;
  return credit;
}

export interface IncidentDto {
  id: string;
  number: number;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  customerVisible: boolean;
  createdAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  responseDueAt: string | null;
  resolveDueAt: string | null;
  responseBreached: boolean;
  resolveBreached: boolean;
}
