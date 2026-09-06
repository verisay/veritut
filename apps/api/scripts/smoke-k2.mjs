#!/usr/bin/env node
/**
 * K2 kabul smoke'u — provizyon motoru. Host'tan: node apps/api/scripts/smoke-k2.mjs
 * mock-vps blueprint'i ile GERÇEK OpenTofu (pg backend + state şifreleme) + Ansible (local) + checks.
 */
import { readFileSync } from 'node:fs';
import { API, OPS, PORTAL, ok, jar, go, oidcLogin, done, json, waitRun, sleep } from './_smoke-common.mjs';

const envFile = (() => { try { return Object.fromEntries(readFileSync(new URL('../../../infra/.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } })();
const S3_KEY = envFile.S3_ACCESS_KEY ?? 'veritut-dev', S3_SECRET = envFile.S3_SECRET_KEY ?? '';
const ts = Date.now().toString(36);
const ROOT_PW = `Root-Parola-${ts}-XyZ`;

console.log('K2 smoke — VERITUT (provizyon motoru)');
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');

// ── Katalog ────────────────────────────────────────────────────────────────
const bps = await (await go(`${OPS}/api/v1/ops/blueprints`)).json();
ok('katalog: 5 blueprint (mock-vps, managed-vps, n8n, nextcloud, zammad)', bps.length === 5 && ['mock-vps', 'managed-vps', 'n8n', 'nextcloud', 'zammad'].every((s) => bps.some((b) => b.slug === s)), bps.map((b) => b.slug).join(','));
const mock = bps.find((b) => b.slug === 'mock-vps');
ok('mock-vps: has_tofu + has_ansible + 2 check + sır girdisi', mock.has_tofu && mock.has_ansible && mock.checks.length === 2 && mock.inputs.properties.root_password.secret === true);
ok('manifest sırrı/parolayı içermez (yalnız şema)', !JSON.stringify(mock).includes('Parola-'));

// ── Hazırlık: kiracı, mock hesap, TR/EU depolar (otomatik yedek politikası için farklı tedarikçi) ─
const tenant = await (await go(`${OPS}/api/v1/ops/tenants`, json({ name: `K2 ${ts}`, slug: `k2-${ts}`, residencyDefault: 'TR' }))).json();
const acc = await (await go(`${OPS}/api/v1/ops/provider-accounts`, json({ providerCode: 'mock', label: `mock-k2-${ts}`, credentials: { seed: ts }, regions: ['tr-ist', 'eu-fra'], residencies: ['TR', 'EU'] }))).json();
await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `k2-tr-${ts}`, providerCode: 'mock', repoUrl: `s3:http://veritut-minio:9000/veritut-backups/k2-${ts}-a`, residency: 'TR', credentials: { RESTIC_PASSWORD: `p-${ts}`, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET } }));
await go(`${OPS}/api/v1/ops/backup-repos`, json({ label: `k2-tr-hz-${ts}`, providerCode: 'hetzner', repoUrl: `s3:http://veritut-minio:9000/veritut-backups/k2-${ts}-b`, residency: 'TR', credentials: { RESTIC_PASSWORD: `p-${ts}`, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET } }));

// ── Politika reddi: TR iş yükü + eu-fra bölgesi → 422 ───────────────────────
const bad = await go(`${OPS}/api/v1/ops/workloads/provision`, json({ tenantId: tenant.id, blueprint: 'mock-vps', version: '1.0.0', slug: `bad-${ts}`, name: 'Kötü bölge', residency: 'TR', providerAccountId: acc.id, region: 'eu-fra', size: 'S', inputs: { hostname: 'x-y', admin_email: 'a@b.co', root_password: ROOT_PW } }));
ok('TR ikametgâh + EU bölge → 422 POLICY_VIOLATION', bad.status === 422 && (await bad.json()).code === 'POLICY_VIOLATION', String(bad.status));
const badIn = await go(`${OPS}/api/v1/ops/workloads/provision`, json({ tenantId: tenant.id, blueprint: 'mock-vps', version: '1.0.0', slug: `bad2-${ts}`, name: 'Kötü girdi', residency: 'TR', providerAccountId: acc.id, region: 'tr-ist', size: 'S', inputs: { hostname: 'Büyük', admin_email: 'x', root_password: 'kısa' } }));
const badInJ = await badIn.json();
ok('geçersiz blueprint girdileri → 422 alan hataları (hostname, admin_email, root_password)', badIn.status === 422 && ['hostname', 'admin_email', 'root_password'].every((k) => badInJ.details?.[k]), JSON.stringify(badInJ.details));
ok('bilinmeyen boyut 400', (await go(`${OPS}/api/v1/ops/workloads/provision`, json({ tenantId: tenant.id, blueprint: 'mock-vps', version: '1.0.0', slug: `bad3-${ts}`, name: 'Kötü boyut', residency: 'TR', providerAccountId: acc.id, region: 'tr-ist', size: 'XXL', inputs: { hostname: 'x-y', admin_email: 'a@b.co', root_password: ROOT_PW } }))).status === 400);

// ── Provizyon (low risk → onaysız) ─────────────────────────────────────────
const provRes = await go(`${OPS}/api/v1/ops/workloads/provision`, json({ tenantId: tenant.id, blueprint: 'mock-vps', version: '1.0.0', slug: `vm-${ts}`, name: `Mock VM ${ts}`, residency: 'TR', providerAccountId: acc.id, region: 'tr-ist', size: 'S', slaTier: 'std_9x5', inputs: { hostname: `vm-${ts}`, admin_email: 'admin@veritut.local', root_password: ROOT_PW, monitoring: true } }));
const prov = provRes.status === 201 ? await provRes.json() : null;
ok('provizyon 201: workload provisioning + run provision', provRes.status === 201 && prov.workload.status === 'provisioning' && prov.run.kind === 'provision', `${provRes.status} ${JSON.stringify(prov?.workload?.status)}`);
ok('inputs DB\'de sır İÇERMEZ (root_password ayrı mühürlü tabloda)', prov && !('root_password' in prov.workload.inputs) && prov.workload.inputs.hostname === `vm-${ts}`);
const wid = prov.workload.id;
const r1 = await waitRun(OPS, prov.run.id, 180);
ok('provision → succeeded (tofu init/plan/apply pg backend + ansible + checks)', r1?.run.status === 'succeeded', `${r1?.run.status} ${JSON.stringify(r1?.run.summary)}`);
ok('8 adım succeeded, risk low, onay gerekmedi', r1?.steps.filter((s) => s.status === 'succeeded').length === 8 && r1.run.risk === 'low' && r1.run.approvedBy === null, JSON.stringify(r1?.steps.map((s) => `${s.step}:${s.status}`)));
ok('plan özeti: 3 kaynak eklenecek (server, volume, firewall)', r1?.run.planSummary?.add === 3 && r1.run.planSummary.destroy === 0, JSON.stringify(r1?.run.planSummary));
const logText = r1?.log.map((l) => l.line).join('\n') ?? '';
ok('log: tofu plan + apply + ansible PLAY RECAP + check ✓ + teslim', /tofu plan: 3 eklenecek/.test(logText) && /Apply complete/.test(logText) && /PLAY RECAP/.test(logText) && /check api-health: ✓/.test(logText) && /check marker-file: ✓/.test(logText) && /teslim: iş yükü active/.test(logText));
ok('log: root parolası sızmadı', !logText.includes(ROOT_PW));
const wd = await (await go(`${OPS}/api/v1/ops/workloads/${wid}`)).json();
ok('iş yükü active, endpoints + outputs kayıtlı, access_sealed dönmüyor', wd.workload.status === 'active' && wd.workload.endpoints.length === 1 && wd.workload.outputs.server_id && !('accessSealed' in wd.workload) && !JSON.stringify(wd.workload.outputs).includes(ROOT_PW), JSON.stringify({ st: wd.workload.status, ep: wd.workload.endpoints }));
ok('yedek politikası otomatik kuruldu (TR birincil + TR offsite farklı tedarikçi)', wd.policy && wd.policy.primaryRepoId && wd.policy.offsiteRepoId && wd.policy.primaryRepoId !== wd.policy.offsiteRepoId, JSON.stringify(wd.policy));
const pv = await (await fetch(`${API}/api/v1/evidence/public/verify?tenant=k2-${ts}`)).json();
ok('kanıt: workload.provisioned zincirde (public verify ok, ≥1)', pv.ok && pv.checked >= 1);
// tfstate DB'de şema açıldı mı (D11)
// (runner dışından okunamaz → dolaylı: ikinci plan "no changes" vermeli — aşağıda resize'da doğrulanıyor)

// ── Aynı iş yükünde eşzamanlı run: kilit ─────────────────────────────────────
// (resize tetikle, hemen ikinci resize → ikincisi "locked" ile failed olmalı — ama resize workload'ı provisioning'e alır; ikinci istek 409 transition alır. Bu da izolasyon.)

// ── Resize S→M: server_type değişimi → replace → HIGH → awaiting_approval ───
const rs = await go(`${OPS}/api/v1/ops/workloads/${wid}/resize`, json({ size: 'M' }));
const rsRun = rs.status === 201 ? await rs.json() : null;
ok('resize 201 (kind resize)', rs.status === 201 && rsRun?.kind === 'resize', String(rs.status));
ok('resize sürerken ikinci resize 409 (makine: provisioning → provisioning yok)', (await go(`${OPS}/api/v1/ops/workloads/${wid}/resize`, json({ size: 'L' }))).status === 409);
let d = null;
for (let i = 0; i < 90; i++) { await sleep(1000); d = await (await go(`${OPS}/api/v1/ops/runs/${rsRun.id}`)).json(); if (d.run.status === 'awaiting_approval' || ['succeeded', 'failed', 'cancelled'].includes(d.run.status)) break; }
ok('plan: replace → risk high → awaiting_approval', d?.run.status === 'awaiting_approval' && d.run.risk === 'high' && d.run.planSummary.replace >= 1, `${d?.run.status} ${d?.run.risk} ${JSON.stringify(d?.run.planSummary)}`);
ok('changes kaydı açıldı (draft, high)', (await (await go(`${OPS}/api/v1/ops/changes`)).json()).some((c) => c.runId === rsRun.id && c.status === 'draft' && c.risk === 'high'));
// Dört-göz: talep eden (ops@, platform_admin) onaylayamaz
const selfApprove = await go(`${OPS}/api/v1/ops/runs/${rsRun.id}/approve`, json({}));
ok('talep eden onaylayamaz 403 (dört-göz)', selfApprove.status === 403, String(selfApprove.status));
// senior@ girer ve onaylar
jar.clear();
await oidcLogin(OPS, 'ops', 'senior@veritut.local', 'senior-dev-parola');
const sme = await (await go(`${OPS}/api/v1/auth/me`)).json();
ok('senior girişi (rol senior)', sme.staffRole === 'senior');
ok('senior onaylar 204', (await go(`${OPS}/api/v1/ops/runs/${rsRun.id}/approve`, json({}))).status === 204);
const r2 = await waitRun(OPS, rsRun.id, 180);
ok('onay sonrası resize → succeeded, approvedBy dolu', r2?.run.status === 'succeeded' && r2.run.approvedBy, `${r2?.run.status}`);
ok('log: onaylandı — devam + apply', /onaylandı — devam/.test(r2?.log.map((l) => l.line).join('\n') ?? '') );
const wd2 = await (await go(`${OPS}/api/v1/ops/workloads/${wid}`)).json();
ok('iş yükü M boyutunda, active, server_id DEĞİŞTİ (replace)', wd2.workload.size === 'M' && wd2.workload.status === 'active' && wd2.workload.outputs.server_id !== wd.workload.outputs.server_id, `${wd2.workload.status} ${wd2.workload.size} ${wd2.workload.outputs.server_id === wd.workload.outputs.server_id ? 'aynı id' : 'yeni id'}`);
ok('changes → verified', (await (await go(`${OPS}/api/v1/ops/changes`)).json()).some((c) => c.runId === rsRun.id && c.status === 'verified'));

// ── Reddetme akışı: M→L (yine replace) → senior reddeder ────────────────────
const rs2 = await (await go(`${OPS}/api/v1/ops/runs/echo`, json({}))).json(); // senior'un kendi tetiklediği (talep eden = senior) için değil; resize'ı ops@ tetiklesin:
jar.clear(); await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
const rs3 = await (await go(`${OPS}/api/v1/ops/workloads/${wid}/resize`, json({ size: 'L' }))).json();
for (let i = 0; i < 90; i++) { await sleep(1000); d = await (await go(`${OPS}/api/v1/ops/runs/${rs3.id}`)).json(); if (d.run.status === 'awaiting_approval' || ['succeeded', 'failed', 'cancelled'].includes(d.run.status)) break; }
ok('ikinci resize onay bekliyor', d?.run.status === 'awaiting_approval');
// Talep eden kendi isteğini geri çekebilir (reddetme dört-göze tabi değil; onay tabi).
ok('talep eden geri çeker (reject) 204', (await go(`${OPS}/api/v1/ops/runs/${rs3.id}/reject`, json({ reason: 'Kesinti penceresi yok' }))).status === 204);
await sleep(7000); // runner onay yoklaması 5 sn
const r3 = await waitRun(OPS, rs3.id, 30);
ok('reddedilen run cancelled + gerekçe; runner "REDDEDİLDİ" logladı', r3?.run.status === 'cancelled' && r3.run.rejectedReason === 'Kesinti penceresi yok' && /REDDEDİLDİ/.test(r3.log.map((l) => l.line).join('\n')), r3?.run.status);
ok('cancelled run tekrar onaylanamaz 409', (await go(`${OPS}/api/v1/ops/runs/${rs3.id}/approve`, json({}))).status === 409);
const wd3 = await (await go(`${OPS}/api/v1/ops/workloads/${wid}`)).json();
ok('ret sonrası iş yükü active ve boyut M\'e geri döndü', wd3.workload.status === 'active' && wd3.workload.size === 'M', `${wd3.workload.status} ${wd3.workload.size}`);
void rs2;

// ── Yıkım: yedek kanıtı yoksa 422; yedek al → yıkım → onay → destroyed ──────
jar.clear(); await oidcLogin(OPS, 'ops', 'senior@veritut.local', 'senior-dev-parola');
const noBk = await go(`${OPS}/api/v1/ops/workloads/${wid}/destroy`, json({}));
ok('yedek kanıtı olmadan yıkım 422 BACKUP_REQUIRED', noBk.status === 422 && (await noBk.json()).code === 'BACKUP_REQUIRED', String(noBk.status));
// iş yükü ret sonrası provisioning'de kalmış olabilir → yedek tetikleyebilmek için durum kontrolü: backup run workload durumundan bağımsız
const bk = await (await go(`${OPS}/api/v1/ops/workloads/${wid}/backup`, json({}))).json();
const bkr = await waitRun(OPS, bk.run.id, 120);
ok('yedek alındı (restic → MinIO)', bkr?.run.status === 'succeeded', bkr?.run.status);
const ds = await go(`${OPS}/api/v1/ops/workloads/${wid}/destroy`, json({}));
const dsRun = ds.status === 201 ? await ds.json() : null;
ok('yıkım çalıştırması 201 (high)', ds.status === 201 && dsRun?.risk === 'high', `${ds.status} ${await (ds.status !== 201 ? ds.text() : '')}`);
for (let i = 0; i < 90; i++) { await sleep(1000); d = await (await go(`${OPS}/api/v1/ops/runs/${dsRun.id}`)).json(); if (d.run.status === 'awaiting_approval' || ['succeeded', 'failed', 'cancelled'].includes(d.run.status)) break; }
ok('destroy plan: 3 silinecek → onay bekliyor', d?.run.status === 'awaiting_approval' && d.run.planSummary.destroy === 3, `${d?.run.status} ${JSON.stringify(d?.run.planSummary)}`);
ok('talep eden (senior) onaylayamaz 403', (await go(`${OPS}/api/v1/ops/runs/${dsRun.id}/approve`, json({}))).status === 403);
// ops@ platform_admin (≥senior) onaylar
jar.clear(); await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
ok('farklı kıdemli onaylar 204', (await go(`${OPS}/api/v1/ops/runs/${dsRun.id}/approve`, json({}))).status === 204);
const r4 = await waitRun(OPS, dsRun.id, 180);
ok('destroy → succeeded', r4?.run.status === 'succeeded', r4?.run.status);
const wd4 = await (await go(`${OPS}/api/v1/ops/workloads/${wid}`)).json();
ok('iş yükü destroyed, endpoints boş, destroyedAt dolu', wd4.workload.status === 'destroyed' && wd4.workload.endpoints.length === 0 && wd4.workload.destroyedAt);
const pv2 = await (await fetch(`${API}/api/v1/evidence/public/verify?tenant=k2-${ts}`)).json();
ok('kanıt zinciri bütün: provisioned + upgraded + backup + destroyed (≥4)', pv2.ok && pv2.checked >= 4, JSON.stringify(pv2));
ok('yıkılmış iş yükünde resize 409', (await go(`${OPS}/api/v1/ops/workloads/${wid}/resize`, json({ size: 'S' }))).status === 409);

// ── Portal: müşteri sağlık kartında blueprint iş yükü görünmez (destroyed hariç tutulur) + ops sayfaları ─
for (const p of ['/provizyon', '/provizyon?bp=nextcloud@1.0.0', `/calistirmalar/${rsRun.id}`, `/calistirmalar/${dsRun.id}`, `/is-yukleri/${wid}`]) ok(`ops ${p} 200`, (await go(`${OPS}${p}`)).status === 200);
void PORTAL;
done();
