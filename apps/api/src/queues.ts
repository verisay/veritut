import { Queue } from 'bullmq';
import { queueConnection } from './redis.js';

/**
 * Kuyruk adları (D4). Runner: provision, provider-sync, drill. Worker: probe, notify, report, rollup.
 * `jobId` = idempotens anahtarı (`run-<uuid>` — BullMQ özel id'de ':' yasak).
 */
export const QUEUE_NAMES = ['provision', 'provider-sync', 'drill', 'probe', 'notify', 'report', 'rollup'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const queues = new Map<QueueName, Queue>();
export function queue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: queueConnection });
    queues.set(name, q);
  }
  return q;
}

export async function queueCounts(): Promise<Record<string, { waiting: number; active: number }>> {
  const out: Record<string, { waiting: number; active: number }> = {};
  await Promise.all(
    QUEUE_NAMES.map(async (n) => {
      try {
        const c = await queue(n).getJobCounts('waiting', 'active');
        out[n] = { waiting: c['waiting'] ?? 0, active: c['active'] ?? 0 };
      } catch {
        out[n] = { waiting: -1, active: -1 };
      }
    }),
  );
  return out;
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
}
