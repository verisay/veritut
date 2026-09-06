import { db } from '../db/db.js';
import { auditLog } from '../db/schema/index.js';

export interface AuditEntry {
  actorType: 'user' | 'staff' | 'system' | 'api_key' | 'runner' | 'worker';
  actorId?: string | null;
  tenantId?: string | null;
  action: string;
  subjectType?: string;
  subjectId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** Her ops mutasyonu ve kiracı-kritik eylem buraya düşer (append-only tablo). */
export async function audit(e: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    tenantId: e.tenantId ?? null,
    action: e.action,
    subjectType: e.subjectType ?? null,
    subjectId: e.subjectId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
    ip: e.ip ?? null,
  });
}
