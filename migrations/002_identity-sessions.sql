CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('collaborator', 'sector-lead', 'supervisor', 'inventory-team', 'central-operations')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE user_store_scopes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE user_sector_scopes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sector_id uuid NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, sector_id)
);

CREATE TABLE category_responsibilities (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category_key text NOT NULL REFERENCES categories(key) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, category_key)
);

CREATE TABLE action_grants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  role text NOT NULL DEFAULT '' CHECK (role = '' OR role IN ('collaborator', 'sector-lead', 'supervisor', 'inventory-team', 'central-operations')),
  PRIMARY KEY (user_id, action, role)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  session_id_hash bytea NOT NULL UNIQUE CHECK (octet_length(session_id_hash) = 32),
  csrf_token_hash bytea NOT NULL CHECK (octet_length(csrf_token_hash) = 32),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX sessions_current_lookup_idx ON sessions (session_id_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX user_store_scopes_store_idx ON user_store_scopes (store_id, user_id);
CREATE INDEX user_sector_scopes_sector_idx ON user_sector_scopes (sector_id, user_id);

CREATE VIEW current_session_access AS
SELECT sessions.id AS session_id, sessions.user_id, sessions.expires_at
FROM sessions
JOIN users ON users.id = sessions.user_id
WHERE users.active AND sessions.revoked_at IS NULL AND sessions.expires_at > now();
