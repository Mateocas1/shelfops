ALTER TABLE organizations ADD COLUMN slug text CHECK (slug IS NULL OR (slug = btrim(slug) AND slug <> ''));
ALTER TABLE organizations ADD CONSTRAINT organizations_slug_key UNIQUE (slug);

ALTER TABLE stores ADD COLUMN code text CHECK (code IS NULL OR (code = btrim(code) AND code <> ''));
ALTER TABLE stores ADD CONSTRAINT stores_organization_code_key UNIQUE (organization_id, code);

ALTER TABLE users ADD COLUMN email text CHECK (email IS NULL OR (email = btrim(email) AND email <> ''));
ALTER TABLE users ADD CONSTRAINT users_organization_email_key UNIQUE (organization_id, email);
