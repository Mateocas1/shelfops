CREATE TABLE organizations (
  id uuid PRIMARY KEY, name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true,
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO organizations (id, name) VALUES ('00000000-0000-7000-8000-000000000001', 'Simulated ShelfOps Organization');
CREATE TABLE stores (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (id, organization_id)
);
CREATE TABLE sectors (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, store_id uuid NOT NULL, name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (id, organization_id, store_id),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE RESTRICT
);
CREATE TABLE locations (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, store_id uuid NOT NULL, sector_id uuid NOT NULL, name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (sector_id, organization_id, store_id) REFERENCES sectors(id, organization_id, store_id) ON DELETE RESTRICT
);
CREATE TABLE products (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (id, organization_id)
);
CREATE TABLE product_store_availability (
  product_id uuid NOT NULL, organization_id uuid NOT NULL, store_id uuid NOT NULL, active boolean NOT NULL DEFAULT true, PRIMARY KEY (product_id, store_id),
  FOREIGN KEY (product_id, organization_id) REFERENCES products(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE RESTRICT
);
CREATE TABLE users (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE categories (
  key text PRIMARY KEY, organization_id uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001' REFERENCES organizations(id) ON DELETE RESTRICT, name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true, requires_location boolean NOT NULL DEFAULT true,
  requires_product boolean NOT NULL DEFAULT true, requires_creation_evidence boolean NOT NULL DEFAULT true, requires_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE severities (
  key text PRIMARY KEY, organization_id uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001' REFERENCES organizations(id) ON DELETE RESTRICT, name text NOT NULL CHECK (btrim(name) <> ''), sort_order smallint NOT NULL UNIQUE CHECK (sort_order > 0), guidance text NOT NULL CHECK (btrim(guidance) <> ''), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO categories (key, name, requires_product, requires_note) VALUES
  ('out-of-stock', 'Out of stock', true, false), ('inventory-mismatch', 'Inventory mismatch', true, false), ('misplaced-product', 'Misplaced product', true, false),
  ('price-or-label', 'Price or label', true, false), ('replenishment-blocked', 'Replenishment blocked', true, false), ('equipment-failure', 'Equipment failure', false, false), ('other', 'Other', false, true);
INSERT INTO severities (key, name, sort_order, guidance) VALUES
  ('low', 'Low', 1, 'Limited impact with a workaround'), ('medium', 'Medium', 2, 'Material local disruption without immediate safety or store-wide impact'),
  ('high', 'High', 3, 'Major operational impact, substantial loss risk, or no practical workaround'), ('critical', 'Critical', 4, 'Immediate safety, regulatory, severe loss, or store-wide continuity risk');
