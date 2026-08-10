ALTER TABLE categories ADD CONSTRAINT categories_key_organization_unique UNIQUE (key, organization_id);
ALTER TABLE severities ADD CONSTRAINT severities_key_organization_unique UNIQUE (key, organization_id);

CREATE TABLE sla_policy_versions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, version integer NOT NULL CHECK (version > 0), active boolean NOT NULL,
  clock_mode text NOT NULL CHECK (clock_mode = 'continuous-utc'), pauses_when_blocked boolean NOT NULL DEFAULT false, effective_at timestamptz NOT NULL DEFAULT transaction_timestamp(), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, organization_id), UNIQUE (organization_id, version)
);
CREATE UNIQUE INDEX sla_policy_versions_one_active_idx ON sla_policy_versions (organization_id) WHERE active;
CREATE TABLE sla_policy_rules (
  policy_version_id uuid NOT NULL, organization_id uuid NOT NULL, category_key text NOT NULL, severity_key text NOT NULL,
  warning_after_seconds integer NOT NULL CHECK (warning_after_seconds > 0), deadline_after_seconds integer NOT NULL CHECK (deadline_after_seconds > warning_after_seconds),
  PRIMARY KEY (policy_version_id, category_key, severity_key), FOREIGN KEY (policy_version_id, organization_id) REFERENCES sla_policy_versions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (category_key, organization_id) REFERENCES categories(key, organization_id) ON DELETE RESTRICT, FOREIGN KEY (severity_key, organization_id) REFERENCES severities(key, organization_id) ON DELETE RESTRICT
);
CREATE TABLE incident_sla_rule_snapshots (
  id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  policy_version_id uuid NOT NULL, policy_version integer NOT NULL CHECK (policy_version > 0), category_key text NOT NULL, severity_key text NOT NULL, clock_mode text NOT NULL CHECK (clock_mode = 'continuous-utc'),
  pauses_when_blocked boolean NOT NULL, warning_after_seconds integer NOT NULL CHECK (warning_after_seconds > 0), deadline_after_seconds integer NOT NULL CHECK (deadline_after_seconds > warning_after_seconds), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, incident_id), FOREIGN KEY (policy_version_id, organization_id) REFERENCES sla_policy_versions(id, organization_id) ON DELETE RESTRICT, FOREIGN KEY (policy_version_id, category_key, severity_key) REFERENCES sla_policy_rules(policy_version_id, category_key, severity_key) ON DELETE RESTRICT
);
CREATE TABLE incident_sla_cycles (
  id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT, snapshot_id uuid NOT NULL, sequence integer NOT NULL CHECK (sequence > 0),
  condition text NOT NULL CHECK (condition IN ('on-track','warning','breached','paused')), started_at timestamptz NOT NULL, warning_at timestamptz NOT NULL, deadline_at timestamptz NOT NULL CHECK (deadline_at > warning_at),
  UNIQUE (incident_id, sequence), UNIQUE (id, snapshot_id), FOREIGN KEY (snapshot_id, incident_id) REFERENCES incident_sla_rule_snapshots(id, incident_id) ON DELETE RESTRICT
);
CREATE TABLE incident_sla_segments (
  id uuid PRIMARY KEY, cycle_id uuid NOT NULL, snapshot_id uuid NOT NULL, sequence integer NOT NULL CHECK (sequence > 0), started_at timestamptz NOT NULL,
  warning_at timestamptz NOT NULL, deadline_at timestamptz NOT NULL CHECK (deadline_at > warning_at), active boolean NOT NULL,
  UNIQUE (cycle_id, sequence), FOREIGN KEY (cycle_id, snapshot_id) REFERENCES incident_sla_cycles(id, snapshot_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX incident_sla_segments_one_active_idx ON incident_sla_segments (cycle_id) WHERE active;
CREATE FUNCTION incident_sla_rule_snapshots_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SLA rule snapshots are immutable'; END $$;
CREATE TRIGGER incident_sla_rule_snapshots_no_update BEFORE UPDATE OR DELETE ON incident_sla_rule_snapshots FOR EACH ROW EXECUTE FUNCTION incident_sla_rule_snapshots_immutable();

INSERT INTO sla_policy_versions(id,organization_id,version,active,clock_mode,pauses_when_blocked) VALUES ('00000000-0000-7000-8000-000000000001','00000000-0000-7000-8000-000000000001',1,true,'continuous-utc',false);
INSERT INTO sla_policy_rules(policy_version_id,organization_id,category_key,severity_key,warning_after_seconds,deadline_after_seconds)
SELECT '00000000-0000-7000-8000-000000000001',c.organization_id,c.key,target.severity,target.warning_after_seconds,target.deadline_after_seconds FROM categories c
CROSS JOIN (VALUES ('low',172800,259200),('medium',57600,86400),('high',14400,28800),('critical',3600,7200)) AS target(severity,warning_after_seconds,deadline_after_seconds)
JOIN severities s ON s.key=target.severity AND s.organization_id=c.organization_id AND s.active WHERE c.active;
