import { z } from 'zod';
import { COMPONENT_STATES, RUN_STEPS } from '@veritut/types';

/** Runner → API: adım durumu raporu (plan §3.3 `run_steps`). */
export const runStepReportSchema = z.object({
  step: z.enum(RUN_STEPS),
  status: z.enum(['running', 'succeeded', 'failed', 'skipped']),
  summary: z.string().max(2000).optional(),
});
export type RunStepReport = z.infer<typeof runStepReportSchema>;

export const runFinishSchema = z.object({
  status: z.enum(['succeeded', 'failed']),
  exitCode: z.number().int().optional(),
  summary: z.record(z.unknown()).optional(),
});
export type RunFinish = z.infer<typeof runFinishSchema>;

/** Worker → API: probe sonuçları (status snapshot'ı API üretir, worker ölçer). */
export const probeResultsSchema = z.object({
  results: z
    .array(
      z.object({
        componentSlug: z.string().min(1),
        state: z.enum(COMPONENT_STATES),
        latencyMs: z.number().int().nonnegative().nullable(),
        checkedAt: z.string().datetime(),
      }),
    )
    .min(1),
});
export type ProbeResults = z.infer<typeof probeResultsSchema>;
