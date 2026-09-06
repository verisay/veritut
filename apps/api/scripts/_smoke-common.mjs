import https from 'node:https';
import { randomBytes } from 'node:crypto';

export const PORTAL = process.env.PORTAL_URL ?? 'https://vt-portal.dev-fethi.entra.net';
export const OPS = process.env.OPS_URL ?? 'https://vt-ops.dev-fethi.entra.net';
export const STATUS = process.env.STATUS_URL ?? 'https://vt-status.dev-fethi.entra.net';
export const API = process.env.API_PUBLIC_URL ?? 'https://vt-api.dev-fethi.entra.net';
export { https, randomBytes };

export const counters = { pass: 0, fail: 0 };
export const ok = (name, cond, extra = '') => { if (cond) { counters.pass++; console.log(`  ✓ ${name}`); } else { counters.fail++; console.log(`  ✗ ${name} ${extra}`); } };

/** Basit çerez kavanozu (host bazlı). */
export class Jar {
  constructor() { this.m = new Map(); }
  store(host, res) {
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); const jar = this.m.get(host) ?? new Map(); jar.set(k.trim(), v.join('=')); this.m.set(host, jar); }
  }
  /** Kullanıcı değiştirmeden önce TÜM host'ların çerezleri (Keycloak SSO çerezi dahil) silinir. */
  clear() { this.m.clear(); }
  header(host) { const jar = this.m.get(host); return jar ? [...jar].map(([k, v]) => `${k}=${v}`).join('; ') : ''; }
}
export const jar = new Jar();
export async function go(url, init = {}) {
  const host = new URL(url).host;
  const headers = new Headers(init.headers ?? {});
  const c = jar.header(host); if (c) headers.set('cookie', c);
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  jar.store(host, res);
  return res;
}
/** Yönlendirmeleri elle izle (çerezleri host başına sakla). */
export async function follow(url, max = 8) {
  let res = await go(url);
  let n = 0;
  while ([301, 302, 303].includes(res.status) && n++ < max) {
    const loc = new URL(res.headers.get('location'), url).toString();
    res = await go(loc);
    res.finalUrl = loc;
  }
  return res;
}

/** Keycloak giriş: login sayfasındaki form action'ına kullanıcı adı/parola POST'u. */
export async function oidcLogin(surface, realm, username, password) {
  const start = await follow(`${surface}/api/v1/auth/login?realm=${realm}`);
  const html = await start.text();
  const m = /action="([^"]+)"/.exec(html);
  if (!m) throw new Error(`Keycloak login formu bulunamadı (${start.status}) — ${html.slice(0, 200)}`);
  const action = m[1].replace(/&amp;/g, '&');
  const body = new URLSearchParams({ username, password, credentialId: '' });
  let res = await go(action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  // Keycloak → callback (API) → yüzey
  let n = 0;
  while ([301, 302, 303].includes(res.status) && n++ < 8) {
    const loc = new URL(res.headers.get('location'), action).toString();
    res = await go(loc);
    res.finalUrl = loc;
  }
  return res;
}


export function done() {
  console.log(`\n${counters.pass} geçti, ${counters.fail} kaldı`);
  process.exit(counters.fail === 0 ? 0 : 1);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitRun(surface, id, tries = 60) {
  let d = null;
  for (let i = 0; i < tries; i++) {
    await sleep(1000);
    d = await (await go(`${surface}/api/v1/ops/runs/${id}`)).json();
    if (['succeeded', 'failed', 'cancelled'].includes(d.run.status)) break;
  }
  return d;
}
export const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
