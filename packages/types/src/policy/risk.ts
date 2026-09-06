import type { PlanSummary, RunRisk } from '../blueprint.js';
import type { RunKind } from '../machines/run.js';

/**
 * Çalıştırma riski (plan §3.3 adım 3): yüksek risk → `awaiting_approval` + dört-göz.
 *  - destroy, rotate-secrets: her zaman high
 *  - resize/upgrade: plan'da silme/yeniden yaratma varsa high, yalnız değişiklik medium
 *  - provision: yeni kaynak yaratımı low; plan beklenmedik silme içeriyorsa high
 *  - drift-plan/provider-sync/backup/echo: low
 */
export function riskFor(kind: RunKind, plan: PlanSummary | null): RunRisk {
  if (kind === 'destroy' || kind === 'rotate-secrets') return 'high';
  if (!plan) return kind === 'resize' || kind === 'upgrade' ? 'medium' : 'low';
  if (plan.destroy > 0 || plan.replace > 0) return 'high';
  if (kind === 'resize' || kind === 'upgrade' || kind === 'patch') return plan.change > 0 ? 'medium' : 'low';
  return 'low';
}

export function requiresApproval(risk: RunRisk): boolean {
  return risk === 'high';
}
