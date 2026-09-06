import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { EvidenceKind } from '@veritut/types';
import { db } from '../db/db.js';
import { evidenceEvents } from '../db/schema/index.js';
import { GENESIS_HASH, computeEvidenceHash, verifyChain, type ChainVerdict } from '../lib/evidence-hash.js';

/**
 * Kanıt Defteri (D13). append: kiracı başına advisory lock içinde seq+1, prev_hash zinciri.
 * tenantId=null → platform zinciri. Tablo append-only (DB trigger).
 */
export interface AppendInput {
  tenantId: string | null;
  kind: EvidenceKind;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
  actor?: string;
}

function lockKey(tenantId: string | null): string {
  return tenantId ? `evidence:${tenantId}` : 'evidence:platform';
}

export async function appendEvidence(i: AppendInput) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey(i.tenantId)}))`);
    const [last] = await tx
      .select({ seq: evidenceEvents.seq, hash: evidenceEvents.hash })
      .from(evidenceEvents)
      .where(i.tenantId ? eq(evidenceEvents.tenantId, i.tenantId) : isNull(evidenceEvents.tenantId))
      .orderBy(desc(evidenceEvents.seq))
      .limit(1);
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.hash ?? GENESIS_HASH;
    const occurredAt = new Date();
    const hash = computeEvidenceHash({ prevHash, kind: i.kind, payload: i.payload, occurredAt });
    const [row] = await tx
      .insert(evidenceEvents)
      .values({
        tenantId: i.tenantId,
        seq,
        kind: i.kind,
        subjectType: i.subjectType,
        subjectId: i.subjectId,
        payload: i.payload,
        actor: i.actor ?? 'system',
        occurredAt,
        prevHash,
        hash,
      })
      .returning();
    return row!;
  });
}

export async function listEvidence(tenantId: string | null, opts: { limit: number; kind?: string }) {
  const where = [tenantId ? eq(evidenceEvents.tenantId, tenantId) : isNull(evidenceEvents.tenantId)];
  if (opts.kind) where.push(eq(evidenceEvents.kind, opts.kind));
  return db
    .select()
    .from(evidenceEvents)
    .where(and(...where))
    .orderBy(desc(evidenceEvents.seq))
    .limit(opts.limit);
}

export async function verifyEvidenceChain(tenantId: string | null, from?: number, to?: number): Promise<ChainVerdict & { lastHash: string | null }> {
  const where = [tenantId ? eq(evidenceEvents.tenantId, tenantId) : isNull(evidenceEvents.tenantId)];
  if (from !== undefined) where.push(gte(evidenceEvents.seq, from));
  if (to !== undefined) where.push(lte(evidenceEvents.seq, to));
  const rows = await db
    .select({
      seq: evidenceEvents.seq,
      kind: evidenceEvents.kind,
      payload: evidenceEvents.payload,
      occurredAt: evidenceEvents.occurredAt,
      prevHash: evidenceEvents.prevHash,
      hash: evidenceEvents.hash,
    })
    .from(evidenceEvents)
    .where(and(...where))
    .orderBy(asc(evidenceEvents.seq));
  if (rows.length === 0) return { ok: true, checked: 0, brokenAt: null, lastHash: null };
  // Aralık başı: ilk olayın prev_hash'i başlangıç kabul edilir (tam zincir için from=1).
  const verdict = verifyChain(rows, rows[0]!.prevHash);
  return { ...verdict, lastHash: rows[rows.length - 1]!.hash };
}
