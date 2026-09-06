import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, computeEvidenceHash, verifyChain, GENESIS_HASH, type ChainEvent } from './evidence-hash.js';

function build(n: number): ChainEvent[] {
  const out: ChainEvent[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= n; i++) {
    const occurredAt = new Date(Date.UTC(2026, 8, i, 3, 0, 0));
    const payload = { snapshot: `s${i}`, bytes: i * 1000 };
    const hash = computeEvidenceHash({ prevHash: prev, kind: 'backup.completed', payload, occurredAt });
    out.push({ seq: i, kind: 'backup.completed', payload, occurredAt, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

test('kanonik JSON anahtar sırasından bağımsız', () => {
  assert.equal(canonicalJson({ b: 1, a: [3, { z: 1, y: 2 }] }), canonicalJson({ a: [3, { y: 2, z: 1 }], b: 1 }));
});

test('zincir bütün → ok', () => {
  const v = verifyChain(build(5));
  assert.deepEqual(v, { ok: true, checked: 5, brokenAt: null });
});

test('payload kurcalanırsa zincir o seq\'te kopar', () => {
  const ev = build(5);
  (ev[2]!.payload as { bytes: number }).bytes = 999999;
  const v = verifyChain(ev);
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 3);
});

test('araya olay eklenirse/silinirse seq ve prev_hash yakalar', () => {
  const ev = build(5);
  ev.splice(1, 1);
  assert.equal(verifyChain(ev).ok, false);
});
