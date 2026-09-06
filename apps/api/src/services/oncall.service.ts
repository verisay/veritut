import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { IncidentSeverity } from '@veritut/types';
import type { z } from 'zod';
import type { oncallShiftSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { oncallShifts, staff } from '../db/schema/index.js';
import { queue } from '../queues.js';
import { logger } from '../config/logger.js';
import { audit } from './audit.service.js';
import { notifyStaff } from './notification.service.js';

/** Nöbet rotası + eskalasyon (plan §8.3). Dış rota sistemi ALINMAZ — arşivlenme riski. */
export async function currentOncall(level = 1, at = new Date()) {
  const [row] = await db
    .select({ staffId: staff.id, email: staff.email, name: staff.displayName, level: oncallShifts.escalationLevel })
    .from(oncallShifts)
    .innerJoin(staff, eq(staff.id, oncallShifts.staffId))
    .where(and(eq(oncallShifts.escalationLevel, level), lte(oncallShifts.startsAt, at), gte(oncallShifts.endsAt, at), eq(staff.active, true)))
    .orderBy(asc(oncallShifts.startsAt))
    .limit(1);
  return row ?? null;
}

export async function listShifts(fromDays = 7, toDays = 30) {
  const from = new Date(Date.now() - fromDays * 86400_000);
  const to = new Date(Date.now() + toDays * 86400_000);
  return db
    .select({ id: oncallShifts.id, staffId: staff.id, email: staff.email, name: staff.displayName, startsAt: oncallShifts.startsAt, endsAt: oncallShifts.endsAt, level: oncallShifts.escalationLevel })
    .from(oncallShifts)
    .innerJoin(staff, eq(staff.id, oncallShifts.staffId))
    .where(and(gte(oncallShifts.endsAt, from), lte(oncallShifts.startsAt, to)))
    .orderBy(asc(oncallShifts.startsAt));
}

export async function createShift(input: z.infer<typeof oncallShiftSchema>, staffId: string) {
  const [row] = await db.insert(oncallShifts).values({ staffId: input.staffId, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), escalationLevel: input.escalationLevel }).returning();
  await audit({ actorType: 'staff', actorId: staffId, action: 'oncall.create', subjectType: 'oncall_shift', subjectId: row!.id, after: input });
  return row!;
}

export async function deleteShift(id: string, staffId: string) {
  await db.delete(oncallShifts).where(eq(oncallShifts.id, id));
  await audit({ actorType: 'staff', actorId: staffId, action: 'oncall.delete', subjectType: 'oncall_shift', subjectId: id });
}

/**
 * Eskalasyon: 1. seviye nöbetçiye SMS/çağrı (IAlertSink → worker `notify`), yanıt yoksa 2. seviye.
 * Nöbetçi atanmamışsa TÜM operatörlere düşer — sessiz kalmaz.
 */
export async function escalate(incidentId: string, title: string, severity: IncidentSeverity, dueAt: Date | null): Promise<void> {
  const l1 = await currentOncall(1);
  const l2 = await currentOncall(2);
  const targets = [l1, l2].filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (targets.length === 0) {
    logger.error({ incidentId }, 'nöbetçi atanmamış — tüm operatörlere eskalasyon');
    await notifyStaff({ kind: 'system', title: `ESKALASYON (nöbetçi yok): ${severity.toUpperCase()} ${title}`, body: `Yanıt hedefi ${dueAt?.toISOString() ?? '—'} yaklaşıyor ve olay yanıtsız.`, link: `/olaylar/${incidentId}` }, 'operator');
    return;
  }
  for (const t of targets) {
    await queue('notify').add(
      'alert',
      { channel: 'sms', to: t.email, subject: `[${severity.toUpperCase()}] ${title}`, text: `Olay yanıtsız, yanıt hedefi ${dueAt?.toISOString() ?? '—'}. /olaylar/${incidentId}`, incidentId },
      { removeOnComplete: 200 },
    );
  }
  await notifyStaff({ kind: 'system', title: `ESKALASYON: ${severity.toUpperCase()} ${title}`, body: `Nöbetçiler uyarıldı: ${targets.map((t) => t.email).join(', ')}`, link: `/olaylar/${incidentId}` }, 'operator');
}

export { desc };
