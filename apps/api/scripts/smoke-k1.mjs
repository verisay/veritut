#!/usr/bin/env node
/**
 * K1 kabul smoke'u — envanter · kanıt · marj. Host'tan koşar: node apps/api/scripts/smoke-k1.mjs
 * Ön koşul: compose ayakta, MinIO'da `veritut-backups` kovası, S3 kimliği env'de (S3_ACCESS_KEY/S3_SECRET_KEY) veya infra/.env okunur.
 */
import { readFileSync } from 'node:fs';
import { API, OPS, PORTAL, STATUS, ok, jar, go, oidcLogin, done, json, waitRun, sleep } from './_smoke-common.mjs';

const envFile = (() => { try { return Object.fromEntries(readFileSync(new URL('../../../infra/.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } })();
const S3_KEY = process.env.S3_ACCESS_KEY ?? envFile.S3_ACCESS_KEY ?? 'veritut-dev';
const S3_SECRET = process.env.S3_SECRET_KEY ?? envFile.S3_SECRET_KEY ?? '';
const ts = Date.now().toString(36);

console.log('K1 smoke — VERITUT (envanter · kanıt · marj)');

// ── Ops girişi ─────────────────────────────────────────────────────────────
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
const me = await (await go(`${OPS}/api/v1/auth/me`)).json();
ok('ops girişi (platform_admin)', me.staffRole === 'platform_admin');

// ── Kiracı (ops) ───────────────────────────────────────────────────────────
const tenantSlug = `k1-${ts}`;
const tRes = await go(`${OPS}/api/v1/ops/tenants`, json({ name: `K1 Kiracı ${ts}`, slug: tenantSlug, residencyDefault: 'TR' }));
const tenant = tRes.status === 201 ? await tRes.json() : null;
ok('ops kiracı oluştur 201', tRes.status === 201 && tenant?.id);

// ── Tedarikçi hesabı (mock) — mühürlü ──────────────────────────────────────
const accRes = await go(`${OPS}/api/v1/ops/provider-accounts`, json({ providerCode: 'mock', label: `mock-${ts}`, credentials: { seed: ts }, regions: ['tr-ist', 'eu-fra'], residencies: ['TR', 'EU'] }));
const acc = accRes.status === 201 ? await accRes.json() : null;
ok('tedarikçi hesabı 201, hasCredentials=true, credentials_sealed dönmez', accRes.status === 201 && acc?.hasCredentials === true && !('credentialsSealed' in (acc ?? {})) && !('credentials_sealed' in (acc ?? {})));
const accList = await (await go(`${OPS}/api/v1/ops/provider-accounts`)).json();
ok('liste: tek hesaplı tedarikçi uyarısı mock için ÜRETİLMEZ', !accList.singleAccountProviders.includes('mock'));

// ── provider-sync (runner mock driver → envanter) ─────────────────────────
const syncRes = await go(`${OPS}/api/v1/ops/provider-accounts/${acc.id}/sync`, json({}));
const syncRun = syncRes.status === 201 ? await syncRes.json() : null;
ok('sync çalıştırması 201 (kind provider-sync)', syncRes.status === 201 && syncRun?.kind === 'provider-sync');
const syncDone = await waitRun(OPS, syncRun.id);
ok('provider-sync → succeeded (mühür runner\'da açıldı)', syncDone?.run.status === 'succeeded', syncDone?.run.status);
ok('sync logunda kimlik alanı adı var, DEĞERİ yok', syncDone?.log.some((l) => l.line.includes('alanlar: seed')) && !syncDone.log.some((l) => l.line.includes(`seed=${ts}`) || l.line.includes(`seed:${ts}`)));
const inv = await (await go(`${OPS}/api/v1/ops/inventory?sahipsiz=1`)).json();
const mine = inv.filter((i) => i.providerAccountId === acc.id);
ok('envanter: 4 mock kaynak sahipsiz', mine.length === 4, String(mine.length));
ok('envanter kalemi ikametgâh etiketli (TR server)', mine.some((i) => i.kind === 'server' && i.residency === 'TR'));

// ── Envanterden iş yükü oluştur + eşle ─────────────────────────────────────
const server = mine.find((i) => i.kind === 'server' && i.residency === 'TR');
const cwRes = await go(`${OPS}/api/v1/ops/inventory/${server.id}/create-workload`, json({ tenantId: tenant.id, slug: `nc-${ts}`, name: `Nextcloud ${ts}` }));
const wl = cwRes.status === 201 ? await cwRes.json() : null;
ok('envanterden iş yükü 201 (residency TR, provider mock)', cwRes.status === 201 && wl?.residency === 'TR' && wl?.providerCode === 'mock');
const inv2 = await (await go(`${OPS}/api/v1/ops/inventory`)).json();
ok('kalem artık eşli (matchedWorkloadId)', inv2.find((i) => i.id === server.id)?.matchedWorkloadId === wl.id);
// ikinci kaynak: var olan iş yüküne eşle
const vol = mine.find((i) => i.kind === 'volume');
ok('var olan iş yüküne eşle 200', (await go(`${OPS}/api/v1/ops/inventory/${vol.id}/match`, json({ workloadId: wl.id }))).status === 200);
const unmatched = (await (await go(`${OPS}/api/v1/ops/inventory?sahipsiz=1`)).json()).filter((i) => i.providerAccountId === acc.id);
ok('sahipsiz sayısı 2\'ye düştü', unmatched.length === 2, String(unmatched.length));

// ── Elle iş yükü + probe URL → kiracı bileşeni + status sayfası ────────────
const w2Res = await go(`${OPS}/api/v1/ops/workloads`, json({ tenantId: tenant.id, slug: `api-${ts}`, name: 'Sağlık probe', productSlug: 'legacy', residency: 'EU', providerCode: 'mock', slaTier: 'std_9x5', status: 'active', probeUrl: 'http://veritut-api:4400/api/v1/health' }));
const w2 = w2Res.status === 201 ? await w2Res.json() : null;
ok('elle iş yükü (probe URL) 201', w2Res.status === 201);
const dupRes = await go(`${OPS}/api/v1/ops/workloads`, json({ tenantId: tenant.id, slug: `api-${ts}`, name: 'xx', residency: 'EU' }));
ok('slug çakışması 409', dupRes.status === 409, `${dupRes.status} ${await dupRes.text()}`);
await sleep(33_000); // bir probe turu (30 sn)
const tenantStatus = await fetch(`${STATUS}/${tenantSlug}`);
ok('kiracı status sayfası 200 (probe sonrası snapshot)', tenantStatus.status === 200, String(tenantStatus.status));
ok('status sayfasında iş yükü adı var', (await tenantStatus.text()).includes('Sağlık probe'));

// ── Yedek: repo (MinIO, mühürlü) + politika (3-2-1/ikametgâh KODDA) + gerçek restic ─
const repoTR = await (await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `minio-tr-${ts}`, providerCode: 'mock', repoUrl: `s3:http://veritut-minio:9000/veritut-backups/${ts}-tr`, residency: 'TR', credentials: { RESTIC_PASSWORD: `p-${ts}`, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET } }))).json();
const repoUS = await (await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `us-${ts}`, providerCode: 'aws', repoUrl: `s3:https://s3.us-east-1.amazonaws.com/x/${ts}`, residency: 'US', credentials: {} }))).json();
const repoHz = await (await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `hz-eu-${ts}`, providerCode: 'hetzner', repoUrl: `s3:http://veritut-minio:9000/veritut-backups/${ts}-eu`, residency: 'EU', credentials: { RESTIC_PASSWORD: `p-${ts}`, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET } }))).json();
ok('3 depo oluşturuldu (hasCredentials doğru)', repoTR.hasCredentials === true && repoUS.hasCredentials === false);
const viol1 = await go(`${OPS}/api/v1/ops/workloads/${wl.id}/backup-policy`, { ...json({ primaryRepoId: repoTR.id, offsiteRepoId: repoUS.id }), method: 'PUT' });
const v1b = await viol1.json();
ok('TR iş yükü + US offsite → 422 POLICY_VIOLATION (residency)', viol1.status === 422 && v1b.code === 'POLICY_VIOLATION' && v1b.details.some((d) => d.policy === 'residency'));
const viol2 = await go(`${OPS}/api/v1/ops/workloads/${wl.id}/backup-policy`, { ...json({ primaryRepoId: repoTR.id, offsiteRepoId: null }), method: 'PUT' });
ok('offsite yok → 422 (3-2-1 offsite_missing)', viol2.status === 422 && (await viol2.json()).details.some((d) => d.code === 'offsite_missing'));
const viol3 = await go(`${OPS}/api/v1/ops/workloads/${wl.id}/backup-policy`, { ...json({ primaryRepoId: repoTR.id, offsiteRepoId: repoHz.id }), method: 'PUT' });
ok('TR iş yükü + EU offsite → 422 (TR yalnız TR)', viol3.status === 422);
// EU iş yükü (w2): birincil TR(mock) + offsite EU(hetzner) → geçerli (EU → EU/TR, farklı tedarikçi)
const polOk = await go(`${OPS}/api/v1/ops/workloads/${w2.id}/backup-policy`, { ...json({ primaryRepoId: repoTR.id, offsiteRepoId: repoHz.id, paths: [] }), method: 'PUT' });
ok('EU iş yükü + TR birincil + EU offsite (farklı tedarikçi) → 200', polOk.status === 200, String(polOk.status));
const bkRes = await go(`${OPS}/api/v1/ops/workloads/${w2.id}/backup`, json({}));
const bk = bkRes.status === 201 ? await bkRes.json() : null;
ok('yedek çalıştırması 201', bkRes.status === 201 && bk?.run?.kind === 'backup');
const bkDone = await waitRun(OPS, bk.run.id, 90);
ok('restic backup → succeeded (MinIO S3, gerçek restic)', bkDone?.run.status === 'succeeded', JSON.stringify(bkDone?.run.summary));
ok('logda snapshot + restic check', bkDone?.log.some((l) => l.line.includes('snapshot')) && bkDone.log.some((l) => l.line.includes('kanıt yazıldı')));
ok('logda RESTIC_PASSWORD/AWS secret sızmadı', !bkDone?.log.some((l) => l.line.includes(`p-${ts}`) || (S3_SECRET && l.line.includes(S3_SECRET))));
const wd = await (await go(`${OPS}/api/v1/ops/workloads/${w2.id}`)).json();
ok('backup_jobs: completed + snapshotId + evidenceId', wd.jobs[0]?.status === 'completed' && wd.jobs[0]?.snapshotId && wd.jobs[0]?.evidenceId);
ok('ops iş yükü detayı access_sealed dönmez', !('accessSealed' in wd.workload));

// ── Erişim oturumu ingest (iç uç) → kanıt ──────────────────────────────────
const INTERNAL = envFile.INTERNAL_TOKEN ?? '';
const acs = await fetch(`${API}/api/v1/internal/access-session`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': INTERNAL }, body: JSON.stringify({ workloadId: w2.id, staffEmail: 'ops@veritut.local', actorLabel: 'ops@veritut.local', source: 'bastion', target: `api-${ts}`, reason: 'smoke', startedAt: new Date().toISOString() }) });
ok('access-session ingest 201', acs.status === 201, String(acs.status));

// ── Kanıt zinciri (kiracı) — portal tarafında doğrula ─────────────────────
await oidcLogin(PORTAL, 'musteri', 'musteri@veritut.local', 'musteri-dev-parola');
const pme = await (await go(`${PORTAL}/api/v1/auth/me`)).json();
// müşteriyi kiracıya üye yap: davet → kabul (ops tarafından oluşturulan kiracının üyesi yok) — önce ilk kiracıyı ops kullanıcısı yerine portal kullanıcısına davetle bağla
// (ops API'sinde üye ekleme yok; K1 tasarımı: davet portaldan. Bu kiracı için doğrudan DB yerine: platform sahibi = ilk portal kiracısı, burada kanıtı platform zincirinden değil kiracı zincirinden okumak için üyelik gerekir.)
const hasTenant = pme.tenants.some((t) => t.id === tenant.id);
ok('portal kullanıcısı ops kiracısının üyesi DEĞİL (izolasyon)', !hasTenant);
const iso = await go(`${PORTAL}/api/v1/workloads`, { headers: { 'x-tenant-id': tenant.id } });
ok('üye olunmayan kiracının iş yükleri 404', iso.status === 404, String(iso.status));
const isoW = await go(`${PORTAL}/api/v1/workloads/${w2.id}`, { headers: { 'x-tenant-id': pme.tenants[0]?.id ?? tenant.id } });
ok('başka kiracının iş yükü kendi kiracı bağlamıyla 404', isoW.status === 404, String(isoW.status));
// Kiracı zinciri doğrulaması public uçtan (kimliksiz denetçi): backup.completed + access.session → ≥2 olay
const pv = await (await fetch(`${API}/api/v1/evidence/public/verify?tenant=${tenantSlug}`)).json();
ok('public verify: kiracı zinciri bütün, ≥2 olay (backup + access)', pv.ok === true && pv.checked >= 2, JSON.stringify(pv));

// ── Davet akışı: portal kullanıcısı kendi kiracısına musteri2'yi davet eder ─
const myTenant = pme.tenants[0];
const invRes = await go(`${PORTAL}/api/v1/tenants/current/invitations`, { ...json({ email: 'musteri2@veritut.local', role: 'technical' }), headers: { 'content-type': 'application/json', 'x-tenant-id': myTenant.id } });
const invJ = invRes.status === 201 ? await invRes.json() : null;
ok('davet 201 (dev token döner)', invRes.status === 201 && invJ?.token);
ok('viewer/technical davet edilemez: owner rolü 422', (await go(`${PORTAL}/api/v1/tenants/current/invitations`, { ...json({ email: 'x@veritut.local', role: 'owner' }), headers: { 'content-type': 'application/json', 'x-tenant-id': myTenant.id } })).status === 422);
// Yanlış kullanıcı kabul edemez (musteri ≠ musteri2)
const wrong = await go(`${PORTAL}/api/v1/me/invitations/accept`, json({ token: invJ.token }));
ok('daveti başka e-posta kabul edemez 403', wrong.status === 403, String(wrong.status));
// musteri2 giriş → kabul (Keycloak SSO çerezi de silinmeli, yoksa form gelmez)
jar.clear();
await oidcLogin(PORTAL, 'musteri', 'musteri2@veritut.local', 'musteri2-dev-parola');
const acc2 = await go(`${PORTAL}/api/v1/me/invitations/accept`, json({ token: invJ.token }));
ok('musteri2 daveti kabul etti (technical)', acc2.status === 200 && (await acc2.json()).role === 'technical');
ok('aynı token ikinci kez 404', (await go(`${PORTAL}/api/v1/me/invitations/accept`, json({ token: invJ.token }))).status === 404);
const cards = await go(`${PORTAL}/api/v1/workloads`, { headers: { 'x-tenant-id': myTenant.id } });
ok('technical üye iş yüklerini görür 200', cards.status === 200);
ok('technical davet gönderemez 403', (await go(`${PORTAL}/api/v1/tenants/current/invitations`, { ...json({ email: 'y@veritut.local', role: 'viewer' }), headers: { 'content-type': 'application/json', 'x-tenant-id': myTenant.id } })).status === 403);
const notif = await (await go(`${PORTAL}/api/v1/me/notifications`)).json();
ok('bildirim ucu 200 (liste)', Array.isArray(notif));

// ── Marj raporu ────────────────────────────────────────────────────────────
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
const period = new Date().toISOString().slice(0, 7);
ok('gelir gir 200', (await go(`${OPS}/api/v1/ops/workloads/${wl.id}/revenue`, { ...json({ period, amount: 120, currency: 'EUR' }), method: 'PUT' })).status === 200);
let m = await (await go(`${OPS}/api/v1/ops/margin?period=${period}`)).json();
let row = m.rows.find((r) => r.workloadId === wl.id);
ok('marj: gelir 120, maliyet 29.70 (server 24.5 + volume 5.2 tahmin), marj %75.3', row?.revenue === 120 && Math.abs(row.cost - 29.7) < 0.01 && row.marginPct === 75.3 && row.costMethod === 'estimate', JSON.stringify(row));
ok('probe iş yükü: gelir yok → no_revenue bayrağı', m.rows.find((r) => r.workloadId === w2.id)?.flag === 'no_revenue');
// Fatura CSV → direkt maliyet tahmini ezer
const csv = `resource,description,amount,currency\nserver:${ts}-1,cx32 gerçek fatura,31.00,EUR\nvolume:${ts}-v1,volume,6.00,EUR\nserver:baska,ilgisiz,99,EUR`;
const invc = await (await go(`${OPS}/api/v1/ops/cost/invoice-csv`, json({ providerAccountId: acc.id, period, csv }))).json();
ok('fatura CSV: 3 satır, 2 tahsis', invc.lines === 3 && invc.allocated === 2, JSON.stringify(invc));
m = await (await go(`${OPS}/api/v1/ops/margin?period=${period}`)).json();
row = m.rows.find((r) => r.workloadId === wl.id);
ok('fatura sonrası maliyet 37.00 direkt, marj %69.2, flag ok', Math.abs(row.cost - 37) < 0.01 && row.costMethod === 'direct' && row.marginPct === 69.2 && row.flag === 'ok', JSON.stringify(row));
ok('düşük marj bayrağı: gelir 40 → low', (await go(`${OPS}/api/v1/ops/workloads/${wl.id}/revenue`, { ...json({ period, amount: 40, currency: 'EUR' }), method: 'PUT' })).status === 200 && (await (await go(`${OPS}/api/v1/ops/margin?period=${period}`)).json()).rows.find((r) => r.workloadId === wl.id).flag === 'low');
// Kur: TRY gelir + EUR maliyet. fx_rates kalıcı (önceki koşudan kalabilir) → ilk durum fx_missing VEYA ok; kur değeri koşuya özgü, marj ona göre doğrulanır.
await go(`${OPS}/api/v1/ops/workloads/${wl.id}/revenue`, { ...json({ period, amount: 4000, currency: 'TRY' }), method: 'PUT' });
m = await (await go(`${OPS}/api/v1/ops/margin?period=${period}`)).json();
ok('kur bilinmiyorsa fx_missing (veya önceki koşudan kur varsa ok)', ['fx_missing', 'ok'].includes(m.rows.find((r) => r.workloadId === wl.id).flag));
const rate = 30 + (Date.now() % 20); // koşuya özgü
ok('kur gir 204', (await go(`${OPS}/api/v1/ops/fx`, { ...json({ period, currency: 'EUR', toTry: rate }), method: 'PUT' })).status === 204);
m = await (await go(`${OPS}/api/v1/ops/margin?period=${period}`)).json();
row = m.rows.find((r) => r.workloadId === wl.id);
const expected = Math.round(((4000 - 37 * rate) / 4000) * 1000) / 10;
ok(`kur sonrası marj: 4000 TRY vs 37 EUR×${rate} → %${expected}`, row.marginPct === expected && row.flag === (expected < 35 ? 'low' : 'ok'), JSON.stringify(row));

// ── CSV içe aktarım ────────────────────────────────────────────────────────
const wcsv = `tenant_slug,tenant_name,workload_slug,name,product_slug,residency,provider,region,size,sla_tier,monthly_revenue,currency,probe_url,notes\ncsv-${ts},CSV Kiracı ${ts},n8n-${ts},n8n otomasyon,n8n,EU,hetzner,fsn1,cx22,std_9x5,45,EUR,,ithal\ncsv-${ts},,BOZUK SLUG,x,legacy,EU,,,,,,,,\n`;
const imp = await (await go(`${OPS}/api/v1/ops/workloads/import-csv`, json({ csv: wcsv }))).json();
ok('CSV: 1 kiracı, 1 iş yükü, 1 gelir, 1 hata satırı', imp.tenantsCreated === 1 && imp.workloadsCreated === 1 && imp.revenueRows === 1 && imp.errors.length === 1, JSON.stringify(imp));
const imp2 = await (await go(`${OPS}/api/v1/ops/workloads/import-csv`, json({ csv: wcsv }))).json();
ok('CSV tekrar: idempotent (0 yeni, 1 güncelleme)', imp2.tenantsCreated === 0 && imp2.workloadsCreated === 0 && imp2.workloadsUpdated === 1);

// ── Kiracı 360 + ops UI sayfaları ──────────────────────────────────────────
const t360 = await (await go(`${OPS}/api/v1/ops/tenants/${tenant.id}`)).json();
ok('kiracı 360: 2 iş yükü, kanıt ≥2, aylık maliyet > 0', t360.workloads.length === 2 && t360.evidence.count >= 2 && t360.month.cost > 0, JSON.stringify(t360.month));
for (const p of ['/tedarikciler', '/envanter', '/envanter?sahipsiz=1', '/is-yukleri', `/is-yukleri/${w2.id}`, '/marj', '/yedekler', `/kiracilar/${tenant.id}`, '/ice-aktarim', '/bildirimler']) {
  ok(`ops ${p} 200`, (await go(`${OPS}${p}`)).status === 200);
}
// portal sayfaları (musteri2 oturumu, myTenant)
jar.store(new URL(PORTAL).host, new Response(null, { headers: { 'set-cookie': `vt_tenant=${myTenant.id}; Path=/` } }));
for (const p of ['/panel', '/panel/ekip', '/panel/kanit', '/panel/bildirimler']) ok(`portal ${p} 200`, (await go(`${PORTAL}${p}`)).status === 200);
const bogus = await go(`${PORTAL}/panel/is-yukleri/${w2.id}`);
ok('portal başka kiracının iş yükü sayfası 404', bogus.status === 404, String(bogus.status));

done();
