#!/usr/bin/env node
/**
 * K0 kabul smoke'u — Docker filo üzerinden (HTTPS dev host'ları). Container içinden veya host'tan koşar.
 *   node apps/api/scripts/smoke-k0.mjs
 * Ortam: PORTAL_URL, OPS_URL, STATUS_URL, KC_PUBLIC_URL (infra/.env) — yoksa dev varsayılanları.
 * Kimlikler: realm import'undaki dev kullanıcıları (musteri@veritut.local / ops@veritut.local).
 */
import { API, OPS, PORTAL, STATUS, https, randomBytes, ok, jar, go, follow, oidcLogin, done } from './_smoke-common.mjs';
console.log('K0 smoke — VERITUT');

// 1. Sağlık + fail-closed + public verify
{
  const h = await (await fetch(`${API}/api/v1/health`)).json();
  ok('health ok (db+redis+7 kuyruk)', h.status === 'ok' && Object.keys(h.queues).length === 7, JSON.stringify(h));
  ok('haritasız segment 403 (fail-closed)', (await fetch(`${API}/api/v1/olmayan-segment`)).status === 403);
  ok('yetkisiz /tenants/mine 401', (await fetch(`${API}/api/v1/tenants/mine`)).status === 401);
  ok('yetkisiz /ops/overview 401', (await fetch(`${API}/api/v1/ops/overview`)).status === 401);
  ok('iç uç token\'sız 403', (await fetch(`${API}/api/v1/internal/components`)).status === 403);
  const pv = await fetch(`${API}/api/v1/evidence/public/verify?tenant=platform`);
  ok('public verify (platform) 200', pv.status === 200);
  ok('public verify bilinmeyen kiracı 404', (await fetch(`${API}/api/v1/evidence/public/verify?tenant=yok-boyle`)).status === 404);
}

// 2. Portal OIDC (musteri realm)
let tenantId = null;
{
  const res = await oidcLogin(PORTAL, 'musteri', 'musteri@veritut.local', 'musteri-dev-parola');
  ok('portal OIDC girişi → /panel', res.finalUrl?.startsWith(`${PORTAL}/panel`) && res.status === 200, `${res.status} ${res.finalUrl}`);
  const me = await go(`${PORTAL}/api/v1/auth/me`);
  const meJ = me.status === 200 ? await me.json() : null;
  ok('auth/me realm=musteri', meJ?.realm === 'musteri' && meJ.email === 'musteri@veritut.local');
  const slug = `smoke-${Date.now().toString(36)}`;
  const ct = await go(`${PORTAL}/api/v1/tenants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Smoke Kiracı', slug, residencyDefault: 'TR' }) });
  const tj = ct.status === 201 ? await ct.json() : null; tenantId = tj?.id ?? null;
  ok('kiracı oluştur 201 (owner)', ct.status === 201 && !!tenantId);
  const bad = await go(`${PORTAL}/api/v1/tenants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x', slug: 'Büyük Harf' }) });
  ok('geçersiz slug 422', bad.status === 422);
  const cur = await go(`${PORTAL}/api/v1/tenants/current`, { headers: { 'x-tenant-id': tenantId ?? '' } });
  ok('tenants/current (X-Tenant-Id) 200 + myRole owner', cur.status === 200 && (await cur.json()).myRole === 'owner');
  // İzolasyon: üye olunmayan kiracı → 404 (403 değil), bozuk UUID → 400
  const other = await go(`${PORTAL}/api/v1/tenants/current`, { headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' } });
  ok('üye olunmayan kiracı 404 (varlık sızmaz)', other.status === 404, String(other.status));
  ok('bozuk X-Tenant-Id 400', (await go(`${PORTAL}/api/v1/tenants/current`, { headers: { 'x-tenant-id': "' or 1=1" } })).status === 400);
  const ev = await go(`${PORTAL}/api/v1/evidence/verify`, { headers: { 'x-tenant-id': tenantId ?? '' } });
  ok('kiracı kanıt zinciri boş → ok', ev.status === 200 && (await ev.json()).ok === true);
  ok('portal /panel oturumlu 200', (await go(`${PORTAL}/panel`)).status === 200);
  ok('portal /panel/kanit 200', (await go(`${PORTAL}/panel/kanit`)).status === 200);
}

// 3. Ops OIDC (ops realm) + echo çalıştırması + kanıt
{
  ok('ops çerezi olmadan /ops 401', (await fetch(`${OPS}/api/v1/ops/overview`)).status === 401);
  const res = await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
  ok('ops OIDC girişi → /', res.finalUrl === `${OPS}/` && res.status === 200, `${res.status} ${res.finalUrl}`);
  const me = await go(`${OPS}/api/v1/auth/me`); const meJ = me.status === 200 ? await me.json() : null;
  ok('auth/me realm=ops, rol platform_admin (Keycloak realm rolünden)', meJ?.realm === 'ops' && meJ.staffRole === 'platform_admin', JSON.stringify(meJ));
  // Portal çerezi ops uçlarını açmaz (iki kimlik karışmaz)
  const cross = await fetch(`${OPS}/api/v1/ops/overview`, { headers: { cookie: jar.header(new URL(PORTAL).host) } });
  ok('portal çerezi ile /ops 401 (kimlikler karışmaz)', cross.status === 401);

  const run = await go(`${OPS}/api/v1/ops/runs/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const rj = run.status === 201 ? await run.json() : null;
  ok('echo çalıştırması 201', run.status === 201 && rj?.status === 'queued');
  let detail = null;
  for (let i = 0; i < 30 && rj; i++) {
    await new Promise((r) => setTimeout(r, 700));
    detail = await (await go(`${OPS}/api/v1/ops/runs/${rj.id}`)).json();
    if (detail.run.status === 'succeeded' || detail.run.status === 'failed') break;
  }
  ok('runner echo → succeeded (queued→running→succeeded)', detail?.run.status === 'succeeded', detail?.run.status);
  ok('8 adım raporlandı, hepsi succeeded', detail?.steps.length === 8 && detail.steps.every((s) => s.status === 'succeeded'));
  ok('canlı log Redis stream\'de (≥10 satır)', (detail?.log.length ?? 0) >= 10, String(detail?.log.length));

  const demo = await go(`${OPS}/api/v1/ops/evidence/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'patch.applied', note: 'smoke' }) });
  ok('platform kanıt olayı 201', demo.status === 201);
  const demo2 = await go(`${OPS}/api/v1/ops/evidence/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'backup.completed', note: 'smoke-2' }) });
  const d2 = demo2.status === 201 ? await demo2.json() : null;
  const pe = await (await go(`${OPS}/api/v1/ops/evidence/platform`)).json();
  ok('platform zinciri bütün (verdict.ok) ve seq artıyor', pe.verdict.ok === true && pe.verdict.checked >= 2 && pe.events[0].seq === d2?.seq);
  const pub = await (await fetch(`${API}/api/v1/evidence/public/verify?tenant=platform`)).json();
  ok('public verify lastHash == son olay hash', pub.lastHash === d2?.hash);
  ok('geçersiz kanıt türü 422 (kapalı sözlük)', (await go(`${OPS}/api/v1/ops/evidence/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'uydurma.olay' }) })).status === 422);
  // WS canlı log — bağımsız istemci (Node `https` upgrade + minimal frame ayrıştırma; `ws` paketi gerekmez).
  {
    const wsGet = (cookie) => new Promise((resolve) => {
      const u = new URL(`${OPS}/api/v1/ws/runs/${rj?.id}`);
      const req = https.request({ host: u.host, path: u.pathname, method: 'GET', headers: {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'), ...(cookie ? { Cookie: cookie } : {}) } });
      const frames = [];
      const done = (v) => { clearTimeout(timer); resolve(v); };
      const timer = setTimeout(() => done({ status: 'timeout', frames }), 5000);
      req.on('response', (res) => done({ status: res.statusCode, frames }));
      req.on('upgrade', (_res, socket) => {
        let buf = Buffer.alloc(0);
        socket.on('data', (d) => {
          buf = Buffer.concat([buf, d]);
          for (;;) {
            if (buf.length < 2) break;
            const op = buf[0] & 0x0f; let len = buf[1] & 0x7f; let off = 2;
            if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + len) break;
            if (op === 1) frames.push(JSON.parse(buf.subarray(off, off + len).toString('utf8')));
            buf = buf.subarray(off + len);
            if (frames.length >= 10) { socket.destroy(); done({ status: 101, frames }); return; }
          }
        });
        socket.on('close', () => done({ status: 101, frames }));
      });
      req.on('error', (e) => done({ status: `error ${e.message}`, frames }));
      req.end();
    });
    const auth = await wsGet(jar.header(new URL(OPS).host));
    ok('WS /ws/runs/:id ops çerezi ile ≥10 log satırı', auth.status === 101 && auth.frames.length >= 10 && auth.frames.every((l) => l.type === 'log'), `${auth.status} ${auth.frames.length}`);
    const anon = await wsGet('');
    ok('WS çerezsiz 401', anon.status === 401, String(anon.status));
  }
  ok('ops / oturumlu 200', (await go(`${OPS}/`)).status === 200);
  ok('ops /calistirmalar/<id> 200', (await go(`${OPS}/calistirmalar/${rj?.id}`)).status === 200);
  ok('ops /kanit 200', (await go(`${OPS}/kanit`)).status === 200);
}

// 4. Status sayfası
{
  const s = await fetch(`${STATUS}/`); const html = await s.text();
  ok('status / 200 ve bileşen listesi render', s.status === 200 && html.includes('Müşteri portalı'));
  ok('status bilinmeyen kiracı 404', (await fetch(`${STATUS}/yok-boyle-kiraci`)).status === 404);
}

done();
