import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Asimetrik mühür (D12) — API bu dosyayla YALNIZ mühürler; çözme fonksiyonu API'de YOKTUR.
 * Biçim (base64): ver(1) ‖ eph_pub(32) ‖ iv(12) ‖ tag(16) ‖ ciphertext
 *  - Efemeral X25519 çifti üret; shared = DH(eph_priv, runner_pub)
 *  - key = HKDF-SHA256(shared, salt=∅, info='veritut-seal-v1' ‖ eph_pub ‖ runner_pub, 32)
 *  - AES-256-GCM(key, iv) — AAD = ver ‖ eph_pub
 * Runner tarafı: apps/runner/src/lib/unseal.ts (aynı türetme, DH(runner_priv, eph_pub)).
 */
export const SEAL_VERSION = 1;
const INFO = Buffer.from('veritut-seal-v1');

function x25519PublicKeyFromRaw(rawHex: string) {
  const raw = Buffer.from(rawHex, 'hex');
  if (raw.length !== 32) throw new Error('X25519 açık anahtar 32 bayt olmalı');
  // SPKI DER önek: X25519 OID (RFC 8410) + BIT STRING
  const prefix = Buffer.from('302a300506032b656e032100', 'hex');
  return createPublicKey({ key: Buffer.concat([prefix, raw]), format: 'der', type: 'spki' });
}

export function seal(plaintext: string | Buffer, runnerPublicKeyHex: string): string {
  const runnerPub = x25519PublicKeyFromRaw(runnerPublicKeyHex);
  const eph = generateKeyPairSync('x25519');
  const ephPubRaw = eph.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: runnerPub });
  const key = Buffer.from(
    hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.concat([INFO, ephPubRaw, Buffer.from(runnerPublicKeyHex, 'hex')]), 32),
  );
  const iv = randomBytes(12);
  const ver = Buffer.from([SEAL_VERSION]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.concat([ver, ephPubRaw]));
  const ct = Buffer.concat([cipher.update(typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ver, ephPubRaw, iv, tag, ct]).toString('base64');
}

/** Mühür biçimi denetimi (çözmez): sürüm + uzunluk. */
export function isSealed(blob: string): boolean {
  const b = Buffer.from(blob, 'base64');
  return b.length > 1 + 32 + 12 + 16 && b[0] === SEAL_VERSION;
}
