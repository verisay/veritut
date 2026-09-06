import { Router } from 'express';
import type { Request, Response } from 'express';
import { STAFF_ROLES, type MeDto, type Realm, type StaffRole } from '@veritut/types';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redis } from '../redis.js';
import { buildAuthUrl, exchangeCode, logoutUrl, verifyIdToken } from '../lib/oidc.js';
import { PORTAL_COOKIE } from '../middleware/requireUser.js';
import { OPS_COOKIE } from '../middleware/requireStaff.js';
import {
  createSession,
  readStaffSession,
  readUserSession,
  revokeSession,
  upsertStaffFromClaims,
  upsertUserFromClaims,
} from '../services/auth.service.js';
import { listUserTenants } from '../services/tenant.service.js';
import { audit } from '../services/audit.service.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * OIDC oturum uçları (D6). Yüzey (portal/ops) realm'den türer; redirect_uri allow-list = env URL'leri.
 * Tarayıcıya Keycloak token'ı VERİLMEZ; opak çerez kesilir.
 */
export const authRouter: Router = Router();

function realmOf(v: unknown): Realm {
  return v === 'ops' ? 'ops' : 'musteri';
}
function surfaceUrl(realm: Realm): string {
  return realm === 'ops' ? env.OPS_URL : env.PORTAL_URL;
}
function cookieName(realm: Realm): string {
  return realm === 'ops' ? OPS_COOKIE : PORTAL_COOKIE;
}
function redirectUri(realm: Realm): string {
  return `${surfaceUrl(realm)}/api/v1/auth/callback`;
}
function safeNext(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : fallback;
}
function cookieOpts(realm: Realm) {
  const hours = realm === 'ops' ? env.SESSION_TTL_HOURS_OPS : env.SESSION_TTL_HOURS_PORTAL;
  return {
    httpOnly: true,
    secure: surfaceUrl(realm).startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: hours * 3600_000,
  };
}
function highestStaffRole(roles: unknown): StaffRole | null {
  if (!Array.isArray(roles)) return null;
  const have = roles.filter((r): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(String(r)));
  if (have.includes('platform_admin')) return 'platform_admin';
  if (have.includes('senior')) return 'senior';
  if (have.includes('operator')) return 'operator';
  return null;
}

authRouter.get('/login', async (req, res, next) => {
  try {
    const realm = realmOf(req.query['realm']);
    const next_ = safeNext(req.query['next'], realm === 'ops' ? '/' : '/panel');
    const start = await buildAuthUrl(realm, redirectUri(realm));
    await redis.set(
      `oidc:state:${start.state}`,
      JSON.stringify({ realm, nonce: start.nonce, codeVerifier: start.codeVerifier, next: next_ }),
      'EX',
      600,
    );
    res.redirect(302, start.url);
  } catch (e) {
    next(e);
  }
});

authRouter.get('/callback', async (req, res, next) => {
  try {
    const code = String(req.query['code'] ?? '');
    const state = String(req.query['state'] ?? '');
    if (!code || !state) throw ApiError.badRequest('code/state eksik');
    const raw = await redis.getdel(`oidc:state:${state}`);
    if (!raw) throw ApiError.badRequest('Oturum başlatma süresi doldu — tekrar deneyin');
    const st = JSON.parse(raw) as { realm: Realm; nonce: string; codeVerifier: string; next: string };
    const tokens = await exchangeCode(st.realm, code, redirectUri(st.realm), st.codeVerifier);
    const claims = await verifyIdToken(st.realm, tokens.id_token, st.nonce);
    const meta = { userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null };

    let principalId: string;
    if (st.realm === 'ops') {
      const s = await upsertStaffFromClaims(claims, highestStaffRole((claims as { roles?: unknown }).roles));
      if (!s) throw ApiError.forbidden('Personel hesabı pasif');
      principalId = s.id;
      await audit({ actorType: 'staff', actorId: s.id, action: 'auth.login', ip: meta.ip });
    } else {
      const u = await upsertUserFromClaims(claims);
      principalId = u.id;
      await audit({ actorType: 'user', actorId: u.id, action: 'auth.login', ip: meta.ip });
    }
    const token = await createSession(st.realm, principalId, tokens, meta);
    res.cookie(cookieName(st.realm), token, cookieOpts(st.realm));
    res.redirect(302, `${surfaceUrl(st.realm)}${st.next}`);
  } catch (e) {
    logger.warn({ err: e }, 'oidc callback başarısız');
    next(e);
  }
});

async function resolveMe(req: Request): Promise<MeDto | null> {
  const cookies = req.cookies as Record<string, string | undefined>;
  if (cookies[OPS_COOKIE]) {
    const s = await readStaffSession(cookies[OPS_COOKIE]);
    if (s) return { realm: 'ops', id: s.id, email: s.email, displayName: s.displayName, tenants: [], staffRole: s.role };
  }
  if (cookies[PORTAL_COOKIE]) {
    const u = await readUserSession(cookies[PORTAL_COOKIE]);
    if (u) {
      const tenants = await listUserTenants(u.id);
      return {
        realm: 'musteri',
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        tenants: tenants.map((t) => ({ id: t.id, slug: t.slug, name: t.name, role: t.role as MeDto['tenants'][number]['role'] })),
      };
    }
  }
  return null;
}

authRouter.get('/me', async (req, res: Response, next) => {
  try {
    const me = await resolveMe(req);
    if (!me) throw ApiError.unauthorized();
    res.json(me);
  } catch (e) {
    next(e);
  }
});

authRouter.get('/logout', async (req, res, next) => {
  try {
    const realm = realmOf(req.query['realm']);
    const token = (req.cookies as Record<string, string | undefined>)[cookieName(realm)];
    res.clearCookie(cookieName(realm), { path: '/' });
    const idToken = token ? await revokeSession(realm, token) : null;
    const back = realm === 'ops' ? `${env.OPS_URL}/giris` : `${env.PORTAL_URL}/`;
    res.redirect(302, await logoutUrl(realm, idToken, back));
  } catch (e) {
    next(e);
  }
});
