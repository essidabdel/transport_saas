-- 1) USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','CLIENT')),
  otp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  otp_secret TEXT,
  full_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2) ORGANIZATIONS
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  vat_number TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  unit_system TEXT NOT NULL DEFAULT 'metric',
  logo_path TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3) users.organization_id (colonne + FK idempotente)
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_org_fk' AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_org_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 4) LOGIN AUDIT
CREATE TABLE IF NOT EXISTS login_audit (
  id SERIAL PRIMARY KEY,
  user_id INT,
  email TEXT,
  ip TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5) REFRESH TOKENS
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6) Onboarding status view
CREATE OR REPLACE VIEW onboarding_status AS
SELECT
  u.id AS user_id,
  (u.organization_id IS NOT NULL) AS has_org,
  COALESCE(NULLIF(o.name, ''), NULL) IS NOT NULL AS has_org_name
FROM users u
LEFT JOIN organizations o ON o.id = u.organization_id;

-- 7) Paramètres de coûts (org)
CREATE TABLE IF NOT EXISTS cost_params (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  -- variable €/km
  conso_l_100km DECIMAL(6,2) DEFAULT 7.50,
  prix_carburant_eur_l DECIMAL(6,3) DEFAULT 1.850,
  entretien_eur_km DECIMAL(6,3) DEFAULT 0.050,
  pneus_prix_jeu DECIMAL(8,2) DEFAULT 500.00,
  pneus_duree_vie_km INT DEFAULT 40000,
  reparations_eur_km DECIMAL(6,3) DEFAULT 0.040,
  peages_eur_km DECIMAL(6,3) DEFAULT 0.030,
  adblue_eur_km DECIMAL(6,3) DEFAULT 0.001,
  -- horaire €/h (MVP)
  cout_horaire_chauffeur DECIMAL(7,2) DEFAULT 18.00,
  frais_fixes_horaire DECIMAL(7,2) DEFAULT 7.00,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 8) VEHICLES
CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  immatriculation VARCHAR(20) NOT NULL,
  marque VARCHAR(50),
  modele VARCHAR(100),
  vin VARCHAR(50),
  energie TEXT CHECK (energie IN ('diesel','essence','electrique','hybride')),
  date_mise_en_circulation DATE,
  kilometrage_actuel INT,

  assurance_annuelle DECIMAL(10,2),
  financement_mensuel DECIMAL(10,2),
  taxe_annuelle DECIMAL(10,2),
  abonnement_gps DECIMAL(10,2),

  conso_moyenne DECIMAL(5,2),
  prix_carburant DECIMAL(6,3),
  entretien_moyen_km DECIMAL(6,3),
  pneus_prix_jeu DECIMAL(10,2),
  pneus_duree_vie_km INT,
  reparations_moyennes DECIMAL(6,3),
  peages_moyens DECIMAL(6,3),
  adblue_moyen DECIMAL(6,3),

  date_prochain_controle_technique DATE,
  date_fin_assurance DATE,
  date_prochain_entretien DATE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_org_immatriculation_uk
  ON vehicles(organization_id, immatriculation);

-- 9) CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  vat_number TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customers_org_idx ON customers(organization_id,name);

-- 10) QUOTES
CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT|SENT|ACCEPTED|REJECTED
  currency TEXT NOT NULL DEFAULT 'EUR',
  margin_percent DECIMAL(5,2) NOT NULL DEFAULT 10.0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS quotes_org_number_uk ON quotes(organization_id, number);

CREATE TABLE IF NOT EXISTS quote_items (
  id SERIAL PRIMARY KEY,
  quote_id INT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- KM|H|FIXED
  label TEXT NOT NULL,
  qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON quote_items(quote_id);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

-- 11) DRIVERS
CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  -- base de calcul
  salaire_brut_mensuel DECIMAL(10,2) NOT NULL DEFAULT 2000.00,
  charges_patronales_pct DECIMAL(5,2) NOT NULL DEFAULT 42.00,
  frais_generaux_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  heures_productives_mois DECIMAL(6,2) NOT NULL DEFAULT 140.00,
  -- dérivé (optionnel)
  cout_horaire DECIMAL(10,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS drivers_org_idx ON drivers(organization_id,full_name);

-- 12) MAINTENANCE
CREATE TABLE IF NOT EXISTS maintenance (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,       -- ENTRETIEN|CT|ASSURANCE|AUTRE
  due_date DATE,
  due_km INT,
  notes TEXT,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at TIMESTAMP,
  mileage_at_done INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS maintenance_org_due_idx ON maintenance(organization_id, due_date, done);

-- 13) JOBS (missions)
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id INT REFERENCES drivers(id) ON DELETE SET NULL,

  ref TEXT NOT NULL,
  pickup_addr TEXT,
  dropoff_addr TEXT,
  date_plan DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED', -- PLANNED|DONE|CANCELLED
  notes TEXT,

  km_start INT,
  km_end INT,
  tolls_eur DECIMAL(10,2),
  wait_minutes INT,
  drive_minutes INT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,

  cost_vehicle_eur DECIMAL(12,2),
  cost_driver_eur DECIMAL(12,2),
  cost_total_eur DECIMAL(12,2),
  revenue_eur DECIMAL(12,2),
  margin_eur DECIMAL(12,2),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS jobs_org_idx ON jobs(organization_id, date_plan, status);

-- Contraintes idempotentes pour les KM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='jobs_km_order_chk') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_km_order_chk
      CHECK (km_start IS NULL OR km_end IS NULL OR km_end >= km_start) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='jobs_km_delta_chk') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_km_delta_chk
      CHECK (km_start IS NULL OR km_end IS NULL OR (km_end - km_start) <= 1500) NOT VALID;
  END IF;
END$$;

-- 14) INVOICES
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES customers(id),
  number TEXT NOT NULL,                      -- ex: 2025-INV-0001
  quote_id INT REFERENCES quotes(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  notes TEXT,
  total_ht DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_number_uk ON invoices(organization_id, number);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoice_items_inv_idx ON invoice_items(invoice_id);

-- Invoices: statut, TVA, échéance, TTC, reste dû
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT'; -- DRAFT|SENT|PAID|CANCELLED
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00; -- %
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_ttc DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS remaining DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Paiements
CREATE TABLE IF NOT EXISTS invoice_payments (
  id SERIAL PRIMARY KEY,
  invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  method TEXT,          -- cash|transfer|card|check
  paid_at DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invoice_payments_inv_idx ON invoice_payments(invoice_id);
