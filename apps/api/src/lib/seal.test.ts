import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import * as sealModule from './seal.js';

test('seal: çıktı düz metni içermez ve biçim doğrulanır', () => {
  const kp = generateKeyPairSync('x25519');
  const pubHex = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const blob = sealModule.seal('hcloud-token-ÇOK-GİZLİ', pubHex);
  assert.equal(sealModule.isSealed(blob), true);
  assert.equal(Buffer.from(blob, 'base64').includes(Buffer.from('GİZLİ')), false);
  // Aynı metin iki kez → farklı zarf (efemeral anahtar + iv)
  assert.notEqual(blob, sealModule.seal('hcloud-token-ÇOK-GİZLİ', pubHex));
});

test('seal: API modülünde çözme fonksiyonu YOK (D12 — yalnız runner açar)', () => {
  const names = Object.keys(sealModule);
  assert.ok(!names.some((n) => /unseal|decrypt|open/i.test(n)), `beklenmeyen export: ${names.join(',')}`);
});
