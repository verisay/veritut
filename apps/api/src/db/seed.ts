import { sql } from 'drizzle-orm';
import { db, closeDb } from './db.js';
import { providers, components, tenants } from './schema/index.js';

/**
 * İdempotent seed (K0): tedarikçiler, platform bileşenleri (status sayfası), `internal` kiracı.
 * Personel/kullanıcı satırları Keycloak'tan ilk girişte yansır (seed'de parola yok — D6).
 */
async function main(): Promise<void> {
  await db
    .insert(providers)
    .values([
      { code: 'hetzner', name: 'Hetzner', partnerStatus: 'reseller-tolerant' },
      { code: 'aws', name: 'Amazon Web Services', partnerStatus: 'application-pending' },
      { code: 'gcp', name: 'Google Cloud', partnerStatus: 'application-pending' },
      { code: 'cloudflare', name: 'Cloudflare', partnerStatus: 'none' },
      { code: 'trdc', name: 'Türkiye veri merkezi (kolokasyon)', partnerStatus: 'none', active: false },
      { code: 'mock', name: 'Mock (dev/test)', partnerStatus: 'n/a' },
    ])
    .onConflictDoNothing();

  await db
    .insert(tenants)
    .values({ slug: 'veritut', name: 'VERITUT (iç kiracı)', kind: 'internal', residencyDefault: 'EU' })
    .onConflictDoNothing();

  // Platform bileşenleri — worker probe eder, status app gösterir (D14).
  const platform = [
    { slug: 'api', name: 'API', probeUrl: 'http://veritut-api:4400/api/v1/health', sort: 10 },
    { slug: 'portal', name: 'Müşteri portalı', probeUrl: 'http://veritut-portal:5240/', sort: 20 },
    { slug: 'ops', name: 'Operasyon paneli', probeUrl: 'http://veritut-ops:5241/giris', sort: 30 },
    { slug: 'kimlik', name: 'Kimlik (SSO)', probeUrl: 'http://veritut-keycloak:8080/realms/veritut-musteri', sort: 40 },
    { slug: 'runner', name: 'Provizyon kuyruğu', probeUrl: null, sort: 50 },
  ];
  for (const c of platform) {
    await db.execute(sql`
      INSERT INTO components (tenant_id, slug, name, probe_url, sort)
      VALUES (NULL, ${c.slug}, ${c.name}, ${c.probeUrl}, ${c.sort})
      ON CONFLICT (slug) WHERE tenant_id IS NULL DO UPDATE SET name = EXCLUDED.name, probe_url = EXCLUDED.probe_url, sort = EXCLUDED.sort
    `);
  }
  void components;
  console.log('seed tamam: 6 tedarikçi, iç kiracı, 5 platform bileşeni');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
