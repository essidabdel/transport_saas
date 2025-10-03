-- 1) USERS (création si absent)
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

-- 3) Ajouter la colonne users.organization_id si manquante
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organization_id INT;

-- 4) Ajouter la contrainte FK une seule fois
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_org_fk'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_org_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 5) LOGIN AUDIT
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

-- 6) REFRESH TOKENS
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 7) VIEW (OR REPLACE, pas IF NOT EXISTS)
CREATE OR REPLACE VIEW onboarding_status AS
SELECT
  u.id AS user_id,
  (u.organization_id IS NOT NULL) AS has_org,
  COALESCE(NULLIF(o.name, ''), NULL) IS NOT NULL AS has_org_name
FROM users u
LEFT JOIN organizations o ON o.id = u.organization_id;

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
  -- horaire €/h (MVP simple)
  cout_horaire_chauffeur DECIMAL(7,2) DEFAULT 18.00,
  frais_fixes_horaire DECIMAL(7,2) DEFAULT 7.00,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
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
