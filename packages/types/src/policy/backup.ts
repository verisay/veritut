import type { ProviderCode } from '../roles.js';

/**
 * 3-2-1 politikası (D15): en az 2 kopya (birincil + offsite), offsite FARKLI tedarikçide.
 * Aynı tedarikçinin farklı hesabı offsite sayılmaz — hesap askıya alınması riski (plan §9 risk 3).
 */
export interface BackupTopology {
  primaryProvider: ProviderCode;
  offsiteProvider: ProviderCode | null;
}

export type BackupPolicyViolation = 'offsite_missing' | 'offsite_same_provider';

export function checkBackupTopology(t: BackupTopology): BackupPolicyViolation[] {
  if (t.offsiteProvider === null) return ['offsite_missing'];
  if (t.offsiteProvider === t.primaryProvider) return ['offsite_same_provider'];
  return [];
}
