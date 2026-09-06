#!/usr/bin/env node
// Runner X25519 anahtar çifti üretir (D12). Özel anahtar YALNIZ runner'a, açık anahtar API'ye.
//   node tools/gen-runner-keys.mjs            → iki satır: RUNNER_PUBLIC_KEY / RUNNER_PRIVATE_KEY (hex)
// Değeri sohbete/loga yazdırmayın; doğrudan infra/.env'e veya prod'da /etc/veritut/runner.key'e taşıyın.
import { generateKeyPairSync } from 'node:crypto';
const kp = generateKeyPairSync('x25519');
const pub = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const priv = kp.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex');
console.log(`RUNNER_PUBLIC_KEY=${pub}`);
console.log(`RUNNER_PRIVATE_KEY=${priv}`);
