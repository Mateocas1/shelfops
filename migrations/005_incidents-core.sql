ALTER TABLE locations
  ADD CONSTRAINT locations_incident_scope_unique UNIQUE (id, organization_id, store_id, sector_id);

CREATE TABLE incidents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL,
  sector_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid,
  category_key text NOT NULL REFERENCES categories(key) ON DELETE RESTRICT,
  severity_key text NOT NULL REFERENCES severities(key) ON DELETE RESTRICT,
  category_provisional boolean NOT NULL DEFAULT true,
  severity_provisional boolean NOT NULL DEFAULT true,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text NOT NULL CHECK (btrim(description) <> ''),
  occurred_at timestamptz NOT NULL,
  reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assignee_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  ownership_gap boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'classified', 'in-progress', 'blocked', 'resolved')),
  reopen_count integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (sector_id, organization_id, store_id) REFERENCES sectors(id, organization_id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id, organization_id, store_id, sector_id) REFERENCES locations(id, organization_id, store_id, sector_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, organization_id) REFERENCES products(id, organization_id) ON DELETE RESTRICT,
  CHECK ((state = 'open' AND assignee_user_id IS NULL) OR (state <> 'open' AND assignee_user_id IS NOT NULL)),
  CHECK (state <> 'open' OR NOT ownership_gap),
  CHECK (updated_at >= created_at)
);

CREATE INDEX incidents_scope_state_updated_idx ON incidents (organization_id, store_id, sector_id, state, updated_at DESC, id);
CREATE INDEX incidents_scope_location_updated_idx ON incidents (organization_id, store_id, sector_id, location_id, updated_at DESC, id);
CREATE INDEX incidents_scope_category_updated_idx ON incidents (organization_id, store_id, sector_id, category_key, updated_at DESC, id);
CREATE INDEX incidents_scope_severity_updated_idx ON incidents (organization_id, store_id, sector_id, severity_key, updated_at DESC, id);
CREATE INDEX incidents_scope_reporter_updated_idx ON incidents (organization_id, store_id, sector_id, reporter_user_id, updated_at DESC, id);
CREATE INDEX incidents_scope_assignee_updated_idx ON incidents (organization_id, store_id, sector_id, assignee_user_id, updated_at DESC, id) WHERE assignee_user_id IS NOT NULL;
