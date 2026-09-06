#!/usr/bin/env node
// Dev realm JSON'larından PROD realm JSON'ları üretir (D6).
//   DOMAIN=veritut.com node infra/prod/render-realms.mjs <çıkış-dizini>
// Farklar: prod host'ları, üretilmiş istemci sırları, dev kullanıcıları YOK,
// ops realm'inde TOTP zorunlu (B8), sslRequired=all.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const DOMAIN = process.env.DOMAIN ?? 'veritut.com';
const OUT = process.argv[2] ?? '/etc/veritut/realms';
const SRC = process.env.REALM_SRC ?? path.resolve('infra/keycloak/realms');
const secrets = {
  portal: process.env.OIDC_MUSTERI_CLIENT_SECRET,
  ops: process.env.OIDC_OPS_CLIENT_SECRET,
};
const hosts = { portal: `https://${DOMAIN}`, ops: `https://ops.${DOMAIN}` };

mkdirSync(OUT, { recursive: true });
for (const realm of ['veritut-musteri', 'veritut-ops']) {
  const d = JSON.parse(readFileSync(path.join(SRC, `${realm}.json`), 'utf8'));

  // Dev kullanıcıları prod'a taşınmaz — personel/müşteri hesapları ayrı akışla açılır.
  delete d.users;
  d.sslRequired = 'all';

  for (const c of d.clients ?? []) {
    const base = hosts[c.clientId];
    if (!base) continue;
    const secret = secrets[c.clientId];
    if (!secret) throw new Error(`${c.clientId} için istemci sırrı env'de yok`);
    c.secret = secret;
    c.redirectUris = [`${base}/api/v1/auth/callback`];
    c.webOrigins = [base];
    c.attributes = { ...(c.attributes ?? {}), 'post.logout.redirect.uris': `${base}/*` };
  }

  if (realm === 'veritut-ops') {
    // B8: personel realm'inde TOTP zorunlu — her yeni personel ilk girişte kurar.
    d.requiredActions = [
      { alias: 'CONFIGURE_TOTP', name: 'Configure OTP', providerId: 'CONFIGURE_TOTP', enabled: true, defaultAction: true, priority: 10, config: {} },
      { alias: 'UPDATE_PASSWORD', name: 'Update Password', providerId: 'UPDATE_PASSWORD', enabled: true, defaultAction: false, priority: 30, config: {} },
    ];
    d.otpPolicyType = 'totp';
    d.bruteForceProtected = true;
  }

  const file = path.join(OUT, `${realm}.json`);
  writeFileSync(file, JSON.stringify(d, null, 2) + '\n', { mode: 0o600 });
  console.log(`yazıldı: ${file}`);
}
