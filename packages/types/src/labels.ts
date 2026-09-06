import type { ComponentState, Residency, StaffRole, TenantRole } from './roles.js';
import type { WorkloadStatus } from './machines/workload.js';
import type { RunStatus } from './machines/run.js';

/**
 * Anahtar/etiket ayrımı TEK yerde (D24): DB anahtarları İngilizce, UI Türkçe.
 * Bileşenler bu sözlükten okur; app içinde etiket çevirisi yazılmaz.
 */
export const TENANT_ROLE_LABEL: Record<TenantRole, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  technical: 'Teknik',
  billing: 'Mali',
  viewer: 'Salt okuma',
};

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  operator: 'Operatör',
  senior: 'Kıdemli operatör',
  platform_admin: 'Platform yöneticisi',
};

export const RESIDENCY_LABEL: Record<Residency, string> = {
  TR: 'Türkiye',
  EU: 'Avrupa Birliği',
  US: 'ABD',
};

export const COMPONENT_STATE_LABEL: Record<ComponentState, string> = {
  ok: 'Çalışıyor',
  degraded: 'Kısmi sorun',
  down: 'Erişilemiyor',
  maintenance: 'Bakımda',
  unknown: 'Bilinmiyor',
};

export const WORKLOAD_STATUS_LABEL: Record<WorkloadStatus, string> = {
  requested: 'Talep edildi',
  provisioning: 'Kuruluyor',
  active: 'Aktif',
  degraded: 'Kısmi sorun',
  suspended: 'Askıda',
  decommissioning: 'Kaldırılıyor',
  destroyed: 'Yok edildi',
  failed: 'Başarısız',
};

export const RUN_RISK_LABEL: Record<'low' | 'medium' | 'high', string> = { low: 'düşük', medium: 'orta', high: 'yüksek' };

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Sırada',
  running: 'Çalışıyor',
  awaiting_approval: 'Onay bekliyor',
  succeeded: 'Başarılı',
  failed: 'Başarısız',
  cancelled: 'İptal edildi',
};
