import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Realm } from '@veritut/types';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * OIDC Authorization Code + PKCE — `jose` + fetch ile açık uygulama (docs/kararlar.md #3).
 * İki taban: tarayıcı PUBLIC Keycloak'a gider; API token/JWKS'i İÇ ağdan çeker (hairpin).
 * `iss` doğrulaması public issuer ile yapılır (Keycloak KC_HOSTNAME = public).
 */
interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint: string;
}

interface RealmConfig {
  realm: Realm;
  realmName: string;
  clientId: string;
  clientSecret: string;
  discovery: Discovery;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

const cache = new Map<Realm, RealmConfig>();

function realmName(realm: Realm): string {
  return realm === 'ops' ? env.KC_REALM_OPS : env.KC_REALM_MUSTERI;
}

/** İç URL'i public'e/public'i içe çevirir (aynı path). */
function toInternal(url: string): string {
  return url.replace(env.KC_PUBLIC_URL, env.KC_INTERNAL_URL);
}

export async function getRealm(realm: Realm): Promise<RealmConfig> {
  const hit = cache.get(realm);
  if (hit) return hit;
  const name = realmName(realm);
  const res = await fetch(`${env.KC_INTERNAL_URL}/realms/${name}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery başarısız (${realm}): ${res.status}`);
  const d = (await res.json()) as Discovery;
  // Keycloak public hostname ile yapılandırıldığında issuer public gelir; gelmezse zorla.
  const publicIssuer = `${env.KC_PUBLIC_URL}/realms/${name}`;
  if (d.issuer !== publicIssuer) {
    logger.warn({ got: d.issuer, expected: publicIssuer }, 'OIDC issuer public değil — KC_HOSTNAME kontrol edin');
  }
  const cfg: RealmConfig = {
    realm,
    realmName: name,
    clientId: realm === 'ops' ? env.OIDC_OPS_CLIENT_ID : env.OIDC_MUSTERI_CLIENT_ID,
    clientSecret: realm === 'ops' ? env.OIDC_OPS_CLIENT_SECRET : env.OIDC_MUSTERI_CLIENT_SECRET,
    discovery: { ...d, issuer: publicIssuer },
    jwks: createRemoteJWKSet(new URL(toInternal(d.jwks_uri))),
  };
  cache.set(realm, cfg);
  return cfg;
}

export interface AuthStart {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function buildAuthUrl(realm: Realm, redirectUri: string): Promise<AuthStart> {
  const cfg = await getRealm(realm);
  const state = randomBytes(16).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const u = new URL(cfg.discovery.authorization_endpoint);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid profile email');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return { url: u.toString(), state, nonce, codeVerifier };
}

export interface TokenSet {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function exchangeCode(realm: Realm, code: string, redirectUri: string, codeVerifier: string): Promise<TokenSet> {
  const cfg = await getRealm(realm);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code_verifier: codeVerifier,
  });
  const res = await fetch(toInternal(cfg.discovery.token_endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenSet;
}

export interface IdClaims extends JWTPayload {
  email?: string;
  name?: string;
  preferred_username?: string;
  nonce?: string;
  sid?: string;
}

export async function verifyIdToken(realm: Realm, idToken: string, expectedNonce: string): Promise<IdClaims> {
  const cfg = await getRealm(realm);
  const { payload } = await jwtVerify(idToken, cfg.jwks, { issuer: cfg.discovery.issuer, audience: cfg.clientId });
  const claims = payload as IdClaims;
  if (claims.nonce !== expectedNonce) throw new Error('nonce uyuşmuyor');
  if (!claims.sub) throw new Error('sub yok');
  return claims;
}

export async function logoutUrl(realm: Realm, idToken: string | null, postLogoutRedirect: string): Promise<string> {
  const cfg = await getRealm(realm);
  const u = new URL(cfg.discovery.end_session_endpoint);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
  if (idToken) u.searchParams.set('id_token_hint', idToken);
  return u.toString();
}
