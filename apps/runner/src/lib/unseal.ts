import { createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, hkdfSync } from 'node:crypto';

/**
 * Mühür açma (D12) — YALNIZ runner'da. Biçim apps/api/src/lib/seal.ts ile birebir:
 * ver(1) ‖ eph_pub(32) ‖ iv(12) ‖ tag(16) ‖ ct ; key = HKDF(DH(runner_priv, eph_pub), info='veritut-seal-v1'‖eph_pub‖runner_pub)
 */
const INFO = Buffer.from('veritut-seal-v1');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');

export interface RunnerKey {
  privateKey: ReturnType<typeof createPrivateKey>;
  publicRaw: Buffer;
}

export function loadRunnerKey(privateHex: string): RunnerKey {
  const raw = Buffer.from(privateHex, 'hex');
  if (raw.length !== 32) throw new Error('RUNNER_PRIVATE_KEY 32 bayt hex olmalı');
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' });
  const publicRaw = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { privateKey, publicRaw: Buffer.from(publicRaw) };
}

export function unseal(blob: string, key: RunnerKey): Buffer {
  const b = Buffer.from(blob, 'base64');
  if (b.length < 1 + 32 + 12 + 16 || b[0] !== 1) throw new Error('mühür biçimi geçersiz');
  const ver = b.subarray(0, 1);
  const ephPubRaw = b.subarray(1, 33);
  const iv = b.subarray(33, 45);
  const tag = b.subarray(45, 61);
  const ct = b.subarray(61);
  const ephPub = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, ephPubRaw]), format: 'der', type: 'spki' });
  const shared = diffieHellman({ privateKey: key.privateKey, publicKey: ephPub });
  const k = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.concat([INFO, ephPubRaw, key.publicRaw]), 32));
  const d = createDecipheriv('aes-256-gcm', k, iv);
  d.setAAD(Buffer.concat([ver, ephPubRaw]));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}
