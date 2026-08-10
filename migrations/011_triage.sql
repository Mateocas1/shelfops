CREATE TABLE triage_rule_versions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0), effective_at timestamptz NOT NULL DEFAULT transaction_timestamp(), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, organization_id), UNIQUE (organization_id, version)
);
CREATE INDEX triage_rule_versions_effective_idx ON triage_rule_versions (organization_id, effective_at DESC, version DESC);

CREATE TABLE triage_rules (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, rule_version_id uuid NOT NULL,
  identifier text NOT NULL CHECK (btrim(identifier) <> ''), priority integer NOT NULL CHECK (priority > 0),
  store_id uuid, sector_id uuid, location_id uuid, product_id uuid, category_key text, severity_key text,
  assignee_strategy text NOT NULL CHECK (assignee_strategy = 'single-eligible'), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, organization_id), UNIQUE (id, organization_id, rule_version_id, identifier), UNIQUE (rule_version_id, identifier),
  FOREIGN KEY (rule_version_id, organization_id) REFERENCES triage_rule_versions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (sector_id, organization_id, store_id) REFERENCES sectors(id, organization_id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id, organization_id, store_id, sector_id) REFERENCES locations(id, organization_id, store_id, sector_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, organization_id) REFERENCES products(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (category_key, organization_id) REFERENCES categories(key, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (severity_key, organization_id) REFERENCES severities(key, organization_id) ON DELETE RESTRICT,
  CHECK (sector_id IS NULL OR store_id IS NOT NULL), CHECK (location_id IS NULL OR sector_id IS NOT NULL)
);
CREATE INDEX triage_rules_evaluation_order_idx ON triage_rules (organization_id, rule_version_id, priority, id);

CREATE TABLE triage_evaluations (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, incident_id uuid NOT NULL, incident_version integer NOT NULL CHECK (incident_version > 0),
  rule_version_id uuid NOT NULL, rule_id uuid, rule_identifier text NOT NULL CHECK (btrim(rule_identifier) <> ''),
  inputs jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'object'), suggested jsonb NOT NULL CHECK (jsonb_typeof(suggested) = 'object'), explanation jsonb NOT NULL CHECK (jsonb_typeof(explanation) = 'object'),
  action_correlation_id text NOT NULL CHECK (btrim(action_correlation_id) <> ''), evaluated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, organization_id), UNIQUE (id, organization_id, incident_id), UNIQUE (incident_id, incident_version),
  FOREIGN KEY (incident_id, organization_id) REFERENCES incidents(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (rule_version_id, organization_id) REFERENCES triage_rule_versions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (rule_id, organization_id, rule_version_id, rule_identifier) REFERENCES triage_rules(id, organization_id, rule_version_id, identifier) ON DELETE RESTRICT,
  CHECK ((rule_id IS NULL AND rule_identifier = 'manual-no-match') OR (rule_id IS NOT NULL AND rule_identifier <> 'manual-no-match'))
);
CREATE INDEX triage_evaluations_incident_order_idx ON triage_evaluations (organization_id, incident_id, incident_version DESC, id);

CREATE TABLE triage_decision_sets (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, incident_id uuid NOT NULL, evaluation_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0), complete boolean NOT NULL, action_correlation_id text NOT NULL CHECK (btrim(action_correlation_id) <> ''), decided_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, organization_id), UNIQUE (id, organization_id, incident_id), UNIQUE (evaluation_id, sequence),
  FOREIGN KEY (incident_id, organization_id) REFERENCES incidents(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (evaluation_id, organization_id, incident_id) REFERENCES triage_evaluations(id, organization_id, incident_id) ON DELETE RESTRICT
);

CREATE TABLE triage_decision_items (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, decision_set_id uuid NOT NULL,
  field text NOT NULL CHECK (field IN ('category','severity','assignee')), disposition text NOT NULL CHECK (disposition IN ('confirmed','corrected','manual')),
  value_text text, value_user_id uuid, reason text CHECK (reason IS NULL OR btrim(reason) <> ''), actor_user_id uuid NOT NULL,
  action_correlation_id text NOT NULL CHECK (btrim(action_correlation_id) <> ''), decided_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, organization_id), UNIQUE (decision_set_id, field),
  FOREIGN KEY (decision_set_id, organization_id) REFERENCES triage_decision_sets(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (value_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT,
  CHECK ((field IN ('category','severity') AND value_text IS NOT NULL AND btrim(value_text) <> '' AND value_user_id IS NULL) OR (field = 'assignee' AND value_text IS NULL AND value_user_id IS NOT NULL))
);

CREATE TABLE triage_idempotency_outcomes (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, principal_id uuid NOT NULL, api_major text NOT NULL CHECK (api_major = 'v1'), action text NOT NULL CHECK (btrim(action) <> ''), incident_id uuid NOT NULL,
  key text NOT NULL CHECK (btrim(key) <> ''), request_hash text NOT NULL CHECK (btrim(request_hash) <> ''), outcome jsonb NOT NULL CHECK (jsonb_typeof(outcome) = 'object'), action_correlation_id text NOT NULL CHECK (btrim(action_correlation_id) <> ''), completed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (organization_id, principal_id, api_major, action, incident_id, key),
  FOREIGN KEY (principal_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (incident_id, organization_id) REFERENCES incidents(id, organization_id) ON DELETE RESTRICT
);

INSERT INTO triage_rule_versions(id,organization_id,version) VALUES ('00000000-0000-7000-8000-000000000003','00000000-0000-7000-8000-000000000001',1);
INSERT INTO triage_rules(id,organization_id,rule_version_id,identifier,priority,assignee_strategy) VALUES ('00000000-0000-7000-8000-000000000004','00000000-0000-7000-8000-000000000001','00000000-0000-7000-8000-000000000003','default-catch-all',1,'single-eligible');

CREATE FUNCTION triage_authority_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'triage authority is immutable'; END $$;
CREATE TRIGGER triage_rule_versions_no_update BEFORE UPDATE OR DELETE ON triage_rule_versions FOR EACH ROW EXECUTE FUNCTION triage_authority_immutable();
CREATE TRIGGER triage_rules_no_update BEFORE UPDATE OR DELETE ON triage_rules FOR EACH ROW EXECUTE FUNCTION triage_authority_immutable();
CREATE TRIGGER triage_evaluations_no_update BEFORE UPDATE OR DELETE ON triage_evaluations FOR EACH ROW EXECUTE FUNCTION triage_authority_immutable();
CREATE TRIGGER triage_decision_sets_no_update BEFORE UPDATE OR DELETE ON triage_decision_sets FOR EACH ROW EXECUTE FUNCTION triage_authority_immutable();
CREATE TRIGGER triage_decision_items_no_update BEFORE UPDATE OR DELETE ON triage_decision_items FOR EACH ROW EXECUTE FUNCTION triage_authority_immutable();
CREATE TRIGGER triage_idempotency_outcomes_no_update BEFORE UPDATE OR DELETE ON triage_idempotency_outcomes FOR EACH ROW EXECUTE FUNCTION triage_authority_immutable();

ALTER TABLE incident_sla_segments ADD COLUMN incident_id uuid;
ALTER TABLE incident_sla_segments ADD COLUMN ended_at timestamptz;
UPDATE incident_sla_segments segment SET incident_id = cycle.incident_id, ended_at = CASE WHEN segment.active THEN NULL ELSE segment.deadline_at END FROM incident_sla_cycles cycle WHERE cycle.id = segment.cycle_id;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM incident_sla_segments segment JOIN incident_sla_cycles cycle ON cycle.id=segment.cycle_id JOIN incident_sla_rule_snapshots snapshot ON snapshot.id=segment.snapshot_id WHERE segment.incident_id IS NULL OR segment.incident_id IS DISTINCT FROM cycle.incident_id OR segment.incident_id IS DISTINCT FROM snapshot.incident_id OR (NOT segment.active AND segment.ended_at IS NULL)) THEN RAISE EXCEPTION 'SLA segment backfill validation failed'; END IF;
END $$;
ALTER TABLE incident_sla_segments ALTER COLUMN incident_id SET NOT NULL;
ALTER TABLE incident_sla_cycles ADD CONSTRAINT incident_sla_cycles_id_incident_unique UNIQUE (id, incident_id);
ALTER TABLE incident_sla_segments DROP CONSTRAINT incident_sla_segments_cycle_id_snapshot_id_fkey;
ALTER TABLE incident_sla_segments
  ADD CONSTRAINT incident_sla_segments_cycle_incident_fk FOREIGN KEY (cycle_id, incident_id) REFERENCES incident_sla_cycles(id, incident_id) ON DELETE RESTRICT,
  ADD CONSTRAINT incident_sla_segments_snapshot_incident_fk FOREIGN KEY (snapshot_id, incident_id) REFERENCES incident_sla_rule_snapshots(id, incident_id) ON DELETE RESTRICT,
  ADD CONSTRAINT incident_sla_segments_lifecycle_check CHECK ((active AND ended_at IS NULL) OR (NOT active AND ended_at IS NOT NULL AND ended_at >= started_at));

CREATE FUNCTION incident_sla_segments_enforce_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.active OR NEW.ended_at IS NOT NULL THEN RAISE EXCEPTION 'SLA segments must start active'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SLA segments are retained'; END IF;
  IF NOT OLD.active THEN RAISE EXCEPTION 'closed SLA segments are immutable'; END IF;
  IF NEW.active THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'active SLA segments may only close'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.ended_at IS NULL THEN RAISE EXCEPTION 'SLA segments must close with ended_at'; END IF;
  IF (to_jsonb(NEW) - ARRAY['active','ended_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['active','ended_at']) THEN RAISE EXCEPTION 'SLA segments may only change active and ended_at'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER incident_sla_segments_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON incident_sla_segments FOR EACH ROW EXECUTE FUNCTION incident_sla_segments_enforce_lifecycle();
