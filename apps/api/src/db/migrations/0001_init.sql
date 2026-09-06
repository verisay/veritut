-- VERITUT 0001 — çekirdek şema (uygulama planı §4.1, §4.3-4.6 kısmi, §4.8).
-- Kural: idempotent (IF NOT EXISTS), down migration yok, sıra atlanmaz.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

-- ── 4.1 Kimlik + kiracı ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'customer' CHECK (kind IN ('customer','internal','reseller')),
  parent_tenant_id UUID NULL REFERENCES tenants(id),  -- D7: Faz 4 bayi hiyerarşisi, gün 1 kolon
  residency_default TEXT NOT NULL DEFAULT 'TR' CHECK (residency_default IN ('TR','EU','US')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('onboarding','active','suspended','offboarded')),
  kc_realm TEXT NULL,
  billing_ref TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_tenants_updated ON tenants;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kc_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  last_login_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS tenant_members (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','technical','billing','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS tenant_members_user_idx ON tenant_members (user_id);

-- Opak oturum (D6): token'ın sha256'ı; Keycloak refresh/id token'ı sunucuda şifreli.
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  kc_refresh_enc TEXT NULL,
  kc_id_token_enc TEXT NULL,
  user_agent TEXT NULL,
  ip TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kc_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('operator','senior','platform_admin')),
  local_totp_enc TEXT NULL,          -- break-glass: yalnız tek hesapta dolu
  active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_email_idx ON staff (lower(email));
DROP TRIGGER IF EXISTS trg_staff_updated ON staff;
CREATE TRIGGER trg_staff_updated BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS staff_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  kc_refresh_enc TEXT NULL,
  kc_id_token_enc TEXT NULL,
  user_agent TEXT NULL,
  ip TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_sessions_staff_idx ON staff_sessions (staff_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  ip_allow TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON api_keys (tenant_id);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','technical','billing','viewer')),
  token_hash TEXT UNIQUE NOT NULL,
  invited_by UUID NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4.3 Tedarikçi ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS providers (
  code TEXT PRIMARY KEY CHECK (code IN ('hetzner','aws','gcp','cloudflare','trdc','mock')),
  name TEXT NOT NULL,
  partner_status TEXT NOT NULL DEFAULT 'none',
  exit_plan_doc TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

-- credentials_sealed: API'nin AÇAMADIĞI asimetrik zarf (D12) — yalnız runner çözer.
CREATE TABLE IF NOT EXISTS provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL REFERENCES providers(code),
  label TEXT NOT NULL,
  credentials_sealed TEXT NULL,
  key_version INT NOT NULL DEFAULT 1,
  regions TEXT[] NOT NULL DEFAULT '{}',
  residencies TEXT[] NOT NULL DEFAULT '{}',
  quota JSONB NOT NULL DEFAULT '{}'::jsonb,
  health TEXT NOT NULL DEFAULT 'unknown' CHECK (health IN ('ok','degraded','down','maintenance','unknown')),
  last_sync_at TIMESTAMPTZ NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_provider_accounts_updated ON provider_accounts;
CREATE TRIGGER trg_provider_accounts_updated BEFORE UPDATE ON provider_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4.4 İş yükü + çalıştırma (çekirdek; katalog/sipariş K3'te) ─────────────
CREATE TABLE IF NOT EXISTS workloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  product_slug TEXT NOT NULL DEFAULT 'legacy',
  blueprint_version TEXT NULL,
  residency TEXT NOT NULL CHECK (residency IN ('TR','EU','US')),
  provider_account_id UUID NULL REFERENCES provider_accounts(id),
  region TEXT NULL,
  size TEXT NULL,
  sla_tier TEXT NOT NULL DEFAULT 'std_9x5',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','provisioning','active','degraded','suspended','decommissioning','destroyed','failed')),
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  endpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_sealed TEXT NULL,
  monitoring_targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  cost_center TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS workloads_tenant_idx ON workloads (tenant_id);
DROP TRIGGER IF EXISTS trg_workloads_updated ON workloads;
CREATE TRIGGER trg_workloads_updated BEFORE UPDATE ON workloads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id),
  workload_id UUID NULL REFERENCES workloads(id),
  kind TEXT NOT NULL CHECK (kind IN ('provision','upgrade','resize','destroy','patch','rotate-secrets','drill','drift-plan','echo')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','awaiting_approval','succeeded','failed','cancelled')),
  risk TEXT NOT NULL DEFAULT 'low' CHECK (risk IN ('low','medium','high')),
  triggered_by_staff UUID NULL REFERENCES staff(id),
  triggered_by_user UUID NULL REFERENCES users(id),
  change_id UUID NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  exit_code INT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_workload_idx ON runs (workload_id);
CREATE INDEX IF NOT EXISTS runs_status_idx ON runs (status);
DROP TRIGGER IF EXISTS trg_runs_updated ON runs;
CREATE TRIGGER trg_runs_updated BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('validate','unseal','plan','apply','configure','verify','register','handoff')),
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','skipped')),
  summary TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  UNIQUE (run_id, step)
);

-- ── 4.5 Kanıt Defteri (D13) ───────────────────────────────────────────────
-- tenant_id NULL = platform düzeyi kanıt. seq kiracı bazlı; prev_hash zinciri.
CREATE TABLE IF NOT EXISTS evidence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id),
  seq BIGINT NOT NULL,
  kind TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT NOT NULL DEFAULT 'system',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  UNIQUE (tenant_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS evidence_platform_seq_idx ON evidence_events (seq) WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS evidence_tenant_kind_idx ON evidence_events (tenant_id, kind);

-- Append-only: UPDATE/DELETE DB seviyesinde reddedilir (uygulama hatası bile kanıtı bozamaz).
CREATE OR REPLACE FUNCTION evidence_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'evidence_events append-only: % yasak', TG_OP; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_evidence_immutable ON evidence_events;
CREATE TRIGGER trg_evidence_immutable BEFORE UPDATE OR DELETE ON evidence_events FOR EACH ROW EXECUTE FUNCTION evidence_immutable();

CREATE TABLE IF NOT EXISTS evidence_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id),
  period TEXT NOT NULL,                 -- 'YYYY-MM'
  last_seq BIGINT NOT NULL,
  anchor_hash TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_to TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, period)
);

-- ── 4.6 Gözlem — platform bileşenleri (status sayfası) ────────────────────
CREATE TABLE IF NOT EXISTS components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id),   -- NULL = platform bileşeni
  workload_id UUID NULL REFERENCES workloads(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  probe_url TEXT NULL,
  state TEXT NOT NULL DEFAULT 'unknown' CHECK (state IN ('ok','degraded','down','maintenance','unknown')),
  latency_ms INT NULL,
  checked_at TIMESTAMPTZ NULL,
  sort INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS components_platform_slug_idx ON components (slug) WHERE tenant_id IS NULL;

-- ── 4.8 Platform işletimi ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','staff','system','api_key','runner','worker')),
  actor_id TEXT NULL,
  tenant_id UUID NULL,
  action TEXT NOT NULL,
  subject_type TEXT NULL,
  subject_id TEXT NULL,
  before JSONB NULL,
  after JSONB NULL,
  ip TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_tenant_idx ON audit_log (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  signature_ok BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  note TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
