import { sql } from 'drizzle-orm';
import { db, closeDb } from './db.js';
import { providers, components, tenants } from './schema/index.js';
import { seedK3 } from './seed-k3.js';

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
  // Probe adresleri ORTAMDAN gelir: dev'de compose alias'ları, prod'da 127.0.0.1 portları.
  const apiBase = process.env.API_URL ?? 'http://veritut-api:4400';
  const portalBase = process.env.PORTAL_INTERNAL_URL ?? 'http://veritut-portal:5240';
  const opsBase = process.env.OPS_INTERNAL_URL ?? 'http://veritut-ops:5241';
  const kcBase = process.env.KC_INTERNAL_URL ?? 'http://veritut-keycloak:8080';
  const platform = [
    { slug: 'api', name: 'API', probeUrl: `${apiBase}/api/v1/health`, sort: 10 },
    { slug: 'portal', name: 'Müşteri portalı', probeUrl: `${portalBase}/`, sort: 20 },
    { slug: 'ops', name: 'Operasyon paneli', probeUrl: `${opsBase}/giris`, sort: 30 },
    { slug: 'kimlik', name: 'Kimlik (SSO)', probeUrl: `${kcBase}/realms/veritut-musteri`, sort: 40 },
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
  await seedK3();
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
