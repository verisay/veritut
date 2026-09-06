/**
 * Kanıt Defteri olay türleri — KAPALI sözlük (plan §4.5). Yeni tür = plan revizyonu.
 * Her tür bir "sorumluluğun kanıtı"dır: yedek, tatbikat, yama, erişim, değişiklik…
 */
export const EVIDENCE_KINDS = [
  'workload.provisioned',
  'workload.upgraded',
  'workload.destroyed',
  'backup.completed',
  'backup.failed',
  'restore.drill.passed',
  'restore.drill.failed',
  'patch.applied',
  'access.session',
  'change.applied',
  'change.rolled_back',
  'incident.resolved',
  'secret.rotated',
  'tenant.offboarded',
  'breakglass.used',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  'workload.provisioned': 'İş yükü kuruldu',
  'workload.upgraded': 'İş yükü yükseltildi',
  'workload.destroyed': 'İş yükü yok edildi',
  'backup.completed': 'Yedek tamamlandı',
  'backup.failed': 'Yedek başarısız',
  'restore.drill.passed': 'Geri dönüş tatbikatı geçti',
  'restore.drill.failed': 'Geri dönüş tatbikatı başarısız',
  'patch.applied': 'Yama uygulandı',
  'access.session': 'Erişim oturumu',
  'change.applied': 'Değişiklik uygulandı',
  'change.rolled_back': 'Değişiklik geri alındı',
  'incident.resolved': 'Olay çözüldü',
  'secret.rotated': 'Sır döndürüldü',
  'tenant.offboarded': 'Kiracı ayrıldı',
  'breakglass.used': 'Acil erişim kullanıldı',
};

export function isEvidenceKind(v: string): v is EvidenceKind {
  return (EVIDENCE_KINDS as readonly string[]).includes(v);
}
