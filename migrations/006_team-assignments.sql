ALTER TABLE users ADD CONSTRAINT users_id_organization_unique UNIQUE (id, organization_id);

CREATE TABLE teams (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (btrim(key) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, key),
  CHECK (updated_at >= created_at)
);

CREATE TABLE team_memberships (
  organization_id uuid NOT NULL,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (organization_id, team_id, user_id),
  FOREIGN KEY (team_id, organization_id) REFERENCES teams(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at)
);
CREATE INDEX team_memberships_active_user_idx ON team_memberships (organization_id, user_id, team_id) WHERE active;

ALTER TABLE incidents ADD COLUMN assignee_team_id uuid;
ALTER TABLE incidents ADD CONSTRAINT incidents_assignee_team_scope_fk
  FOREIGN KEY (assignee_team_id, organization_id) REFERENCES teams(id, organization_id) ON DELETE RESTRICT;
ALTER TABLE incidents ADD CONSTRAINT incidents_open_team_unassigned CHECK (state <> 'open' OR assignee_team_id IS NULL);
CREATE INDEX incidents_scope_team_state_updated_idx ON incidents (organization_id, store_id, assignee_team_id, state, updated_at DESC, id) WHERE assignee_team_id IS NOT NULL;
