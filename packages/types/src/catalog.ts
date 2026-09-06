import type { Residency } from './roles.js';

/**
 * Entitlement özellik anahtarları (plan §4.2) — KAPALI sözlük. Plan `features` bunları taşır,
 * kiracıya özel istisnalar `tenant_feature_overrides` ile ezer. Tek formül: `getEffectiveFeatures`.
 */
export const FEATURE_KEYS = [
  'workloads.max',
  'users.max',
  'api.enabled',
  'api.keys.max',
  'backup.offsite',
  'backup.drill.monthly',
  'evidence.bundle',
  'status.tenant_page',
  'support.priority',
  'finops',
  'sla.tiers',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureValue = boolean | number | string[];
export type Features = Partial<Record<FeatureKey, FeatureValue>>;

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  'workloads.max': 'İş yükü sayısı',
  'users.max': 'Ekip üyesi sayısı',
  'api.enabled': 'Public API',
  'api.keys.max': 'API anahtarı sayısı',
  'backup.offsite': 'Farklı tedarikçide offsite yedek',
  'backup.drill.monthly': 'Aylık geri dönüş tatbikatı',
  'evidence.bundle': 'Aylık kanıt paketi (PDF)',
  'status.tenant_page': 'Kiracıya özel durum sayfası',
  'support.priority': 'Öncelikli destek kuyruğu',
  finops: 'FinOps maliyet optimizasyonu',
  'sla.tiers': 'Seçilebilir SLA katmanları',
};

/** Sınırsız = -1 (kota alanlarında). */
export const UNLIMITED = -1;

export function isUnlimited(v: FeatureValue | undefined): boolean {
  return v === UNLIMITED;
}

/** Kota kontrolü: mevcut kullanım limiti aşıyor mu? */
export function quotaExceeded(limit: FeatureValue | undefined, current: number): boolean {
  if (typeof limit !== 'number') return false;
  if (limit === UNLIMITED) return false;
  return current >= limit;
}

export interface PlanDto {
  code: string;
  title: string;
  summary: string;
  features: Features;
  sort: number;
}

export interface SlaTierDto {
  code: string;
  title: string;
  coverage: '9x5' | '24x7';
  responseMin: number;
  resolveMin: number;
  uptimeTarget: number;
  monthlyUpliftPct: number;
  sort: number;
}

export interface ProductDto {
  slug: string;
  layer: number;
  title: string;
  summary: string;
  blueprintSlug: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  bodyMd: string;
  faq: Array<{ q: string; a: string }>;
  compare: Array<{ rival: string; title: string; summary: string }>;
  sort: number;
}

export interface PriceDto {
  productSlug: string;
  size: string;
  residency: Residency;
  planCode: string;
  slaCode: string;
  currency: string;
  monthly: number;
  setupFee: number;
}

/** Sipariş özeti — portalda onay ekranında gösterilen tutar dökümü. */
export interface OrderQuote {
  productSlug: string;
  productTitle: string;
  size: string;
  sizeTitle: string;
  residency: Residency;
  planCode: string;
  slaCode: string;
  currency: string;
  monthly: number;
  setupFee: number;
  firstInvoiceTotal: number;
  trialDays: number;
  isTrial: boolean;
}

export const USAGE_METRICS = ['subscription', 'setup', 'storage_gb', 'traffic_gb', 'backup_gb', 'sla_credit'] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];
export const USAGE_METRIC_LABEL: Record<UsageMetric, string> = {
  subscription: 'Abonelik',
  setup: 'Kurulum bedeli',
  storage_gb: 'Depolama aşımı',
  traffic_gb: 'Trafik aşımı',
  backup_gb: 'Yedek alanı',
  sla_credit: 'SLA kredisi',
};

export const INVOICE_STATUSES = ['draft', 'unpaid', 'paid', 'refunded', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Taslak',
  unpaid: 'Ödenmedi',
  paid: 'Ödendi',
  refunded: 'İade edildi',
  cancelled: 'İptal',
};

export const TICKET_STATES = ['new', 'open', 'pending', 'resolved', 'closed'] as const;
export type TicketState = (typeof TICKET_STATES)[number];
export const TICKET_STATE_LABEL: Record<TicketState, string> = {
  new: 'Yeni',
  open: 'Açık',
  pending: 'Yanıt bekliyor',
  resolved: 'Çözüldü',
  closed: 'Kapandı',
};

export const ORDER_STATUS_LABEL_TR: Record<string, string> = {
  draft: 'Taslak',
  submitted: 'Gönderildi',
  approved: 'Onaylandı',
  provisioning: 'Kuruluyor',
  fulfilled: 'Teslim edildi',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};
