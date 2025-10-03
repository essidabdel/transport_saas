# Transport SaaS (MVP)

Auth (JWT/OTP) • Rôles (ADMIN/CLIENT) • Société • Calculateur express (€/km, €/h) • Véhicules • Audit login

## Stack
- **Backend**: Node.js (Express) + PostgreSQL (local)
- **Frontend**: React (JavaScript)
- **API**: REST (JWT + refresh tokens)
- **Sécurité**: rate-limit /auth, audit, déblocage admin

---

## Prérequis
- Node express
- PostgreSQL (local) + `psql` dans le PATH

---

## Setup rapide (Windows / PowerShell)

### 1) DB
```powershell
psql -U postgres -c "CREATE DATABASE transport_saas;"
psql -U postgres -d transport_saas -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### 2) Backend
```powershell
cd backend
Copy-Item .env.example .env -Force
npm install
npm run dev

# (nouvelle fenêtre PowerShell)
cd backend
npm run seed:admin
npm run seed:org
```

**.env (exemple)**
```ini
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/transport_saas
JWT_SECRET=devsecretchange
PORT=4000
```

### 3) Frontend
```powershell
cd web
npm install
npm start
```

**web/package.json**
```json
{ "proxy": "http://localhost:4000" }
```

---

## Scripts utiles

**Backend**
- `npm run dev` : lance l’API (nodemon)
- `npm run seed:admin` : crée l’admin `admin@local.test` / `Admin123!`
- `npm run seed:org` : crée la société “Demo Transport”

**Frontend**
- `npm start` : lance l’app web

---

## Endpoints (REST)

### Santé
- `GET /health` → `{ ok: true }`

### Auth
- `POST /api/auth/register` `{ email, password, role }` → crée user (test)
- `POST /api/auth/login` `{ email, password, otp_code? }` → `{ access_token, refresh_token, role, email }`
- `GET /api/auth/me` (Bearer)
- `POST /api/auth/enable-otp` (Bearer ADMIN/CLIENT)
- `POST /api/auth/refresh` `{ refresh_token }` → rotation
- `POST /api/auth/logout` `{ refresh_token }` → revoke
- `GET /api/auth/roles-check` (Bearer) → `{ role, email }`

### Admin — Audit & Unlock (ADMIN)
- `GET /api/admin/audit?email=&success=&limit=&offset=` → liste audit
- `POST /api/admin/audit/unlock` `{ email?, ip? }` → purge email & clear IP guard

### Société (profil organisation + logo)
- `GET /api/org/me` (Bearer)
- `PUT /api/org/me` `{ name, vat_number, currency, unit_system, full_name, logo_base64? }`  
  `logo_base64` : `data:image/png;base64,...` (ou jpg)
- `POST /api/org/create-and-switch` `{ name, ... }` → crée une nouvelle société et bascule l’utilisateur

### Coûts (Calculateur express)
- `GET /api/cost/params` → paramètres défaut entreprise
- `PUT /api/cost/params` → mise à jour défauts
- `GET /api/cost/compute?vehicle_id=` → `{ eur_km_variable, eur_hour }`
- `GET /api/cost/compute-fleet-avg` → `{ eur_km_avg }` (optionnel)

### Véhicules
- `GET /api/vehicles` → liste (avec `cout_variable_km` + `alerts`)
- `POST /api/vehicles` → création
- `PUT /api/vehicles/:id` → mise à jour
- `DELETE /api/vehicles/:id` → suppression

---

## Rôles & redirections (web)
- **ADMIN** → page Admin (ping + Audit + Unlock)
- **CLIENT** → Dashboard Client (Société + Calculateur + Véhicules)
- Auto refresh token sur `401` côté front

---

## Notes sécurité / RGPD (MVP)
- JWT 15 min + refresh 7 j (rotation)
- Chiffrement en transit (dev via proxy CRA ; prod HTTPS)
- IP guard mémoire + audit DB
- Fichiers logo via `/uploads` (durcissement à prévoir en prod)

---

## Tests rapides (PowerShell)

### Auth ADMIN
```powershell
$L = Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/login -ContentType "application/json" -Body (@{ email="admin@local.test"; password="Admin123!" } | ConvertTo-Json)
$AT = $L.access_token
Invoke-RestMethod -Uri http://localhost:4000/api/admin/ping -Headers @{ Authorization = "Bearer $AT" }
Invoke-RestMethod -Uri http://localhost:4000/api/admin/audit -Headers @{ Authorization = "Bearer $AT" }
```

### Client + Véhicule + Coût
```powershell
$C = Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/login -ContentType "application/json" -Body (@{ email="client@local.test"; password="Client123!" } | ConvertTo-Json)
$CT = $C.access_token

Invoke-RestMethod -Uri http://localhost:4000/api/org/me -Headers @{ Authorization = "Bearer $CT" }
Invoke-RestMethod -Uri http://localhost:4000/api/cost/params -Headers @{ Authorization = "Bearer $CT" }

$veh = @{
  immatriculation="AB-123-CD"; marque="Renault"; modele="Trafic"; energie="diesel";
  conso_moyenne=7.5; prix_carburant=1.85; entretien_moyen_km=0.05; pneus_prix_jeu=500; pneus_duree_vie_km=40000;
  reparations_moyennes=0.04; peages_moyens=0.03; adblue_moyen=0.001
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/vehicles -Headers @{ Authorization="Bearer $CT"; "Content-Type"="application/json" } -Body $veh
Invoke-RestMethod -Uri http://localhost:4000/api/cost/compute?vehicle_id=1 -Headers @{ Authorization = "Bearer $CT" }
```
