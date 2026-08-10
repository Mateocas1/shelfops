CREATE TABLE reference_configuration_idempotency (
  principal_id text NOT NULL CHECK (btrim(principal_id) <> ''), api_major text NOT NULL CHECK (btrim(api_major) <> ''), operation text NOT NULL CHECK (btrim(operation) <> ''), target_key text NOT NULL CHECK (btrim(target_key) <> ''), key text NOT NULL CHECK (btrim(key) <> ''),
  request_hash text NOT NULL CHECK (btrim(request_hash) <> ''), state text NOT NULL CHECK (state IN ('pending', 'completed')), outcome jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), expires_at timestamptz NOT NULL,
  PRIMARY KEY (principal_id, api_major, operation, target_key, key),
  CHECK (expires_at >= created_at + interval '24 hours'), CHECK ((state = 'completed') = (outcome IS NOT NULL))
);
