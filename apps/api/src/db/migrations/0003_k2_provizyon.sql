-- VERITUT 0003 — K2: provizyon motoru (plan, onay, kayıt, sır, değişiklik, sapma).
ALTER TABLE runs ADD COLUMN IF NOT EXISTS plan_summary JSONB NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS approved_by UUID NULL REFERENCES staff(id);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS rejected_reason TEXT NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 1;

ALTER TABLE workloads ADD COLUMN IF NOT EXISTS blueprint_slug TEXT NULL;
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS outputs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS last_run_id UUID NULL;
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ NULL;
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS destroyed_at TIMESTAMPTZ NULL;

-- Blueprint sır girdileri (D12): API mühürler, runner açar. key_version rotasyon için.
CREATE TABLE IF NOT EXISTS workload_secrets (
  workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_sealed TEXT NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workload_id, name)
);

-- Değişiklik kaydı (§4.4): yüksek risk = dört-göz; run ile bire bir bağ.
CREATE TABLE IF NOT EXISTS changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id),
  workload_id UUID NULL REFERENCES workloads(id),
  kind TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','executing','verified','rolled_back','rejected')),
  requested_by UUID NULL REFERENCES staff(id),
  approved_by UUID NULL REFERENCES staff(id),
  run_id UUID NULL REFERENCES runs(id),
  rollback_run_id UUID NULL REFERENCES runs(id),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_changes_updated ON changes;
CREATE TRIGGER trg_changes_updated BEFORE UPDATE ON changes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS changes_workload_idx ON changes (workload_id, created_at DESC);

CREATE TABLE IF NOT EXISTS drift_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
  run_id UUID NULL REFERENCES runs(id),
  diff JSONB NOT NULL,
  has_drift BOOLEAN NOT NULL,
  acknowledged_by UUID NULL REFERENCES staff(id),
  acknowledged_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drift_reports_workload_idx ON drift_reports (workload_id, created_at DESC);
