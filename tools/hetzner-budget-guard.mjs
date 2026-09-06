#!/usr/bin/env node
/**
 * Gece Hetzner entegrasyon testi için bütçe/artık koruması (plan §15).
 *  - `check`: veritut etiketli kaynakları listeler; aylık tahmin HCLOUD_BUDGET_EUR'u aşarsa exit 2.
 *  - `sweep`: `managed_by=veritut` + `veritut_test=1` etiketli TÜM kaynakları siler (test artıkları). Prod etiketine dokunmaz.
 * Kullanım: HCLOUD_TOKEN=… node tools/hetzner-budget-guard.mjs check|sweep
 */
const token = process.env.HCLOUD_TOKEN;
const budget = Number(process.env.HCLOUD_BUDGET_EUR ?? 20);
const mode = process.argv[2] ?? 'check';
if (!token) { console.error('HCLOUD_TOKEN yok'); process.exit(1); }
const hc = async (path, init = {}) => {
  const res = await fetch(`https://api.hetzner.cloud/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!res.ok && res.status !== 404) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};
const sel = mode === 'sweep' ? 'managed_by=veritut,veritut_test=1' : 'managed_by=veritut';
const [servers, volumes, fws, ips, pricing] = await Promise.all([
  hc(`/servers?label_selector=${encodeURIComponent(sel)}&per_page=50`), hc(`/volumes?label_selector=${encodeURIComponent(sel)}&per_page=50`),
  hc(`/firewalls?label_selector=${encodeURIComponent(sel)}&per_page=50`), hc(`/primary_ips?label_selector=${encodeURIComponent(sel)}&per_page=50`), hc('/pricing'),
]);
let est = 0;
for (const s of servers.servers) { const t = pricing.pricing.server_types.find((x) => x.name === s.server_type.name); est += Number(t?.prices.find((p) => p.location === s.datacenter.location.name)?.price_monthly.gross ?? 0); }
for (const v of volumes.volumes) est += v.size * Number(pricing.pricing.volume.price_per_gb_month.gross);
console.log(`${servers.servers.length} sunucu, ${volumes.volumes.length} volume, ${fws.firewalls.length} firewall, ${ips.primary_ips.length} ip · aylık tahmin ${est.toFixed(2)} € (bütçe ${budget} €)`);
if (mode === 'check') { if (est > budget) { console.error('BÜTÇE AŞILDI — provision durduruldu'); process.exit(2); } process.exit(0); }
for (const s of servers.servers) { await hc(`/servers/${s.id}`, { method: 'DELETE' }); console.log(`silindi server ${s.name}`); }
await new Promise((r) => setTimeout(r, 15000));
for (const v of volumes.volumes) { await hc(`/volumes/${v.id}`, { method: 'DELETE' }); console.log(`silindi volume ${v.name}`); }
for (const f of fws.firewalls) { await hc(`/firewalls/${f.id}`, { method: 'DELETE' }); console.log(`silindi firewall ${f.name}`); }
for (const ip of ips.primary_ips) { await hc(`/primary_ips/${ip.id}`, { method: 'DELETE' }); console.log(`silindi ip ${ip.name}`); }
const left = await hc(`/servers?label_selector=${encodeURIComponent(sel)}`);
if (left.servers.length > 0) { console.error('artık kaynak kaldı'); process.exit(3); }
