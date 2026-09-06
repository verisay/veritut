import { eq } from 'drizzle-orm';
import type { accessSessionSchema } from '@veritut/validators';
import type { z } from 'zod';
import { db } from '../db/db.js';
import { accessSessions, staff, workloads } from '../db/schema/index.js';
import { appendEvidence } from './evidence.service.js';
import { notifyTenant } from './notification.service.js';

/** Bastion/Teleport oturum ingest'i → `access.session` kanıtı + kiracıya şeffaflık bildirimi (plan §6.5). */
export async function ingestAccessSession(s: z.infer<typeof accessSessionSchema>) {
  let tenantId = s.tenantId ?? null;
  let workloadSlug: string | null = null;
  if (s.workloadId) {
    const [w] = await db.select({ tenantId: workloads.tenantId, slug: workloads.slug }).from(workloads).where(eq(workloads.id, s.workloadId)).limit(1);
    if (w) { tenantId = w.tenantId; workloadSlug = w.slug; }
  }
  let staffId: string | null = null;
  if (s.staffEmail) {
    const [st] = await db.select({ id: staff.id }).from(staff).where(eq(staff.email, s.staffEmail.toLowerCase())).limit(1);
    staffId = st?.id ?? null;
  }
  const ev = await appendEvidence({
    tenantId,
    kind: 'access.session',
    subjectType: s.workloadId ? 'workload' : 'target',
    subjectId: s.workloadId ?? s.target,
    payload: { actor: s.actorLabel, source: s.source, target: s.target, reason: s.reason ?? null, startedAt: s.startedAt, endedAt: s.endedAt ?? null, recordingRef: s.recordingRef ?? null, workloadSlug },
    actor: `staff:${s.actorLabel}`,
  });
  const [row] = await db
    .insert(accessSessions)
    .values({ tenantId, workloadId: s.workloadId ?? null, staffId, actorLabel: s.actorLabel, source: s.source, target: s.target, reason: s.reason ?? null, startedAt: new Date(s.startedAt), endedAt: s.endedAt ? new Date(s.endedAt) : null, recordingRef: s.recordingRef ?? null, evidenceId: ev.id })
    .returning();
  if (tenantId) {
    await notifyTenant(tenantId, ['owner', 'admin', 'technical'], { kind: 'system', title: `VERITUT personeli ${s.actorLabel} ${workloadSlug ?? s.target} üzerinde oturum açtı`, body: s.reason ?? 'Gerekçe belirtilmedi.', link: s.workloadId ? `/panel/is-yukleri/${s.workloadId}` : null });
  }
  return { session: row!, evidence: ev };
}
