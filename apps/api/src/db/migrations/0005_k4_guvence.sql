-- VERITUT 0005 — K4: olay/SLA motoru, nöbet, tatbikat, sapma, belgeler, denetçi erişimi.
-- ── Alarm ve olay ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('firing','resolved')),
  severity TEXT NOT NULL DEFAULT 'warning',
  alertname TEXT NOT NULL,
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  annotations JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE SET NULL,
  workload_id UUID NULL REFERENCES workloads(id) ON DELETE SET NULL,
  incident_id UUID NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fingerprint, starts_at)
);
CREATE INDEX IF NOT EXISTS alerts_open_idx ON alerts (status, starts_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number SERIAL,
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE SET NULL,   -- NULL = platform olayı
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL CHECK (severity IN ('sev1','sev2','sev3','sev4')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','identified','monitoring','resolved','postmortem_done')),
  source TEXT NOT NULL DEFAULT 'alert' CHECK (source IN ('alert','manual','customer','probe')),
  customer_visible BOOLEAN NOT NULL DEFAULT false,
  sla_code TEXT NULL REFERENCES sla_tiers(code),
  /** SLA saati — plan §8.2. `clock_paused_s`: müşteri beklenirken duran süre. */
  response_due_at TIMESTAMPTZ NULL,
  resolve_due_at TIMESTAMPTZ NULL,
  responded_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  clock_paused_s INT NOT NULL DEFAULT 0,
  paused_at TIMESTAMPTZ NULL,
  response_breached BOOLEAN NOT NULL DEFAULT false,
  resolve_breached BOOLEAN NOT NULL DEFAULT false,
  escalated_at TIMESTAMPTZ NULL,
  assigned_staff_id UUID NULL REFERENCES staff(id),
  postmortem TEXT NULL,
  created_by UUID NULL REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_incidents_updated ON incidents;
CREATE TRIGGER trg_incidents_updated BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS incidents_open_idx ON incidents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS incidents_tenant_idx ON incidents (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS incident_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NULL,
  customer_visible BOOLEAN NOT NULL DEFAULT false,
  author TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incident_updates_idx ON incident_updates (incident_id, created_at);

CREATE TABLE IF NOT EXISTS incident_workloads (
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, workload_id)
);

CREATE TABLE IF NOT EXISTS maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workload_id UUID NULL REFERENCES workloads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  customer_visible BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_time_idx ON maintenance_windows (starts_at, ends_at);

-- ── Nöbet ve alarm kanalları ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oncall_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  escalation_level INT NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oncall_time_idx ON oncall_shifts (starts_at, ends_at);

CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('email','webhook','slack','teams','sms')),
  label TEXT NOT NULL,
  /** Hedef (URL/e-posta/telefon) AES-256-GCM ile şifreli (API göndermek için çözer; ops listede düz göremez). */
  target_sealed TEXT NOT NULL,
  target_hint TEXT NOT NULL DEFAULT '',
  events TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_channels_tenant_idx ON notification_channels (tenant_id, active);

-- ── SLA dönemleri ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sla_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workload_id UUID NULL REFERENCES workloads(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  sla_code TEXT NOT NULL REFERENCES sla_tiers(code),
  uptime_pct NUMERIC(6,3) NOT NULL DEFAULT 100,
  uptime_target NUMERIC(5,2) NOT NULL DEFAULT 99.50,
  downtime_min INT NOT NULL DEFAULT 0,
  maintenance_min INT NOT NULL DEFAULT 0,
  incidents INT NOT NULL DEFAULT 0,
  response_breaches INT NOT NULL DEFAULT 0,
  resolve_breaches INT NOT NULL DEFAULT 0,
  credit_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  credit_applied_at TIMESTAMPTZ NULL,
  report_key TEXT NULL,
  report_sha256 TEXT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workload_id, period)
);

-- ── Geri dönüş tatbikatı (D15) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restore_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
  backup_job_id UUID NULL REFERENCES backup_jobs(id) ON DELETE SET NULL,
  run_id UUID NULL REFERENCES runs(id),
  scheduled_for DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','running','passed','failed')),
  snapshot_id TEXT NULL,
  checksum_ok BOOLEAN NULL,
  app_check_ok BOOLEAN NULL,
  restored_bytes BIGINT NULL,
  duration_s INT NULL,
  error TEXT NULL,
  evidence_id UUID NULL REFERENCES evidence_events(id),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restore_drills_workload_idx ON restore_drills (workload_id, scheduled_for DESC);

-- ── Belgeler + denetçi erişimi ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('dpa','subprocessors','sla_report','evidence_bundle','terms')),
  period TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INT NOT NULL DEFAULT 0,
  generated_from JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, period, version)
);
CREATE INDEX IF NOT EXISTS documents_tenant_idx ON documents (tenant_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS evidence_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  from_seq BIGINT NOT NULL,
  to_seq BIGINT NOT NULL,
  anchor_hash TEXT NOT NULL,
  document_id UUID NULL REFERENCES documents(id) ON DELETE SET NULL,
  json_sha256 TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period)
);

CREATE TABLE IF NOT EXISTS auditor_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  scope TEXT[] NOT NULL DEFAULT '{evidence,sla,subprocessors}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TR resmî tatil takvimi (SLA 9x5 saatinde iş günü hesabı)
CREATE TABLE IF NOT EXISTS business_calendar (
  day DATE PRIMARY KEY,
  title TEXT NOT NULL,
  half_day BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE workloads ADD COLUMN IF NOT EXISTS drill_schedule TEXT NOT NULL DEFAULT 'monthly';
