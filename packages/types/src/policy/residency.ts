import type { Residency } from '../roles.js';

/**
 * Veri ikametgâhı politikası (D25, plan §7.3). Kodda yaşar, dokümanda değil.
 * Kural: iş yükü, birincil yedek ve offsite yedek aynı ikametgâh sınıfında kalır.
 *  - TR → yalnız TR
 *  - EU → EU veya TR (AB verisi TR'ye çıkabilir; sözleşme metniyle eş)
 *  - US → US, EU veya TR (en gevşek sınıf)
 * Hiçbir sınıf ABD'ye "yukarı" çıkmaz: TR/EU verisi US kovasına gidemez.
 */
const ALLOWED_TARGETS: Record<Residency, readonly Residency[]> = {
  TR: ['TR'],
  EU: ['EU', 'TR'],
  US: ['US', 'EU', 'TR'],
};

export function isResidencyCompatible(workload: Residency, target: Residency): boolean {
  return ALLOWED_TARGETS[workload].includes(target);
}

export interface ResidencyViolation {
  subject: 'region' | 'primary_backup' | 'offsite_backup';
  expected: Residency;
  actual: Residency;
}

export function checkResidency(input: {
  workload: Residency;
  region: Residency;
  primaryBackup?: Residency;
  offsiteBackup?: Residency;
}): ResidencyViolation[] {
  const v: ResidencyViolation[] = [];
  if (!isResidencyCompatible(input.workload, input.region)) {
    v.push({ subject: 'region', expected: input.workload, actual: input.region });
  }
  if (input.primaryBackup && !isResidencyCompatible(input.workload, input.primaryBackup)) {
    v.push({ subject: 'primary_backup', expected: input.workload, actual: input.primaryBackup });
  }
  if (input.offsiteBackup && !isResidencyCompatible(input.workload, input.offsiteBackup)) {
    v.push({ subject: 'offsite_backup', expected: input.workload, actual: input.offsiteBackup });
  }
  return v;
}
