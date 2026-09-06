import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileInputs, splitSecrets, blueprintManifestSchema } from './blueprint-compiler.js';

const inputs = {
  properties: {
    domain: { type: 'string' as const, title_tr: 'Alan adı', format: 'hostname' as const },
    admin_email: { type: 'string' as const, title_tr: 'Yönetici e-postası', format: 'email' as const },
    disk_gb: { type: 'integer' as const, title_tr: 'Disk', minimum: 20, maximum: 500, default: 50 },
    admin_password: { type: 'string' as const, title_tr: 'Yönetici parolası', minLength: 12, secret: true },
    public_signup: { type: 'boolean' as const, title_tr: 'Açık kayıt', default: false },
    tier: { type: 'string' as const, title_tr: 'Kademe', enum: ['basic', 'plus'] },
  },
  required: ['domain', 'admin_email', 'admin_password'],
};

test('derleyici: geçerli girdi geçer, varsayılanlar dolar, boolean form değeri dönüşür', () => {
  const r = compileInputs(inputs).parse({ domain: 'nc.aksu.com.tr', admin_email: 'a@b.co', admin_password: 'çok-uzun-parola-12', public_signup: 'on' });
  assert.equal(r['disk_gb'], 50);
  assert.equal(r['public_signup'], true);
  assert.equal(r['tier'], undefined);
});

test('derleyici: hostname/email/min/enum/strict ihlalleri yakalanır', () => {
  const s = compileInputs(inputs);
  assert.equal(s.safeParse({ domain: 'boşluk var', admin_email: 'a@b.co', admin_password: 'çok-uzun-parola-12' }).success, false);
  assert.equal(s.safeParse({ domain: 'a.co', admin_email: 'x', admin_password: 'çok-uzun-parola-12' }).success, false);
  assert.equal(s.safeParse({ domain: 'a.co', admin_email: 'a@b.co', admin_password: 'kısa' }).success, false);
  assert.equal(s.safeParse({ domain: 'a.co', admin_email: 'a@b.co', admin_password: 'çok-uzun-parola-12', disk_gb: 10 }).success, false);
  assert.equal(s.safeParse({ domain: 'a.co', admin_email: 'a@b.co', admin_password: 'çok-uzun-parola-12', tier: 'pro' }).success, false);
  assert.equal(s.safeParse({ domain: 'a.co', admin_email: 'a@b.co', admin_password: 'çok-uzun-parola-12', bilinmeyen: 1 }).success, false);
});

test('splitSecrets: sır alanları ayrılır, plain DB\'ye gider', () => {
  const { plain, secrets } = splitSecrets(inputs, { domain: 'a.co', admin_password: 'gizli-gizli-gizli' });
  assert.deepEqual(Object.keys(secrets), ['admin_password']);
  assert.equal('admin_password' in plain, false);
});

test('manifest şeması: semver ve en az bir boyut zorunlu', () => {
  const base = { slug: 'x', version: '1.0.0', layer: 3, title_tr: 'Mock', summary_tr: 'Test blueprint', product_slug: 'mock', residencies: ['TR'], providers: ['mock'], sizes: [{ code: 'S', title_tr: 'S', vars: {} }] };
  assert.equal(blueprintManifestSchema.safeParse(base).success, true);
  assert.equal(blueprintManifestSchema.safeParse({ ...base, version: '1.0' }).success, false);
  assert.equal(blueprintManifestSchema.safeParse({ ...base, sizes: [] }).success, false);
});
