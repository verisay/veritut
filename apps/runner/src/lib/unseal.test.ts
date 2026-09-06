import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, createPublicKey } from 'node:crypto';
import { loadRunnerKey, unseal } from './unseal.js';

/** Test yardımcısı: API'nin seal.ts algoritmasını yeniden uygular (çapraz-app import yok). */
function sealLike(plain: string, runnerPubRaw: Buffer): string {
  const eph = generateKeyPairSync('x25519');
  const ephPubRaw = eph.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const runnerPub = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), runnerPubRaw]), format: 'der', type: 'spki' });
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: runnerPub });
  const key = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.concat([Buffer.from('veritut-seal-v1'), ephPubRaw, runnerPubRaw]), 32));
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.concat([Buffer.from([1]), ephPubRaw]));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from([1]), ephPubRaw, iv, c.getAuthTag(), ct]).toString('base64');
}

test('unseal: runner özel anahtarıyla açılır, başka anahtarla açılmaz', () => {
  const kp = generateKeyPairSync('x25519');
  const privHex = kp.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex');
  const key = loadRunnerKey(privHex);
  const blob = sealLike('hcloud-token-XYZ', key.publicRaw);
  assert.equal(unseal(blob, key).toString('utf8'), 'hcloud-token-XYZ');

  const other = generateKeyPairSync('x25519');
  const otherKey = loadRunnerKey(other.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex'));
  assert.throws(() => unseal(blob, otherKey));
});

test('unseal: kurcalanmış zarf reddedilir (GCM tag)', () => {
  const kp = generateKeyPairSync('x25519');
  const key = loadRunnerKey(kp.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex'));
  const b = Buffer.from(sealLike('gizli', key.publicRaw), 'base64');
  b[b.length - 1] = b[b.length - 1]! ^ 0xff;
  assert.throws(() => unseal(b.toString('base64'), key));
});
