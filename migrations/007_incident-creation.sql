CREATE TABLE incident_text_evidence (
  id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT, sequence integer NOT NULL CHECK (sequence > 0),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, text text NOT NULL CHECK (btrim(text) <> '' AND char_length(text) <= 4000), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), UNIQUE (incident_id, sequence)
);

CREATE TABLE incident_events (
  id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT, sequence integer NOT NULL CHECK (sequence > 0),
  event_type text NOT NULL CHECK (btrim(event_type) <> ''), actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(), data jsonb NOT NULL DEFAULT '{}', UNIQUE (incident_id, sequence)
);
CREATE FUNCTION incident_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'incident events are immutable'; END $$;
CREATE TRIGGER incident_events_no_update BEFORE UPDATE OR DELETE ON incident_events FOR EACH ROW EXECUTE FUNCTION incident_events_immutable();

CREATE TABLE incident_creation_idempotency (
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, api_major text NOT NULL, operation text NOT NULL, key text NOT NULL,
  request_hash text NOT NULL, outcome jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (principal_id, api_major, operation, key), CHECK (btrim(api_major) <> '' AND btrim(operation) <> '' AND btrim(key) <> '' AND btrim(request_hash) <> '')
);
