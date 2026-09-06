import type { ProviderCode } from '../roles.js';

/** Tedarikçi yoğunlaşma eşiği (plan §14 K5 kabul: %60 kuralı). */
export const CONCENTRATION_THRESHOLD = 0.6;

export interface ConcentrationReport {
  total: number;
  byProvider: Partial<Record<ProviderCode, number>>;
  /** Eşiği aşan tedarikçiler — ops uyarısı üretir. */
  overThreshold: ProviderCode[];
}

export function computeConcentration(workloadProviders: readonly ProviderCode[]): ConcentrationReport {
  const byProvider: Partial<Record<ProviderCode, number>> = {};
  for (const p of workloadProviders) byProvider[p] = (byProvider[p] ?? 0) + 1;
  const total = workloadProviders.length;
  const overThreshold = (Object.keys(byProvider) as ProviderCode[]).filter(
    (p) => total > 0 && (byProvider[p] ?? 0) / total > CONCENTRATION_THRESHOLD,
  );
  return { total, byProvider, overThreshold };
}
