import { createHash } from 'node:crypto';

/**
 * Kanıt zinciri hash'i (D13): hash = sha256(prev_hash ‖ kind ‖ canonical_json(payload) ‖ occurred_at ISO).
 * Kanonik JSON: anahtarlar sıralı, boşluksuz — aynı içerik her zaman aynı bayt.
 */
export const GENESIS_HASH = '0'.repeat(64);

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export interface HashInput {
  prevHash: string;
  kind: string;
  payload: unknown;
  occurredAt: Date;
}

export function computeEvidenceHash(i: HashInput): string {
  return createHash('sha256')
    .update(i.prevHash)
    .update('|')
    .update(i.kind)
    .update('|')
    .update(canonicalJson(i.payload))
    .update('|')
    .update(i.occurredAt.toISOString())
    .digest('hex');
}

export interface ChainEvent {
  seq: number;
  kind: string;
  payload: unknown;
  occurredAt: Date;
  prevHash: string;
  hash: string;
}

export interface ChainVerdict {
  ok: boolean;
  checked: number;
  /** Kopuk ilk seq (ok=false ise) */
  brokenAt: number | null;
}

/** Sıralı olay listesini yeniden hesaplayarak doğrular. */
export function verifyChain(events: readonly ChainEvent[], startPrevHash = GENESIS_HASH): ChainVerdict {
  let prev = startPrevHash;
  let expectedSeq = events[0]?.seq ?? 1;
  for (const e of events) {
    if (e.seq !== expectedSeq || e.prevHash !== prev) return { ok: false, checked: e.seq, brokenAt: e.seq };
    const h = computeEvidenceHash({ prevHash: e.prevHash, kind: e.kind, payload: e.payload, occurredAt: e.occurredAt });
    if (h !== e.hash) return { ok: false, checked: e.seq, brokenAt: e.seq };
    prev = e.hash;
    expectedSeq++;
  }
  return { ok: true, checked: events.length, brokenAt: null };
}
