import { sql } from 'drizzle-orm';
import { db } from './db.js';
import { addons, businessCalendar, plans, priceList, productVersions, products, slaTiers } from './schema/index.js';

/**
 * K3 katalog seed'i (idempotent): planlar, SLA katmanları, ürünler, ürün sürümleri, fiyat listesi.
 * Fiyatlar TRY; taban aylık × plan çarpanı × (1 + SLA uplift) × ikametgâh katsayısı.
 */
const PLANS = [
  { code: 'free', title: 'Ücretsiz', summary: 'Yalnız hesap ve keşif. İş yükü açmak için bir plan seçin.', sort: 10, features: { 'workloads.max': 0, 'users.max': 2, 'api.enabled': false, 'api.keys.max': 0, 'backup.offsite': false, 'backup.drill.monthly': false, 'evidence.bundle': false, 'status.tenant_page': false, 'support.priority': false, finops: false, 'sla.tiers': ['std_9x5'] } },
  { code: 'baslangic', title: 'Başlangıç', summary: 'Küçük ekipler: 3 iş yükü, 9x5 destek, offsite yedek ve kanıt defteri.', sort: 20, features: { 'workloads.max': 3, 'users.max': 5, 'api.enabled': true, 'api.keys.max': 2, 'backup.offsite': true, 'backup.drill.monthly': false, 'evidence.bundle': false, 'status.tenant_page': true, 'support.priority': false, finops: false, 'sla.tiers': ['std_9x5'] } },
  { code: 'profesyonel', title: 'Profesyonel', summary: '7x24 seçeneği, aylık geri dönüş tatbikatı, aylık kanıt paketi, öncelikli destek.', sort: 30, features: { 'workloads.max': 15, 'users.max': 20, 'api.enabled': true, 'api.keys.max': 10, 'backup.offsite': true, 'backup.drill.monthly': true, 'evidence.bundle': true, 'status.tenant_page': true, 'support.priority': true, finops: false, 'sla.tiers': ['std_9x5', 'crit_24x7'] } },
  { code: 'kurumsal', title: 'Kurumsal', summary: 'Sınırsız iş yükü, FinOps, özel yanıt süresi ve denetim desteği.', sort: 40, features: { 'workloads.max': -1, 'users.max': -1, 'api.enabled': true, 'api.keys.max': -1, 'backup.offsite': true, 'backup.drill.monthly': true, 'evidence.bundle': true, 'status.tenant_page': true, 'support.priority': true, finops: true, 'sla.tiers': ['std_9x5', 'crit_24x7'] } },
];

const SLA = [
  { code: 'std_9x5', title: 'Standart 9x5', coverage: '9x5', responseMin: 240, resolveMin: 1440, uptimeTarget: '99.50', monthlyUpliftPct: '0', sort: 10 },
  { code: 'crit_24x7', title: 'Kritik 7x24', coverage: '24x7', responseMin: 30, resolveMin: 480, uptimeTarget: '99.90', monthlyUpliftPct: '40', sort: 20 },
];

/** Ürün → blueprint eşlemesi + taban fiyat (TRY/ay, S boyutu). */
const PRODUCTS = [
  {
    slug: 'managed-vps', layer: 2, title: 'Yönetilen sunucu', blueprintSlug: 'managed-vps', base: 1400,
    summary: 'Sertleştirilmiş Docker host: yama, izleme, ufw/fail2ban, 3-2-1 yedek ve aylık geri dönüş kanıtı.',
    seoTitle: 'Yönetilen Sunucu — VERITUT', seoDescription: 'Sunucunuzu biz kurar, yamalar, izler ve yedekleriz. Geri döndüğünü kanıtlarız.',
    bodyMd: '## Sunucu değil, sorumluluk\n\nSunucuyu Hetzner\'den siz de alabilirsiniz. Alamadığınız şey, gece üçte kimin müdahale edeceği ve denetimde belgeyi kimin vereceğidir.\n\n- Kurulum kod olarak, elle müdahale yok\n- Güvenlik yamaları otomatik, değişiklikler kayıtlı\n- 3-2-1 yedek: offsite kopya farklı tedarikçide\n- Her yedek ve her erişim kanıt defterinize düşer',
    faq: [{ q: 'Root erişimi bende mi?', a: 'Evet. SSH anahtarınızla girersiniz; parola girişi kapalıdır. Bizim erişimlerimiz portalınızda görünür.' }, { q: 'Yedeğin geri döndüğünü nasıl biliyorum?', a: 'Ayda bir geri dönüş tatbikatı yapar, sonucu kanıt defterinize yazarız.' }],
    compare: [{ rival: 'kendi sunucum', title: 'Yönetilen sunucu ile kendi sunucunuz', summary: 'Aynı donanım, farklı sorumluluk. Yama, yedek, izleme ve nöbet bizde.' }],
  },
  {
    slug: 'n8n', layer: 3, title: 'Yönetilen n8n', blueprintSlug: 'n8n', base: 1900,
    summary: 'Otomasyon akışlarınız; kurulum, güncelleme, TLS, SSO ve yedek bizde.',
    seoTitle: 'Yönetilen n8n — Türkiye ve AB ikametgâhı', seoDescription: 'n8n lisansı ücretsiz. Sunucu, kurulum, güncelleme, yedek ve destek VERITUT\'ta.',
    bodyMd: '## Akış sizin, işletim bizim\n\nn8n açık kaynaktır ve lisansı ücretsizdir. Ücretli olan sunucu, kurulum, güncelleme, yedek ve destektir.\n\n- VERITUT hesabınızla tek oturum açma\n- Verinizin duracağı ülkeyi siz seçersiniz\n- Sürüm yükseltmeleri planlı ve geri alınabilir',
    faq: [{ q: 'Sürüm yükseltmelerini kim yapıyor?', a: 'Biz. Planlı bakım penceresinde, öncesinde yedek alarak.' }, { q: 'Akışlarımı dışa aktarabilir miyim?', a: 'Her zaman. Ayrılırsanız verinizi ve yedeklerinizi paket hâlinde veririz.' }],
    compare: [{ rival: 'zapier', title: 'n8n ile Zapier', summary: 'Adım başına ücret yok, veri sizin sunucunuzda, ikametgâh seçilebilir.' }],
  },
  {
    slug: 'nextcloud', layer: 3, title: 'Yönetilen Nextcloud', blueprintSlug: 'nextcloud', base: 2400,
    summary: 'Kurumsal dosya paylaşımı: PostgreSQL, Redis, TLS, SSO ve gece yedeği.',
    seoTitle: 'Yönetilen Nextcloud — KVKK uyumlu dosya paylaşımı', seoDescription: 'Dosyalarınız Türkiye\'de veya AB\'de. Kurulum, güncelleme, yedek ve destek dahil.',
    bodyMd: '## Dosyalarınız, sizin seçtiğiniz ülkede\n\nNextcloud ile ekip dosyalarınızı kendi alanınızda tutarsınız.\n\n- Veritabanı dökümü yedeğe dahil\n- VERITUT hesabıyla tek oturum açma\n- Alt işleyen listeniz otomatik güncellenir',
    faq: [{ q: 'KVKK açısından ne veriyorsunuz?', a: 'Veri işleme sözleşmesi, güncel alt işleyen listesi ve aylık kanıt paketi.' }],
    compare: [{ rival: 'google-drive', title: 'Nextcloud ile Google Drive', summary: 'Veri ikametgâhı seçilebilir, kullanıcı başına ücret yok, denetim kanıtı verilir.' }],
  },
  {
    slug: 'zammad', layer: 3, title: 'Yönetilen Zammad', blueprintSlug: 'zammad', base: 2900,
    summary: 'Destek masası: e-posta kanalı, SSO, arama motoru ve yedek dahil.',
    seoTitle: 'Yönetilen Zammad destek masası', seoDescription: 'Zammad kurulumu, güncellemesi ve yedeği VERITUT\'ta. Biz de kendi destek masamızda kullanıyoruz.',
    bodyMd: '## Kendi kullandığımız ürünü satıyoruz\n\nVERITUT destek masası Zammad üzerinde çalışır. Sizin kurulumunuz da aynı blueprint ile açılır.',
    faq: [{ q: 'E-posta kanalı kuruluyor mu?', a: 'Evet, alan adınızın posta ayarlarıyla birlikte kuruyoruz.' }],
    compare: [{ rival: 'zendesk', title: 'Zammad ile Zendesk', summary: 'Ajan başına lisans yok; veri sizin ikametgâhınızda, dışa aktarım her zaman mümkün.' }],
  },
  {
    slug: 'mock-vps', layer: 2, title: 'Test iş yükü (dev)', blueprintSlug: 'mock-vps', base: 100,
    summary: 'Yalnız geliştirme ortamı: gerçek kaynak açmaz, boru hattını doğrular.',
    seoTitle: null, seoDescription: null, bodyMd: 'Geliştirme amaçlıdır.', faq: [], compare: [],
  },
];

const PLAN_FACTOR: Record<string, number> = { free: 1, baslangic: 1, profesyonel: 1.25, kurumsal: 1.6 };
const SIZE_FACTOR: Record<string, number> = { S: 1, M: 2, L: 4 };
const RESIDENCY_FACTOR: Record<string, number> = { TR: 1.1, EU: 1, US: 1.05 };

/**
 * TR resmî tatilleri — SLA 9x5 saatinde iş günü hesabı için (plan §8.2).
 * Sabit tarihliler yıllık üretilir; dini bayramlar (hicri) elle listelenir.
 */
const RELIGIOUS_HOLIDAYS = [
  ['2026-03-19', 'Ramazan Bayramı Arifesi', true],
  ['2026-03-20', 'Ramazan Bayramı 1. Gün'],
  ['2026-03-21', 'Ramazan Bayramı 2. Gün'],
  ['2026-03-22', 'Ramazan Bayramı 3. Gün'],
  ['2026-05-26', 'Kurban Bayramı Arifesi', true],
  ['2026-05-27', 'Kurban Bayramı 1. Gün'],
  ['2026-05-28', 'Kurban Bayramı 2. Gün'],
  ['2026-05-29', 'Kurban Bayramı 3. Gün'],
  ['2026-05-30', 'Kurban Bayramı 4. Gün'],
  ['2027-03-09', 'Ramazan Bayramı Arifesi', true],
  ['2027-03-10', 'Ramazan Bayramı 1. Gün'],
  ['2027-03-11', 'Ramazan Bayramı 2. Gün'],
  ['2027-03-12', 'Ramazan Bayramı 3. Gün'],
  ['2027-05-16', 'Kurban Bayramı Arifesi', true],
  ['2027-05-17', 'Kurban Bayramı 1. Gün'],
  ['2027-05-18', 'Kurban Bayramı 2. Gün'],
  ['2027-05-19', 'Kurban Bayramı 3. Gün'],
  ['2027-05-20', 'Kurban Bayramı 4. Gün'],
] as const;

const FIXED_HOLIDAYS: Array<[string, string]> = [
  ['01-01', 'Yılbaşı'],
  ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'],
  ['05-01', 'Emek ve Dayanışma Günü'],
  ['05-19', 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı'],
  ['07-15', 'Demokrasi ve Millî Birlik Günü'],
  ['08-30', 'Zafer Bayramı'],
  ['10-28', 'Cumhuriyet Bayramı Arifesi'],
  ['10-29', 'Cumhuriyet Bayramı'],
];

async function seedCalendar(): Promise<number> {
  const rows: Array<{ day: string; title: string; halfDay: boolean }> = [];
  for (const year of [2026, 2027, 2028]) for (const [md, title] of FIXED_HOLIDAYS) rows.push({ day: `${year}-${md}`, title, halfDay: md === '10-28' });
  for (const h of RELIGIOUS_HOLIDAYS) rows.push({ day: h[0], title: h[1], halfDay: Boolean(h[2]) });
  for (const r of rows) await db.insert(businessCalendar).values(r).onConflictDoNothing();
  return rows.length;
}

export async function seedK3(): Promise<void> {
  for (const p of PLANS) await db.insert(plans).values(p).onConflictDoUpdate({ target: plans.code, set: { title: p.title, summary: p.summary, features: p.features, sort: p.sort, active: true } });
  for (const s of SLA) await db.insert(slaTiers).values(s).onConflictDoUpdate({ target: slaTiers.code, set: { ...s, active: true } });
  await db
    .insert(addons)
    .values([
      { code: 'storage_gb', title: 'Ek depolama', unit: 'GB/ay', currency: 'TRY', unitPrice: '4.5000' },
      { code: 'traffic_gb', title: 'Aşım trafiği', unit: 'GB', currency: 'TRY', unitPrice: '1.2000' },
      { code: 'backup_gb', title: 'Yedek alanı', unit: 'GB/ay', currency: 'TRY', unitPrice: '2.8000' },
    ])
    .onConflictDoNothing();

  const validFrom = '2026-01-01';
  for (const p of PRODUCTS) {
    await db
      .insert(products)
      .values({ slug: p.slug, layer: p.layer, title: p.title, summary: p.summary, blueprintSlug: p.blueprintSlug, seoTitle: p.seoTitle, seoDescription: p.seoDescription, bodyMd: p.bodyMd, faq: p.faq, compare: p.compare, active: p.slug !== 'mock-vps', sort: p.layer * 100 })
      .onConflictDoUpdate({ target: products.slug, set: { title: p.title, summary: p.summary, blueprintSlug: p.blueprintSlug, seoTitle: p.seoTitle, seoDescription: p.seoDescription, bodyMd: p.bodyMd, faq: p.faq, compare: p.compare } });
    await db.insert(productVersions).values({ productSlug: p.slug, blueprintVersion: '1.0.0', status: 'published', releasedAt: new Date(), notes: 'seed' }).onConflictDoNothing();
    const sizes = p.slug === 'managed-vps' || p.slug === 'mock-vps' ? ['S', 'M', 'L'] : p.slug === 'n8n' ? ['S', 'M'] : ['M', 'L'];
    const residencies = p.slug === 'mock-vps' ? ['TR', 'EU', 'US'] : ['EU', 'US'];
    for (const size of sizes)
      for (const residency of residencies)
        for (const plan of PLANS.filter((x) => x.code !== 'free'))
          for (const sla of SLA) {
            if (!(plan.features['sla.tiers'] as string[]).includes(sla.code)) continue;
            const monthly = Math.round(p.base * (SIZE_FACTOR[size] ?? 1) * (PLAN_FACTOR[plan.code] ?? 1) * (RESIDENCY_FACTOR[residency] ?? 1) * (1 + Number(sla.monthlyUpliftPct) / 100));
            const setupFee = plan.code === 'kurumsal' ? 0 : Math.round(monthly * 0.5);
            await db
              .insert(priceList)
              .values({ productSlug: p.slug, size, residency, planCode: plan.code, slaCode: sla.code, currency: 'TRY', monthly: String(monthly), setupFee: String(setupFee), validFrom })
              .onConflictDoUpdate({ target: [priceList.productSlug, priceList.size, priceList.residency, priceList.planCode, priceList.slaCode, priceList.currency, priceList.validFrom], set: { monthly: String(monthly), setupFee: String(setupFee) } });
          }
  }
  const rows = (await db.execute(sql`SELECT count(*)::int AS n FROM price_list`)).rows as Array<{ n: number }>;
  const cal = await seedCalendar();
  console.log(`K3 seed: ${PLANS.length} plan, ${SLA.length} SLA, ${PRODUCTS.length} ürün, ${rows[0]?.n ?? 0} fiyat satırı, ${cal} tatil günü`);
}
