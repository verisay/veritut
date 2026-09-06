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

/**
 * Tür tonu — kanıt çipinin semantik rengi (`.vt-kind[data-tone]`).
 * Sözlük kapalı olduğu için ton haritası da tam (exhaustive) tutulur.
 * `evidence` = sorumluluğu yerine getirdik · `info` = yaptığımız iş ·
 * `warn` = dikkat isteyen erişim/geri alma · `down` = başarısızlık, gizlenmez.
 */
export type EvidenceTone = 'evidence' | 'info' | 'warn' | 'down';

export const EVIDENCE_KIND_TONE: Record<EvidenceKind, EvidenceTone> = {
  'workload.provisioned': 'info',
  'workload.upgraded': 'info',
  'workload.destroyed': 'warn',
  'backup.completed': 'evidence',
  'backup.failed': 'down',
  'restore.drill.passed': 'evidence',
  'restore.drill.failed': 'down',
  'patch.applied': 'info',
  'access.session': 'warn',
  'change.applied': 'info',
  'change.rolled_back': 'warn',
  'incident.resolved': 'down',
  'secret.rotated': 'info',
  'tenant.offboarded': 'warn',
  'breakglass.used': 'down',
};

export function isEvidenceKind(v: string): v is EvidenceKind {
  return (EVIDENCE_KINDS as readonly string[]).includes(v);
}
