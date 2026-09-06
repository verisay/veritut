-- VERITUT 0002 — K1: envanter, yedek/kanıt, maliyet/marj, bildirim, erişim oturumu, probe sonuçları.
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_kind_check;
ALTER TABLE runs ADD CONSTRAINT runs_kind_check CHECK (kind IN ('provision','upgrade','resize','destroy','patch','rotate-secrets','drill','drift-plan','provider-sync','backup','echo'));
ALTER TABLE runs ADD COLUMN IF NOT EXISTS provider_account_id UUID NULL REFERENCES provider_accounts(id);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE workloads ADD COLUMN IF NOT EXISTS provider_code TEXT NULL REFERENCES providers(code);
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS probe_url TEXT NULL;

-- ── Tedarikçi envanteri (§4.3) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id UUID NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('server','volume','ip','load_balancer','snapshot','bucket','other')),
  name TEXT NOT NULL,
  region TEXT NULL,
  residency TEXT NULL CHECK (residency IN ('TR','EU','US')),
  status TEXT NOT NULL DEFAULT '',
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  monthly_cost_estimate NUMERIC(12,2) NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  matched_workload_id UUID NULL REFERENCES workloads(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gone_at TIMESTAMPTZ NULL,
  UNIQUE (provider_account_id, external_id)
);
CREATE INDEX IF NOT EXISTS provider_inventory_unmatched_idx ON provider_inventory (matched_workload_id) WHERE matched_workload_id IS NULL AND gone_at IS NULL;

-- ── Maliyet + gelir (§4.7) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_cost_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id UUID NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                     -- 'YYYY-MM'
  resource_ref TEXT NOT NULL,               -- external_id veya fatura satır anahtarı
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  source TEXT NOT NULL CHECK (source IN ('estimate','invoice_csv','api')),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_account_id, period, resource_ref, source)
);
CREATE TABLE IF NOT EXISTS cost_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  method TEXT NOT NULL CHECK (method IN ('direct','shared','estimate')),
  source_line_id UUID NULL REFERENCES provider_cost_lines(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workload_id, period, source_line_id)
);
-- Elle gelir girişi — K3'te faturalama aynası (usage_records/subscriptions) devralır.
CREATE TABLE IF NOT EXISTS workload_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  note TEXT NULL,
  entered_by UUID NULL REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workload_id, period)
);
DROP TRIGGER IF EXISTS trg_workload_revenue_updated ON workload_revenue;
CREATE TRIGGER trg_workload_revenue_updated BEFORE UPDATE ON workload_revenue FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Döviz kuru (marj raporunda tek para birimine çevirmek için; ops elle girer, K3'te TCMB ingest)
CREATE TABLE IF NOT EXISTS fx_rates (
  period TEXT NOT NULL,
  currency TEXT NOT NULL,
  to_try NUMERIC(12,4) NOT NULL,
  PRIMARY KEY (period, currency)
);

-- ── Yedek (§4.5) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  provider_account_id UUID NULL REFERENCES provider_accounts(id),
  provider_code TEXT NOT NULL REFERENCES providers(code),
  repo_url TEXT NOT NULL,                   -- restic repo (s3:…, sftp:…, /path)
  residency TEXT NOT NULL CHECK (residency IN ('TR','EU','US')),
  credentials_sealed TEXT NULL,             -- RESTIC_PASSWORD + S3 anahtarları (D12)
  key_version INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backup_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_id UUID NOT NULL UNIQUE REFERENCES workloads(id) ON DELETE CASCADE,
  schedule TEXT NOT NULL DEFAULT '0 2 * * *',
  retention TEXT NOT NULL DEFAULT '--keep-daily 7 --keep-weekly 4 --keep-monthly 6',
  primary_repo_id UUID NULL REFERENCES backup_repos(id),
  offsite_repo_id UUID NULL REFERENCES backup_repos(id),
  paths TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_backup_policies_updated ON backup_policies;
CREATE TRIGGER trg_backup_policies_updated BEFORE UPDATE ON backup_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE IF NOT EXISTS backup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
  repo_id UUID NULL REFERENCES backup_repos(id),
  run_id UUID NULL REFERENCES runs(id),
  status TEXT NOT NULL CHECK (status IN ('scheduled','running','completed','failed')),
  snapshot_id TEXT NULL,
  bytes BIGINT NULL,
  files INT NULL,
  duration_s INT NULL,
  error TEXT NULL,
  evidence_id UUID NULL REFERENCES evidence_events(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS backup_jobs_workload_idx ON backup_jobs (workload_id, started_at DESC);

-- ── Erişim oturumları (bastion ingest → access.session kanıtı) ───────────
CREATE TABLE IF NOT EXISTS access_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id),
  workload_id UUID NULL REFERENCES workloads(id),
  staff_id UUID NULL REFERENCES staff(id),
  actor_label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'bastion',
  target TEXT NOT NULL,
  reason TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  recording_ref TEXT NULL,
  evidence_id UUID NULL REFERENCES evidence_events(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_sessions_workload_idx ON access_sessions (workload_id, started_at DESC);

-- ── Probe sonuçları (uptime 30g) — 90 gün saklama, cron siler ───────────
CREATE TABLE IF NOT EXISTS probe_results (
  id BIGSERIAL PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('ok','degraded','down','maintenance','unknown')),
  latency_ms INT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS probe_results_component_time_idx ON probe_results (component_id, checked_at DESC);

-- ── Bildirimler (in-app; e-posta worker notify kuyruğu) ──────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id UUID NULL REFERENCES staff(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NULL,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_staff_idx ON notifications (staff_id, read_at, created_at DESC);
