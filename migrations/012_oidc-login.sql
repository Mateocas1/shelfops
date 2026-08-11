CREATE TABLE oidc_identity_mappings (
  issuer varchar(2048) NOT NULL CHECK (issuer = btrim(issuer) AND issuer LIKE 'https://%' AND issuer NOT LIKE '%/'),
  subject varchar(255) NOT NULL CHECK (subject = btrim(subject) AND subject <> ''),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  PRIMARY KEY (issuer, subject)
);

CREATE INDEX oidc_identity_mappings_user_idx ON oidc_identity_mappings (user_id);

CREATE TABLE oidc_authorization_transactions (
  state_hash bytea PRIMARY KEY CHECK (octet_length(state_hash) = 32),
  issuer varchar(2048) NOT NULL CHECK (issuer = btrim(issuer) AND issuer LIKE 'https://%' AND issuer NOT LIKE '%/'),
  nonce varchar(512) NOT NULL CHECK (nonce = btrim(nonce) AND nonce <> ''),
  pkce_verifier varchar(128) NOT NULL CHECK (length(pkce_verifier) BETWEEN 43 AND 128),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes'),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX oidc_authorization_transactions_cleanup_idx ON oidc_authorization_transactions (expires_at);
ALTER TABLE sessions ADD CONSTRAINT sessions_bounded_expiry CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days') NOT VALID;
