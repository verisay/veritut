import type { ProviderCode, Residency } from './roles.js';

/** Tedarikçi envanter kalemi — driver `listInventory()` çıktısı (runner → API iç ucu). */
export const INVENTORY_KINDS = ['server', 'volume', 'ip', 'load_balancer', 'snapshot', 'bucket', 'other'] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

export interface InventoryItem {
  externalId: string;
  kind: InventoryKind;
  name: string;
  region: string | null;
  /** Bölgenin ikametgâh sınıfı — driver eşler (fsn1/nbg1/hel1 → EU). */
  residency: Residency | null;
  status: string;
  specs: Record<string, unknown>;
  tags: Record<string, string>;
  /** Fiyat listesi × kaynak — aylık brüt tahmin (tedarikçi para biriminde). */
  monthlyCostEstimate: number | null;
  currency: string;
}

export interface ProviderCapabilities {
  code: ProviderCode;
  regions: Array<{ code: string; residency: Residency; name: string }>;
  sizes: string[];
}

/** Bildirim türleri (kapalı sözlük). */
export const NOTIFICATION_KINDS = [
  'invitation',
  'backup.failed_twice',
  'inventory.unmatched',
  'provider.concentration',
  'run.failed',
  'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  invitation: 'Davet',
  'backup.failed_twice': 'Yedek ardışık başarısız',
  'inventory.unmatched': 'Sahipsiz kaynak',
  'provider.concentration': 'Tedarikçi yoğunlaşması',
  'run.failed': 'Çalıştırma başarısız',
  system: 'Sistem',
};

/** Portal sağlık kartı (plan §1.4). */
export interface WorkloadHealthCard {
  id: string;
  slug: string;
  name: string;
  productSlug: string;
  status: string;
  residency: Residency;
  provider: ProviderCode | null;
  region: string | null;
  size: string | null;
  slaTier: string;
  uptime30d: number | null;
  bars30d: Array<'ok' | 'degraded' | 'down' | 'maintenance' | 'unknown'>;
  lastBackupAt: string | null;
  lastBackupOk: boolean | null;
  lastVerifiedRestoreAt: string | null;
  monthCost: number | null;
  costCurrency: string;
  openAccessSessions: number;
}
