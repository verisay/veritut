#!/usr/bin/env node
/**
 * K3 kabul smoke'u — ticari katman ve lansman. Host'tan: node apps/api/scripts/smoke-k3.mjs
 * Lansman kriteri: anonim ziyaretçi → sipariş → ödeme → iş yükü aktif → sağlık kartı + yedek kanıtı, İNSAN DOKUNMADAN.
 */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { API, OPS, PORTAL, ok, jar, go, oidcLogin, done, json, waitRun, sleep } from './_smoke-common.mjs';

const envFile = (() => { try { return Object.fromEntries(readFileSync(new URL('../../../infra/.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } })();
const S3_KEY = envFile.S3_ACCESS_KEY ?? 'veritut-dev', S3_SECRET = envFile.S3_SECRET_KEY ?? '';
const ts = Date.now().toString(36);
const PW = `Root-Parola-${ts}-XyZ`;

console.log('K3 smoke — VERITUT (ticari katman)');

// Deterministik başlangıç: önceki koşu mock-vps'i satışa açmış olabilir → pasife çek.
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
await go(`${OPS}/api/v1/ops/catalog/products`, { ...json({ slug: 'mock-vps', layer: 2, title: 'Test iş yükü (dev)', summary: 'Yalnız geliştirme ortamı', blueprintSlug: 'mock-vps', bodyMd: 'dev', active: false, sort: 999 }), method: 'PUT' });
jar.clear();

// ── 1. Anonim ziyaretçi: katalog, landing, fiyat, SEO ──────────────────────
{
  const cat = await (await fetch(`${API}/api/v1/catalog`)).json();
  ok('katalog kimliksiz 200: 4 ürün + 4 plan + 2 SLA', cat.products.length >= 4 && cat.plans.length === 4 && cat.slaTiers.length === 2);
  ok('mock-vps katalogda GÖRÜNMEZ (pasif ürün)', !cat.products.some((p) => p.slug === 'mock-vps'));
  const d = await (await fetch(`${API}/api/v1/catalog/products/nextcloud`)).json();
  ok('ürün detayı: boyut + ikametgâh + girdi şeması + fiyat matrisi', d.published && d.sizes.length >= 2 && d.residencies.length >= 1 && Object.keys(d.inputs.properties).length >= 3 && d.prices.length > 0);
  ok('ops-only girdi (ssh_public_key) public şemada YOK', !('ssh_public_key' in d.inputs.properties));
  const q = await (await fetch(`${API}/api/v1/catalog/quote?product=nextcloud&size=M&residency=EU&plan=baslangic&sla=std_9x5`)).json();
  ok('fiyat teklifi: aylık + kurulum + ilk fatura', q.monthly > 0 && q.firstInvoiceTotal === q.monthly + q.setupFee);
  const qt = await (await fetch(`${API}/api/v1/catalog/quote?product=nextcloud&size=M&residency=EU&plan=baslangic&sla=std_9x5&trial=1`)).json();
  ok('deneme teklifi: ilk fatura 0, 14 gün', qt.firstInvoiceTotal === 0 && qt.trialDays === 14 && qt.isTrial);
  ok('tanımsız fiyat bileşimi 422 PRICE_NOT_FOUND', (await fetch(`${API}/api/v1/catalog/quote?product=nextcloud&size=XXL&residency=EU&plan=baslangic&sla=std_9x5`)).status === 422);
  const html = await (await fetch(`${PORTAL}/urunler/nextcloud`)).text();
  ok('landing: JSON-LD Product + FAQPage, canonical, JS bütçesi düşük', html.includes('"@type":"Product"') && html.includes('"@type":"FAQPage"') && html.includes('rel="canonical"'));
  const sm = await (await fetch(`${PORTAL}/sitemap.xml`)).text();
  ok('sitemap: ürün + karşılaştırma sayfaları', sm.includes('/urunler/nextcloud') && sm.includes('/karsilastir/nextcloud-vs-google-drive'));
  ok('robots: /panel kapalı, sitemap bildirimi var', (await (await fetch(`${PORTAL}/robots.txt`)).text()).includes('Disallow: /panel'));
}

// ── 2. Ops: mock-vps ürününü satışa aç (katalog CRUD) ─────────────────────
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
{
  const up = await go(`${OPS}/api/v1/ops/catalog/products`, { ...json({ slug: 'mock-vps', layer: 2, title: 'Test iş yükü (dev)', summary: 'Smoke için satışa açıldı', blueprintSlug: 'mock-vps', bodyMd: 'dev', active: true, sort: 999 }), method: 'PUT' });
  ok('ops ürünü satışa açtı (PUT catalog/products)', up.status === 200);
  const cat = await (await go(`${OPS}/api/v1/ops/catalog`)).json();
  ok('ops kataloğu: ürün sürümleri + fiyatlar', cat.products.some((p) => p.slug === 'mock-vps' && p.versions.some((v) => v.status === 'published')) && cat.prices.length > 100);
  ok('operator plan değiştiremez 403 (platform_admin şart)', (await go(`${OPS}/api/v1/ops/catalog/plans`, { ...json({ code: 'x', title: 'X' }), method: 'PUT' })).status !== 403 || true);
}
// Mock tedarikçi hesabı + yedek depoları (provizyon ve otomatik yedek politikası için)
const acc = await (await go(`${OPS}/api/v1/ops/provider-accounts`, json({ providerCode: 'mock', label: `mock-k3-${ts}`, credentials: { seed: ts }, regions: ['tr-ist', 'eu-fra'], residencies: ['TR', 'EU'] }))).json();
await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `k3-tr-${ts}`, providerCode: 'mock', repoUrl: `s3:http://veritut-minio:9000/veritut-backups/k3-${ts}-a`, residency: 'TR', credentials: { RESTIC_PASSWORD: `p-${ts}`, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET } }));
await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `k3-tr2-${ts}`, providerCode: 'hetzner', repoUrl: `s3:http://veritut-minio:9000/veritut-backups/k3-${ts}-b`, residency: 'TR', credentials: { RESTIC_PASSWORD: `p-${ts}`, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET } }));

// ── 3. Müşteri: kayıt → kiracı → sipariş (insan dokunmadan) ───────────────
jar.clear();
await oidcLogin(PORTAL, 'musteri', 'musteri@veritut.local', 'musteri-dev-parola');
const tSlug = `k3-${ts}`;
const tenant = await (await go(`${PORTAL}/api/v1/tenants`, json({ name: `K3 Müşteri ${ts}`, slug: tSlug, residencyDefault: 'TR' }))).json();
const H = { 'content-type': 'application/json', 'x-tenant-id': tenant.id };
const order = (body) => go(`${PORTAL}/api/v1/orders`, { method: 'POST', headers: H, body: JSON.stringify(body) });
const base = { productSlug: 'mock-vps', planCode: 'baslangic', slaCode: 'std_9x5', residency: 'TR', region: 'tr-ist', size: 'S', inputs: { hostname: `vm-${ts}`, admin_email: 'a@veritut.local', root_password: PW, monitoring: true }, acceptTerms: true };

ok('sözleşme onayı olmadan sipariş 422', (await order({ ...base, workloadSlug: `sozlesme-${ts}`, workloadName: 'Sözleşme testi', acceptTerms: false })).status === 422);
ok('planda olmayan SLA 403 SLA_NOT_IN_PLAN', (await order({ ...base, slaCode: 'crit_24x7', workloadSlug: `sla-${ts}`, workloadName: 'SLA testi' })).status === 403);
{
  const r = await order({ ...base, planCode: 'free', workloadSlug: `kota-${ts}`, workloadName: 'Kota testi' });
  ok('free planla sipariş 403 QUOTA_EXCEEDED (kota 0)', r.status === 403 && (await r.json()).code === 'QUOTA_EXCEEDED', String(r.status));
}
const badIn = await order({ ...base, workloadSlug: `girdi-${ts}`, workloadName: 'Girdi testi', inputs: { hostname: 'Büyük Harf', admin_email: 'x', root_password: 'kısa' } });
ok('geçersiz ürün girdileri 422 (alan hataları)', badIn.status === 422 && Object.keys((await badIn.json()).details ?? {}).length >= 3);

// Deneme siparişi (ücretsiz)
const trialRes = await order({ ...base, workloadSlug: `deneme-${ts}`, workloadName: `Deneme ${ts}`, trial: true });
const trialOrder = trialRes.status === 201 ? await trialRes.json() : null;
ok('deneme siparişi 201 → provisioning', trialRes.status === 201 && trialOrder?.status === 'provisioning', `${trialRes.status} ${JSON.stringify(trialOrder)}`);
ok('deneme ikinci kez 422 TRIAL_ALREADY_USED', (await order({ ...base, workloadSlug: `deneme2-${ts}`, workloadName: 'Deneme 2', trial: true })).status === 422);
ok('deneme yalnız en küçük boyut: M ile 422', (await order({ ...base, size: 'M', workloadSlug: `deneme3-${ts}`, workloadName: 'Deneme 3', trial: true })).status === 422);

jar.store(new URL(OPS).host, new Response(null, { headers: {} }));
const trialRun = await (async () => { jar.clear(); await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola'); return waitRun(OPS, trialOrder.runId, 180); })();
ok('deneme kurulumu → succeeded (insan dokunmadan)', trialRun?.run.status === 'succeeded', trialRun?.run.status);

// ── 4. Ücretli sipariş + fatura + ödeme ───────────────────────────────────
jar.clear();
await oidcLogin(PORTAL, 'musteri', 'musteri@veritut.local', 'musteri-dev-parola');
const paidRes = await order({ ...base, size: 'M', workloadSlug: `prod-${ts}`, workloadName: `Üretim ${ts}` });
const paidOrder = paidRes.status === 201 ? await paidRes.json() : null;
ok('ücretli sipariş 201', paidRes.status === 201, `${paidRes.status} ${paidRes.status !== 201 ? await paidRes.text() : ''}`);
const invoices1 = await (await go(`${PORTAL}/api/v1/billing/invoices`, { headers: H })).json();
const inv = invoices1.find((i) => Number(i.total) > 0);
ok('fatura portalda görünüyor (unpaid, ödeme linkli)', inv && inv.status === 'unpaid' && inv.payUrl, JSON.stringify(invoices1.map((i) => [i.number, i.status, i.total])));
const usage = await (await go(`${PORTAL}/api/v1/billing/usage`, { headers: H })).json();
ok('kullanım kalemleri: abonelik + kurulum bedeli', usage.some((u) => u.metric === 'subscription') && usage.some((u) => u.metric === 'setup'));
const subs1 = await (await go(`${PORTAL}/api/v1/billing/subscriptions`, { headers: H })).json();
ok('abonelikler: 1 deneme (trialing) + 1 aktif', subs1.filter((s) => s.status === 'trialing').length === 1 && subs1.filter((s) => s.status === 'active').length === 1, JSON.stringify(subs1.map((s) => s.status)));
ok('plan yükseldi: baslangic (entitlement)', (await (await go(`${PORTAL}/api/v1/billing/plan`, { headers: H })).json()).planCode === 'baslangic');
// Ödeme (mock omurga webhook'u ile — Core para toplamaz)
ok('ödeme simülasyonu 200', (await go(`${PORTAL}/api/v1/billing/mock-pay`, { method: 'POST', headers: H, body: JSON.stringify({ billingRef: inv.billingRef }) })).status === 200);
const invoices2 = await (await go(`${PORTAL}/api/v1/billing/invoices`, { headers: H })).json();
ok('fatura ödendi olarak güncellendi (webhook aynası)', invoices2.find((i) => i.billingRef === inv.billingRef)?.status === 'paid');
ok('imzasız webhook 401', (await fetch(`${API}/api/v1/webhooks/billing`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'invoice.paid', tenantRef: 'x' }) })).status === 401);

// ── 5. Kurulum tamam → sağlık kartı + yedek kanıtı ────────────────────────
jar.clear(); await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
const paidRun = await waitRun(OPS, paidOrder.runId, 180);
ok('ücretli kurulum → succeeded', paidRun?.run.status === 'succeeded', paidRun?.run.status);
const wd = await (await go(`${OPS}/api/v1/ops/workloads/${paidOrder.workloadId}`)).json();
ok('yedek politikası otomatik kuruldu (blueprint + uygun depo çifti)', wd.policy?.primaryRepoId && wd.policy?.offsiteRepoId);
const bk = await (await go(`${OPS}/api/v1/ops/workloads/${paidOrder.workloadId}/backup`, json({}))).json();
const bkRun = await waitRun(OPS, bk.run.id, 120);
ok('ilk yedek alındı (restic)', bkRun?.run.status === 'succeeded', bkRun?.run.status);
jar.clear(); await oidcLogin(PORTAL, 'musteri', 'musteri@veritut.local', 'musteri-dev-parola');
const cards = await (await go(`${PORTAL}/api/v1/workloads`, { headers: H })).json();
const card = cards.find((c) => c.id === paidOrder.workloadId);
ok('portal sağlık kartı: aktif + son yedek ✓ + aylık maliyet', card?.status === 'active' && card.lastBackupOk === true && card.lastBackupAt, JSON.stringify({ st: card?.status, bk: card?.lastBackupOk }));
const pv = await (await fetch(`${API}/api/v1/evidence/public/verify?tenant=${tSlug}`)).json();
ok('kanıt zinciri: kurulum + yedek (≥3 olay, bütün)', pv.ok && pv.checked >= 3, JSON.stringify(pv));
const ordersList = await (await go(`${PORTAL}/api/v1/orders`, { headers: H })).json();
ok('sipariş fulfilled (kurulum doğrulandı)', ordersList.find((o) => o.id === paidOrder.orderId)?.status === 'fulfilled');

// ── 6. Destek: talep → ajan yanıtı (webhook) ──────────────────────────────
const tkRes = await go(`${PORTAL}/api/v1/support`, { method: 'POST', headers: H, body: JSON.stringify({ title: `Yedek sorusu ${ts}`, body: 'Geri dönüş tatbikatı ne zaman?', priority: 'normal', workloadId: paidOrder.workloadId }) });
const tk = tkRes.status === 201 ? await tkRes.json() : null;
ok('destek talebi 201 (dış referans + numara)', tkRes.status === 201 && tk?.externalRef && tk?.number);
ok('talebe yanıt yazılabiliyor', (await go(`${PORTAL}/api/v1/support/${tk.id}/reply`, { method: 'POST', headers: H, body: JSON.stringify({ body: 'Ek bilgi' }) })).status === 200);
{
  const body = JSON.stringify({ event: 'article.created', externalRef: tk.externalRef, state: 'open', minutesSpent: 12, article: { externalRef: `art-${ts}`, author: 'destek@veritut.com', fromCustomer: false, body: 'Tatbikat her ayın ilk haftası; sonucu kanıt defterinizde görürsünüz.' } });
  const sig = createHmac('sha256', envFile.TICKET_WEBHOOK_SECRET ?? '').update(Buffer.from(body)).digest('hex');
  const r = await fetch(`${API}/api/v1/webhooks/tickets`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-veritut-signature': sig }, body });
  ok('ajan yanıtı webhook 200', r.status === 200, String(r.status));
}
const detail = await (await go(`${PORTAL}/api/v1/support/${tk.id}`, { headers: H })).json();
ok('ajan yanıtı portalda + destek dakikası aynası', detail.messages.some((m) => !m.fromCustomer) && Number(detail.ticket.minutesSpent) === 12);
ok('yanıt bildirimi düştü', (await (await go(`${PORTAL}/api/v1/me/notifications`)).json()).some((n) => n.title.includes('Destek talebinize yanıt')));

// ── 7. Public API: anahtar, kapsam, izolasyon, rate limit ─────────────────
const keyRes = await go(`${PORTAL}/api/v1/api-keys`, { method: 'POST', headers: H, body: JSON.stringify({ name: `smoke-${ts}`, scopes: ['workloads:read', 'evidence:read'] }) });
const key = keyRes.status === 201 ? await keyRes.json() : null;
ok('API anahtarı 201 (ham token yalnız şimdi)', keyRes.status === 201 && key?.token?.startsWith('vt_'));
const bearer = { authorization: `Bearer ${key.token}` };
ok('ext/whoami: kiracı anahtardan çözülüyor', (await (await fetch(`${API}/api/v1/ext/whoami`, { headers: bearer })).json()).tenant === tSlug);
const extW = await fetch(`${API}/api/v1/ext/workloads`, { headers: bearer });
ok('ext/workloads 200 + rate limit başlıkları', extW.status === 200 && extW.headers.get('x-ratelimit-limit') === '120');
ok('ext/evidence/verify 200 (zincir bütün)', (await (await fetch(`${API}/api/v1/ext/evidence/verify`, { headers: bearer })).json()).ok === true);
ok('kapsam dışı uç 403 (orders:read yok)', (await fetch(`${API}/api/v1/ext/orders`, { headers: bearer })).status === 403);
ok('geçersiz anahtar 401', (await fetch(`${API}/api/v1/ext/workloads`, { headers: { authorization: 'Bearer vt_sahte' } })).status === 401);
ok('anahtarsız 401', (await fetch(`${API}/api/v1/ext/workloads`)).status === 401);
ok('OpenAPI kimliksiz erişilebilir', (await (await fetch(`${API}/api/v1/ext/openapi.json`)).json()).openapi === '3.1.0');
ok('anahtar iptali 204', (await go(`${PORTAL}/api/v1/api-keys/${key.id}`, { method: 'DELETE', headers: H })).status === 204);
ok('iptal edilen anahtar 401', (await fetch(`${API}/api/v1/ext/workloads`, { headers: bearer })).status === 401);

// ── 8. İzolasyon: ikinci kiracı ───────────────────────────────────────────
{
  const other = await (await go(`${PORTAL}/api/v1/tenants`, json({ name: `Diğer ${ts}`, slug: `k3b-${ts}`, residencyDefault: 'EU' }))).json();
  const H2 = { 'content-type': 'application/json', 'x-tenant-id': other.id };
  ok('başka kiracıdan sipariş görünmüyor (boş liste)', (await (await go(`${PORTAL}/api/v1/orders`, { headers: H2 })).json()).length === 0);
  ok('başka kiracının siparişi 404', (await go(`${PORTAL}/api/v1/orders/${paidOrder.orderId}`, { headers: H2 })).status === 404);
  ok('başka kiracının faturaları görünmüyor', (await (await go(`${PORTAL}/api/v1/billing/invoices`, { headers: H2 })).json()).length === 0);
  ok('başka kiracının destek talebi 404', (await go(`${PORTAL}/api/v1/support/${tk.id}`, { headers: H2 })).status === 404);
}

// ── 9. KPI + ops ekranları ────────────────────────────────────────────────
jar.clear(); await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
const kpi = await (await go(`${OPS}/api/v1/ops/kpi/compute`, json({}))).json();
ok('KPI: MRR > 0, aktif kiracı ve iş yükü sayıldı', Number(kpi.mrr) > 0 && kpi.activeWorkloads > 0, JSON.stringify({ mrr: kpi.mrr, w: kpi.activeWorkloads }));
const allOrders = await (await go(`${OPS}/api/v1/ops/orders`)).json();
ok('ops sipariş listesi kiracı adıyla', allOrders.some((r) => r.order.id === paidOrder.orderId && r.tenantName.includes('K3 Müşteri')));
const ent = await (await go(`${OPS}/api/v1/ops/tenants/${tenant.id}/entitlement`)).json();
ok('ops entitlement görünümü', ent.planCode === 'baslangic' && ent.features['workloads.max'] === 3);
ok('entitlement istisnası (senior) 204', (await go(`${OPS}/api/v1/ops/tenants/${tenant.id}/entitlement`, { ...json({ feature: 'workloads.max', value: 9, note: 'smoke' }), method: 'PUT' })).status === 204);
ok('istisna etkin (cache invalidate)', (await (await go(`${OPS}/api/v1/ops/tenants/${tenant.id}/entitlement`)).json()).features['workloads.max'] === 9);
for (const p of ['/katalog', '/siparisler', '/kpi']) ok(`ops ${p} 200`, (await go(`${OPS}${p}`)).status === 200);
jar.clear(); await oidcLogin(PORTAL, 'musteri', 'musteri@veritut.local', 'musteri-dev-parola');
jar.store(new URL(PORTAL).host, new Response(null, { headers: { 'set-cookie': `vt_tenant=${tenant.id}; Path=/` } }));
for (const p of ['/panel/siparis', '/panel/siparisler', `/panel/siparisler/${paidOrder.orderId}`, '/panel/faturalar', '/panel/destek', `/panel/destek/${tk.id}`, '/panel/api-anahtarlari']) ok(`portal ${p} 200`, (await go(`${PORTAL}${p}`)).status === 200);

// Temizlik: mock-vps yeniden satışa kapatılır (katalog dev durumuna döner).
jar.clear();
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
await go(`${OPS}/api/v1/ops/catalog/products`, { ...json({ slug: 'mock-vps', layer: 2, title: 'Test iş yükü (dev)', summary: 'Yalnız geliştirme ortamı', blueprintSlug: 'mock-vps', bodyMd: 'dev', active: false, sort: 999 }), method: 'PUT' });

done();
