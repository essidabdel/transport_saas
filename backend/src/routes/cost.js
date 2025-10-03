const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function ensureParams(orgId){
  const { rows } = await pool.query('SELECT * FROM cost_params WHERE organization_id=$1',[orgId]);
  if (rows[0]) return rows[0];
  const ins = await pool.query(
    `INSERT INTO cost_params(organization_id) VALUES($1)
     ON CONFLICT (organization_id) DO UPDATE SET organization_id=EXCLUDED.organization_id
     RETURNING *`, [orgId]);
  return ins.rows[0];
}

// GET params
router.get('/params', requireAuth, async (req,res)=>{
  const u = await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]);
  const orgId = u.rows[0]?.organization_id;
  if (!orgId) return res.status(400).json({ error:'no_org' });
  const p = await ensureParams(orgId);
  res.json(p);
});

// PUT params (upsert)
router.put('/params', requireAuth, async (req,res)=>{
  const u = await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]);
  const orgId = u.rows[0]?.organization_id;
  if (!orgId) return res.status(400).json({ error:'no_org' });

  const fields = [
    'conso_l_100km','prix_carburant_eur_l','entretien_eur_km',
    'pneus_prix_jeu','pneus_duree_vie_km','reparations_eur_km',
    'peages_eur_km','adblue_eur_km','cout_horaire_chauffeur','frais_fixes_horaire'
  ];
  const body = req.body || {};
  const sets = []; const vals = [orgId];
  fields.forEach((f,i)=>{ if (body[f] !== undefined) { vals.push(body[f]); sets.push(`${f}=$${vals.length}`); } });

  if (!sets.length) { const p = await ensureParams(orgId); return res.json(p); }

  const q = `INSERT INTO cost_params(organization_id, ${sets.map(s=>s.split('=')[0]).join(',')})
             VALUES($1, ${sets.map((_,i)=>`$${i+2}`).join(',')})
             ON CONFLICT (organization_id) DO UPDATE SET ${sets.join(',')}, updated_at=NOW()
             RETURNING *`;
  const { rows } = await pool.query(q, vals);
  res.json(rows[0]);
});

// GET compute
router.get('/compute', requireAuth, async (req,res)=>{
  const u = await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]);
  const orgId = u.rows[0]?.organization_id;
  if (!orgId) return res.status(400).json({ error:'no_org' });
  const p = await ensureParams(orgId);

  const carburant_km = Number(p.conso_l_100km) * Number(p.prix_carburant_eur_l) / 100;
  const pneus_km = Number(p.pneus_prix_jeu) / Math.max(1, Number(p.pneus_duree_vie_km));
  const eur_km_variable = (
    carburant_km +
    Number(p.entretien_eur_km) +
    pneus_km +
    Number(p.reparations_eur_km) +
    Number(p.peages_eur_km) +
    Number(p.adblue_eur_km)
  );

  const eur_hour = Number(p.cout_horaire_chauffeur) + Number(p.frais_fixes_horaire);

  res.json({
    eur_km_variable: Number(eur_km_variable.toFixed(3)),
    eur_hour: Number(eur_hour.toFixed(2)),
    params: p
  });
});

module.exports = router;
