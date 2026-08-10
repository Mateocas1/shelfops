CREATE TABLE recurrence_rule_versions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, version integer NOT NULL CHECK (version > 0),
  window_days smallint NOT NULL CHECK (window_days BETWEEN 1 AND 90), maximum_suggestions smallint NOT NULL CHECK (maximum_suggestions BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), UNIQUE (id, organization_id), UNIQUE (organization_id, version)
);
INSERT INTO recurrence_rule_versions(id,organization_id,version,window_days,maximum_suggestions) VALUES ('00000000-0000-7000-8000-000000000002','00000000-0000-7000-8000-000000000001',1,30,5);
ALTER TABLE incidents ADD COLUMN recurrence_rule_version_id uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000002';
ALTER TABLE incidents ADD CONSTRAINT incidents_id_organization_unique UNIQUE (id, organization_id);
ALTER TABLE incidents ADD CONSTRAINT incidents_recurrence_rule_version_organization_fk FOREIGN KEY (recurrence_rule_version_id, organization_id) REFERENCES recurrence_rule_versions(id, organization_id) ON DELETE RESTRICT;
CREATE INDEX incidents_recurrence_match_idx ON incidents (organization_id, store_id, category_key, created_at DESC, id);

CREATE TABLE recurrence_suggestions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, incident_id uuid NOT NULL, candidate_incident_id uuid NOT NULL,
  recurrence_rule_version_id uuid NOT NULL, occurrence integer NOT NULL CHECK (occurrence > 0), matching_facts jsonb NOT NULL CHECK (jsonb_typeof(matching_facts) = 'object' AND (matching_facts ? 'locationId' OR matching_facts ? 'productId')),
  correlation_id text NOT NULL CHECK (btrim(correlation_id) <> ''), evaluated_at timestamptz NOT NULL DEFAULT transaction_timestamp(), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (incident_id <> candidate_incident_id), UNIQUE (id, organization_id), UNIQUE (organization_id, incident_id, candidate_incident_id, recurrence_rule_version_id, occurrence),
  FOREIGN KEY (incident_id, organization_id) REFERENCES incidents(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (candidate_incident_id, organization_id) REFERENCES incidents(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (recurrence_rule_version_id, organization_id) REFERENCES recurrence_rule_versions(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX recurrence_suggestions_owner_created_idx ON recurrence_suggestions (organization_id, incident_id, created_at DESC, id);

CREATE TABLE recurrence_decisions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, suggestion_id uuid NOT NULL, sequence integer NOT NULL CHECK (sequence > 0),
  state text NOT NULL CHECK (state IN ('confirmed','dismissed')), actor_user_id uuid NOT NULL, note text CHECK (note IS NULL OR btrim(note) <> ''), correction_reason text CHECK (correction_reason IS NULL OR btrim(correction_reason) <> ''), predecessor_sequence integer,
  correlation_id text NOT NULL CHECK (btrim(correlation_id) <> ''), decided_at timestamptz NOT NULL DEFAULT transaction_timestamp(), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, suggestion_id, state), UNIQUE (suggestion_id, sequence),
  FOREIGN KEY (suggestion_id, organization_id) REFERENCES recurrence_suggestions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (suggestion_id, predecessor_sequence) REFERENCES recurrence_decisions(suggestion_id, sequence) ON DELETE RESTRICT,
  CHECK ((sequence = 1 AND predecessor_sequence IS NULL AND correction_reason IS NULL) OR (sequence > 1 AND predecessor_sequence = sequence - 1 AND correction_reason IS NOT NULL AND btrim(correction_reason) <> ''))
);
CREATE INDEX recurrence_decisions_current_idx ON recurrence_decisions (organization_id, suggestion_id, sequence DESC);

CREATE TABLE recurrence_links (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, suggestion_id uuid NOT NULL, confirmed_decision_id uuid NOT NULL,
  confirmation_state text NOT NULL DEFAULT 'confirmed' CHECK (confirmation_state = 'confirmed'), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), UNIQUE (suggestion_id),
  FOREIGN KEY (suggestion_id, organization_id) REFERENCES recurrence_suggestions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (confirmed_decision_id, suggestion_id, confirmation_state) REFERENCES recurrence_decisions(id, suggestion_id, state) ON DELETE RESTRICT
);

ALTER TABLE incident_events ADD COLUMN origin text NOT NULL DEFAULT 'human' CHECK (origin IN ('human','system'));
CREATE FUNCTION recurrence_authority_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'recurrence authority is immutable'; END $$;
CREATE TRIGGER recurrence_rule_versions_no_update BEFORE UPDATE OR DELETE ON recurrence_rule_versions FOR EACH ROW EXECUTE FUNCTION recurrence_authority_immutable();
CREATE TRIGGER recurrence_suggestions_no_update BEFORE UPDATE OR DELETE ON recurrence_suggestions FOR EACH ROW EXECUTE FUNCTION recurrence_authority_immutable();
CREATE TRIGGER recurrence_decisions_no_update BEFORE UPDATE OR DELETE ON recurrence_decisions FOR EACH ROW EXECUTE FUNCTION recurrence_authority_immutable();
CREATE TRIGGER recurrence_links_no_update BEFORE UPDATE OR DELETE ON recurrence_links FOR EACH ROW EXECUTE FUNCTION recurrence_authority_immutable();

CREATE VIEW current_recurrence_suggestion_states AS
SELECT s.organization_id,s.id suggestion_id,s.incident_id,s.candidate_incident_id,s.recurrence_rule_version_id,s.occurrence,s.version,s.matching_facts,
  COALESCE(d.state,'pending') state,d.id decision_id,d.sequence decision_sequence,d.actor_user_id,d.decided_at
FROM recurrence_suggestions s LEFT JOIN LATERAL (
  SELECT id,state,sequence,actor_user_id,decided_at FROM recurrence_decisions WHERE suggestion_id=s.id AND organization_id=s.organization_id ORDER BY sequence DESC LIMIT 1
) d ON true;
