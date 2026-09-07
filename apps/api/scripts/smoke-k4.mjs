#!/usr/bin/env node
/**
 * K4 kabul smoke'u — güvence katmanı. Host'tan: node apps/api/scripts/smoke-k4.mjs
 * Kabul: sentetik alarm → olay → SLA saati → çözüm → rapor · tatbikat kanıtta · kanıt paketi indirilir ve doğrulanır.
 */
import { readFileSync } from 'node:fs';
import { API, OPS, PORTAL, ok, jar, go, oidcLogin, done, json, waitRun, sleep } from './_smoke-common.mjs';

const envFile = (() => { try { return Object.fromEntries(readFileSync(new URL('../../../infra/.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } })();
const S3_KEY = envFile.S3_ACCESS_KEY ?? 'veritut-dev', S3_SECRET = envFile.S3_SECRET_KEY ?? '';
const AM_TOKEN = envFile.ALERTMANAGER_TOKEN ?? '';
const ts = Date.now().toString(36);
const period = new Date().toISOString().slice(0, 7);

console.log('K4 smoke — VERITUT (güvence katmanı)');

// ── Hazırlık: kiracı + iş yükü (mock-vps) + yedek ─────────────────────────
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
const tenant = await (await go(`${OPS}/api/v1/ops/tenants`, json({ name: `K4 ${ts}`, slug: `k4-${ts}`, residencyDefault: 'TR' }))).json();
const acc = await (await go(`${OPS}/api/v1/ops/provider-accounts`, json({ providerCode: 'mock', label: `mock-k4-${ts}`, credentials: { seed: ts }, regions: ['tr-ist'], residencies: ['TR'] }))).json();
await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `k4-a-${ts}`, providerCode: 'mock', repoUrl: `s3:http://veritut-minio:9000/veritut-backups/k4-${ts}-a`, residency: 'TR', credentials: { RESTIC_PASSWORD: `p-${ts}`, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET } }));
await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `k4-b-${ts}`, providerCode: 'hetzner', repoUrl: `s3:http://veritut-minio:9000/veritut-backups/k4-${ts}-b`, residency: 'TR', credentials: { RESTIC_PASSWORD: `p-${ts}`, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET } }));
const prov = await (await go(`${OPS}/api/v1/ops/workloads/provision`, json({ tenantId: tenant.id, blueprint: 'mock-vps', version: '1.0.0', slug: `vm-${ts}`, name: `Güvence ${ts}`, residency: 'TR', providerAccountId: acc.id, region: 'tr-ist', size: 'S', slaTier: 'crit_24x7', inputs: { hostname: `vm-${ts}`, admin_email: 'a@veritut.local', root_password: `Root-Parola-${ts}-XyZ` } }))).json();
const wid = prov.workload.id;
const provRun = await waitRun(OPS, prov.run.id, 180);
ok('hazırlık: iş yükü kuruldu', provRun?.run.status === 'succeeded', provRun?.run.status);
const bk = await (await go(`${OPS}/api/v1/ops/workloads/${wid}/backup`, json({}))).json();
ok('hazırlık: yedek alındı', (await waitRun(OPS, bk.run.id, 120))?.run.status === 'succeeded');

// ── 1. Alertmanager → alarm → otomatik olay ───────────────────────────────
{
  const body = { version: '4', status: 'firing', alerts: [{ status: 'firing', labels: { alertname: `DiskDoluyor-${ts}`, severity: 'critical', workload: `vm-${ts}` }, annotations: { summary: `Disk %92 dolu (vm-${ts})`, description: 'Kök disk eşiği aşıldı' }, startsAt: new Date().toISOString(), fingerprint: `fp-${ts}` }] };
  ok('token\'sız alertmanager 401', (await fetch(`${API}/api/v1/webhooks/alertmanager`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).status === 401);
  const r = await fetch(`${API}/api/v1/webhooks/alertmanager`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${AM_TOKEN}` }, body: JSON.stringify(body) });
  const rj = r.status === 200 ? await r.json() : null;
  ok('alertmanager 200 → 1 alarm, 1 olay', r.status === 200 && rj?.alerts === 1 && rj?.incidentsOpened === 1, JSON.stringify(rj));
  // Aynı fingerprint tekrar gelirse yeni olay AÇILMAZ (alarm fırtınası tek olaya düşer)
  const r2 = await fetch(`${API}/api/v1/webhooks/alertmanager`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${AM_TOKEN}` }, body: JSON.stringify(body) });
  ok('tekrar eden alarm yeni olay açmaz', (await r2.json()).incidentsOpened === 0);
}
const incidents = await (await go(`${OPS}/api/v1/ops/incidents?acik=1`)).json();
const inc = incidents.find((i) => i.incident.title.includes(ts));
ok('olay açıldı: sev2 (critical→sev2), müşteriye kapalı, SLA hedefleri dolu', inc?.incident.severity === 'sev2' && inc.incident.customerVisible === false && inc.incident.responseDueAt && inc.incident.resolveDueAt, JSON.stringify(inc?.incident?.severity));
ok('SLA katmanı iş yükünden alındı (crit_24x7)', inc?.incident.slaCode === 'crit_24x7', inc?.incident.slaCode);
const incId = inc.incident.id;

// ── 2. SLA saati: yanıt, duraklatma, çözüm, post-mortem ───────────────────
ok('güncelleme = ilk yanıt (SLA yanıt saati durur)', (await go(`${OPS}/api/v1/ops/incidents/${incId}/updates`, json({ body: 'Disk temizliği başlatıldı', status: 'identified', customerVisible: true }))).status === 200);
let d = await (await go(`${OPS}/api/v1/ops/incidents/${incId}`)).json();
ok('respondedAt işaretlendi, durum identified', d.d?.incident ? false : Boolean(d.incident.respondedAt) && d.incident.status === 'identified', JSON.stringify(d.incident?.status));
ok('müşteri bekleniyor → saat durur', (await go(`${OPS}/api/v1/ops/incidents/${incId}/pause`, json({ paused: true }))).status === 200);
await sleep(2200);
ok('saat devam ettirilir, duran süre kaydedilir', (await go(`${OPS}/api/v1/ops/incidents/${incId}/pause`, json({ paused: false }))).status === 200);
d = await (await go(`${OPS}/api/v1/ops/incidents/${incId}`)).json();
ok('clockPausedS > 0 ve çözüm hedefi ileri alındı', d.incident.clockPausedS >= 2, String(d.incident.clockPausedS));
ok('olay çözüldü', (await go(`${OPS}/api/v1/ops/incidents/${incId}/resolve`, json({ body: 'Log rotasyonu düzeltildi, disk %40', customerVisible: true }))).status === 200);
d = await (await go(`${OPS}/api/v1/ops/incidents/${incId}`)).json();
ok('durum resolved, resolvedAt dolu', d.incident.status === 'resolved' && d.incident.resolvedAt);
const pv1 = await (await fetch(`${API}/api/v1/evidence/public/verify?tenant=k4-${ts}`)).json();
ok('incident.resolved kanıt zincirinde', pv1.ok && pv1.checked >= 3, JSON.stringify(pv1));
ok('kısa post-mortem 422 (en az 50 karakter)', (await go(`${OPS}/api/v1/ops/incidents/${incId}/postmortem`, json({ postmortem: 'kısa' }))).status === 422);
ok('post-mortem yazıldı → postmortem_done', (await go(`${OPS}/api/v1/ops/incidents/${incId}/postmortem`, json({ postmortem: 'Log rotasyonu yapılandırması eksikti; disk doldu. Alarm eşiği %85 idi, %75\'e çekildi. Blueprint\'e logrotate rolü eklenecek. Tekrarını önlemek için tüm mock-vps iş yüklerinde aynı kontrol koşuldu.' }))).status === 200);
ok('SLA saati elle tetikleme çalışıyor', (await go(`${OPS}/api/v1/ops/incidents/escalate-due`, json({}))).status === 200);

// ── 3. Nöbet + bakım penceresi ────────────────────────────────────────────
{
  const oncall = await (await go(`${OPS}/api/v1/ops/oncall`)).json();
  ok('nöbet listesi okunuyor', Array.isArray(oncall.shifts));
  const me = await (await go(`${OPS}/api/v1/auth/me`)).json();
  const now = new Date();
  const shift = await go(`${OPS}/api/v1/ops/oncall`, json({ staffId: me.id, startsAt: new Date(now.getTime() - 3600_000).toISOString(), endsAt: new Date(now.getTime() + 8 * 3600_000).toISOString(), escalationLevel: 1 }));
  ok('nöbet eklendi 201', shift.status === 201, String(shift.status));
  ok('bitiş başlangıçtan önce → 422', (await go(`${OPS}/api/v1/ops/oncall`, json({ staffId: me.id, startsAt: now.toISOString(), endsAt: new Date(now.getTime() - 1000).toISOString() }))).status === 422);
  const oncall2 = await (await go(`${OPS}/api/v1/ops/oncall`)).json();
  ok('şu anki nöbetçi çözülüyor', oncall2.current?.email === 'ops@veritut.local', JSON.stringify(oncall2.current));
  const mw = await go(`${OPS}/api/v1/ops/maintenance`, json({ tenantId: tenant.id, workloadId: wid, title: `Planlı bakım ${ts}`, body: 'Sürüm yükseltme', startsAt: new Date(now.getTime() + 86400_000).toISOString(), endsAt: new Date(now.getTime() + 90000_000).toISOString(), customerVisible: true }));
  ok('bakım penceresi 201', mw.status === 201, String(mw.status));
}

// ── 4. Geri dönüş tatbikatı → kanıt ───────────────────────────────────────
const drill = await go(`${OPS}/api/v1/ops/drills`, json({ workloadId: wid }));
const drillJ = drill.status === 201 ? await drill.json() : null;
ok('tatbikat 201 (kind drill)', drill.status === 201 && drillJ?.run?.kind === 'drill', `${drill.status} ${drill.status !== 201 ? await drill.text() : ''}`);
const drillRun = await waitRun(OPS, drillJ.run.id, 180);
ok('tatbikat → succeeded (restic restore + checksum + uygulama kontrolü)', drillRun?.run.status === 'succeeded', JSON.stringify(drillRun?.run.summary));
const drillLog = drillRun?.log.map((l) => l.line).join('\n') ?? '';
ok('log: geçici hedefe restore + geri dönen veri', /geçici hedef/.test(drillLog) && /geri dönen veri/.test(drillLog) && /kanıt yazıldı: restore.drill.passed/.test(drillLog));
const drills = await (await go(`${OPS}/api/v1/ops/drills`)).json();
const myDrill = drills.find((x) => x.drill.id === drillJ.drill.id);
ok('tatbikat passed + checksum/uygulama ✓ + kanıt bağlı', myDrill?.drill.status === 'passed' && myDrill.drill.checksumOk === true && myDrill.drill.appCheckOk === true && myDrill.drill.evidenceId);
const pv2 = await (await fetch(`${API}/api/v1/evidence/public/verify?tenant=k4-${ts}`)).json();
ok('restore.drill.passed zincirde, zincir bütün', pv2.ok && pv2.checked > pv1.checked);

// ── 5. Sapma taraması (elle müdahale denetçisi) ───────────────────────────
{
  const scan = await go(`${OPS}/api/v1/ops/drift/scan`, json({ workloadId: wid }));
  ok('sapma taraması kuyruğa verildi', scan.status === 200);
  // Tarama her aktif iş yükü için bir run açar; süzgeçsiz liste penceresi
  // (en yeni N satır) kalabalık kurulumda aranan run'ı dışarıda bırakabiliyordu.
  let driftRun = null;
  for (let i = 0; i < 10 && !driftRun; i++) {
    await sleep(1000);
    const runs = await (await go(`${OPS}/api/v1/ops/runs?kind=drift-plan&workloadId=${wid}`)).json();
    driftRun = runs[0] ?? null;
  }
  ok('drift-plan çalıştırması açıldı', Boolean(driftRun));
  const dr = driftRun ? await waitRun(OPS, driftRun.id, 180) : null;
  ok('drift-plan → succeeded (yalnız plan, apply yok)', dr?.run.status === 'succeeded', dr?.run.status);
  const applySteps = dr?.steps.filter((s) => s.step === 'apply') ?? [];
  ok('apply adımı ATLANDI (salt-okuma)', applySteps.every((s) => s.status === 'skipped'), JSON.stringify(applySteps.map((s) => s.status)));
  ok('taze kurulumda sapma yok', dr?.run.summary?.hasDrift === false, JSON.stringify(dr?.run.summary));
}

// ── 6. SLA hesabı + kredi ─────────────────────────────────────────────────
{
  const r = await go(`${OPS}/api/v1/ops/sla/compute`, json({ period, tenantId: tenant.id }));
  const rj = r.status === 200 ? await r.json() : null;
  ok('SLA dönemi hesaplandı', r.status === 200 && rj.computed >= 1, JSON.stringify(rj));
  const rows = await (await go(`${OPS}/api/v1/ops/sla?period=${period}`)).json();
  const mine = rows.find((x) => x.sla.workloadId === wid);
  ok('SLA satırı: uptime + hedef + olay sayısı', mine && Number(mine.sla.uptimePct) > 0 && Number(mine.sla.uptimeTarget) === 99.9 && mine.sla.incidents >= 1, JSON.stringify(mine?.sla?.uptimePct));
}

// ── 7. Belgeler + kanıt paketi ────────────────────────────────────────────
jar.clear();
await oidcLogin(PORTAL, 'musteri', 'musteri@veritut.local', 'musteri-dev-parola');
// Kiracıya üyelik yok (ops açtı) → portal erişimi 404 olmalı
const H = { 'content-type': 'application/json', 'x-tenant-id': tenant.id };
ok('ops kiracısına portal erişimi 404 (izolasyon)', (await go(`${PORTAL}/api/v1/guvence/sla`, { headers: H })).status === 404);
jar.clear();
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
{
  const sp = await go(`${OPS}/api/v1/ops/tenants/${tenant.id}/documents/subprocessors`, json({}));
  const spJ = sp.status === 201 ? await sp.json() : null;
  ok('alt işleyen listesi üretildi (sha256 + PDF)', sp.status === 201 && spJ?.sha256?.length === 64 && spJ.bytes > 1000, `${sp.status} ${spJ?.bytes}`);
  const dpa = await go(`${OPS}/api/v1/ops/tenants/${tenant.id}/documents/dpa`, json({}));
  ok('DPA üretildi', dpa.status === 201);
  const rep = await go(`${OPS}/api/v1/ops/tenants/${tenant.id}/documents/sla_report`, { ...json({ period }), method: 'POST' });
  ok('aylık SLA raporu üretildi', rep.status === 201);
  const bundle = await go(`${OPS}/api/v1/ops/tenants/${tenant.id}/documents/evidence_bundle`, { ...json({ period }), method: 'POST' });
  const bJ = bundle.status === 201 ? await bundle.json() : null;
  ok('kanıt paketi üretildi (PDF + JSON eki)', bundle.status === 201 && bJ?.kind === 'evidence_bundle', String(bundle.status));
}

// ── 8. Denetçi bağlantısı: kimliksiz görünüm + belge indirme ──────────────
{
  // Portal kullanıcısını kiracıya bağlamak yerine ops kiracısı için denetçi linkini portal üzerinden
  // oluşturamayız (üyelik yok) — kendi kiracımızı kurup oradan test ediyoruz.
  jar.clear();
  await oidcLogin(PORTAL, 'musteri', 'musteri@veritut.local', 'musteri-dev-parola');
  const own = await (await go(`${PORTAL}/api/v1/tenants`, json({ name: `K4 müşteri ${ts}`, slug: `k4m-${ts}`, residencyDefault: 'EU' }))).json();
  const OH = { 'content-type': 'application/json', 'x-tenant-id': own.id };
  const doc = await go(`${PORTAL}/api/v1/guvence/documents/subprocessors`, { method: 'POST', headers: OH, body: '{}' });
  ok('müşteri kendi alt işleyen listesini üretebiliyor', doc.status === 201, String(doc.status));
  const bundleFail = await go(`${PORTAL}/api/v1/guvence/documents/evidence-bundle`, { method: 'POST', headers: OH, body: JSON.stringify({ period }) });
  ok('kanıt paketi planda yoksa 403 FEATURE_NOT_IN_PLAN', bundleFail.status === 403 && (await bundleFail.json()).code === 'FEATURE_NOT_IN_PLAN', String(bundleFail.status));
  const link = await go(`${PORTAL}/api/v1/guvence/auditor-links`, { method: 'POST', headers: OH, body: JSON.stringify({ label: `ISO denetimi ${ts}`, scope: ['evidence', 'subprocessors'], expiresInDays: 7 }) });
  const linkJ = link.status === 201 ? await link.json() : null;
  ok('denetçi bağlantısı 201 (URL döner)', link.status === 201 && linkJ?.url?.includes('/denetci/'));
  const token = linkJ.url.split('/denetci/')[1];
  const view = await fetch(`${API}/api/v1/denetci/${token}`);
  const viewJ = view.status === 200 ? await view.json() : null;
  ok('denetçi görünümü KİMLİKSİZ 200: zincir + belgeler', view.status === 200 && viewJ?.chain && Array.isArray(viewJ.documents), String(view.status));
  ok('kapsam dışı veri (sla) paylaşılmıyor', viewJ && !('sla' in viewJ));
  const docId = viewJ.documents[0]?.id;
  const dl = await fetch(`${API}/api/v1/denetci/${token}/documents/${docId}`);
  const bytes = dl.status === 200 ? (await dl.arrayBuffer()).byteLength : 0;
  ok('denetçi belgeyi indirebiliyor (PDF)', dl.status === 200 && bytes > 1000 && dl.headers.get('x-document-sha256')?.length === 64, `${dl.status} ${bytes}`);
  ok('geçersiz denetçi token 404', (await fetch(`${API}/api/v1/denetci/sahte-token-degeri-uzun`)).status === 404);
  ok('bağlantı iptali 204', (await go(`${PORTAL}/api/v1/guvence/auditor-links/${linkJ.id}`, { method: 'DELETE', headers: OH })).status === 204);
  ok('iptal sonrası denetçi görünümü 404', (await fetch(`${API}/api/v1/denetci/${token}`)).status === 404);

  // ── 9. Alarm kanalları ──────────────────────────────────────────────────
  const ch = await go(`${PORTAL}/api/v1/guvence/channels`, { method: 'POST', headers: OH, body: JSON.stringify({ kind: 'webhook', label: `Panelim ${ts}`, target: 'http://veritut-api:4400/api/v1/health', events: ['incident.opened', 'incident.resolved'] }) });
  const chJ = ch.status === 201 ? await ch.json() : null;
  ok('alarm kanalı 201, hedef maskeli (yol gizli, ana makine görünür)', ch.status === 201 && chJ?.targetHint?.includes('***') && !JSON.stringify(chJ).includes('/api/v1/health'), JSON.stringify(chJ?.targetHint));
  const list = await (await go(`${PORTAL}/api/v1/guvence/channels`, { headers: OH })).json();
  ok('kanal listesi sır taşıyan yolu döndürmez (Slack/Teams token\'ı sızmaz)', !JSON.stringify(list).includes('/api/v1/health') && !JSON.stringify(list).includes('targetSealed'));
  ok('kanal silinebiliyor', (await go(`${PORTAL}/api/v1/guvence/channels/${chJ.id}`, { method: 'DELETE', headers: OH })).status === 204);

  // Portal sayfaları
  jar.store(new URL(PORTAL).host, new Response(null, { headers: { 'set-cookie': `vt_tenant=${own.id}; Path=/` } }));
  for (const p of ['/panel/guvence', '/panel/olaylar', '/panel/belgeler']) ok(`portal ${p} 200`, (await go(`${PORTAL}${p}`)).status === 200);
}

// ── 10. Ops ekranları ─────────────────────────────────────────────────────
jar.clear();
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
for (const p of ['/olaylar', '/olaylar?acik=1', `/olaylar/${incId}`, '/nobet', '/tatbikatlar', '/sapmalar', '/sla']) ok(`ops ${p} 200`, (await go(`${OPS}${p}`)).status === 200);

done();
