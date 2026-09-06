import { FEATURE_KEYS, type FeatureKey, type FeatureValue, type Features } from '../catalog.js';

/**
 * Entitlement TEK formülü (plan §4.2): plan özellikleri + kiracı istisnaları.
 * Bilinmeyen anahtar YOK SAYILIR (kapalı sözlük); istisna planı her zaman ezer.
 */
export function getEffectiveFeatures(planFeatures: Features, overrides: Partial<Record<string, FeatureValue>> = {}): Features {
  const out: Features = {};
  for (const k of FEATURE_KEYS) {
    if (planFeatures[k] !== undefined) out[k] = planFeatures[k];
  }
  for (const [k, v] of Object.entries(overrides)) {
    if ((FEATURE_KEYS as readonly string[]).includes(k) && v !== undefined) out[k as FeatureKey] = v;
  }
  return out;
}

/** Özellik açık mı? Sayısal kotalarda 0 kapalı, -1 sınırsız. */
export function hasFeature(features: Features, key: FeatureKey): boolean {
  const v = features[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  return false;
}

export function allowedSlaTiers(features: Features): string[] {
  const v = features['sla.tiers'];
  return Array.isArray(v) ? v : ['std_9x5'];
}
