ALTER TABLE locations ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE configuration_events (
  id uuid PRIMARY KEY,
  reference_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  actor_id text NOT NULL CHECK (btrim(actor_id) <> ''),
  effective_at timestamptz NOT NULL,
  effective_until timestamptz,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_at)
);
CREATE INDEX configuration_events_reference_effective_idx ON configuration_events (reference_id, effective_at, id);
CREATE FUNCTION reject_configuration_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'configuration events are append-only'; END;
$$;
CREATE TRIGGER configuration_events_append_only BEFORE UPDATE OR DELETE ON configuration_events
FOR EACH ROW EXECUTE FUNCTION reject_configuration_event_mutation();
