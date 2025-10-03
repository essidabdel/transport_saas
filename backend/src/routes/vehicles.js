const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function orgIdOf(req){
  const u = await pool.query('SELECT organization_id FROM users WHERE id=$1', [req.user.id]);
  return u.rows[0]?.organization_id || null;
}

function toAlerts(row){
  const today = new Date(); const D=x=>x?new Date(x):null;
  const alerts=[];
  const push=(label,dt)=>{ if(!dt) return; const diff=(D(dt)-today)/(1000*3600*24); if (diff<=30) alerts.push({ type: diff<0?'overdue':'soon', label, date: dt }); };
  push('Assurance', row.date_fin_assurance);
  push('Contrôle technique', row.date_prochain_controle_technique);
  push('Entretien', row.date_prochain_entretien);
  return alerts;
}

function computeCost(row){
  const carburant = (Number(row.conso_moyenne||0) * Number(row.prix_carburant||0)) / 100;
  const pneus = Number(row.pneus_prix_jeu||0) / Math.max(1, Number(row.pneus_duree_vie_km||1));
  const total = carburant
    + Number(row.entretien_moyen_km||0)
    + pneus
    + Number(row.reparations_moyennes||0)
    + Number(row.peages_moyens||0)
    + Number(row.adblue_moyen||0);
  return Number(total.toFixed(3));
}

// LIST
router.get('/', requireAuth, async (req,res)=>{
  const orgId = await orgIdOf(req); if(!orgId) return res.status(400).json({error:'no_org'});
  const { rows } = await pool.query('SELECT * FROM vehicles WHERE organization_id=$1 ORDER BY created_at DESC', [orgId]);
  const data = rows.map(r=>({ ...r, cout_variable_km: computeCost(r), alerts: toAlerts(r) }));
  res.json(data);
});

// CREATE
router.post('/', requireAuth, async (req,res)=>{
  const orgId = await orgIdOf(req); if(!orgId) return res.status(400).json({error:'no_org'});
  const f = req.body||{};
  const cols = [
    'organization_id','immatriculation','marque','modele','vin','energie','date_mise_en_circulation','kilometrage_actuel',
    'assurance_annuelle','financement_mensuel','taxe_annuelle','abonnement_gps',
    'conso_moyenne','prix_carburant','entretien_moyen_km','pneus_prix_jeu','pneus_duree_vie_km',
    'reparations_moyennes','peages_moyens','adblue_moyen',
    'date_prochain_controle_technique','date_fin_assurance','date_prochain_entretien'
  ];
  const vals=[orgId, f.immatriculation, f.marque, f.modele, f.vin, f.energie, f.date_mise_en_circulation, f.kilometrage_actuel,
    f.assurance_annuelle,f.financement_mensuel,f.taxe_annuelle,f.abonnement_gps,
    f.conso_moyenne,f.prix_carburant,f.entretien_moyen_km,f.pneus_prix_jeu,f.pneus_duree_vie_km,
    f.reparations_moyennes,f.peages_moyens,f.adblue_moyen,
    f.date_prochain_controle_technique,f.date_fin_assurance,f.date_prochain_entretien
  ];
  const placeholders = cols.map((_,i)=>`$${i+1}`).join(',');
  const { rows } = await pool.query(
    `INSERT INTO vehicles(${cols.join(',')}) VALUES(${placeholders}) RETURNING *`, vals
  );
  const r=rows[0]; res.json({ ...r, cout_variable_km: computeCost(r), alerts: toAlerts(r) });
});

// UPDATE
router.put('/:id', requireAuth, async (req,res)=>{
  const orgId = await orgIdOf(req); if(!orgId) return res.status(400).json({error:'no_org'});
  const id = Number(req.params.id);
  const allowed = [
    'immatriculation','marque','modele','vin','energie','date_mise_en_circulation','kilometrage_actuel',
    'assurance_annuelle','financement_mensuel','taxe_annuelle','abonnement_gps',
    'conso_moyenne','prix_carburant','entretien_moyen_km','pneus_prix_jeu','pneus_duree_vie_km',
    'reparations_moyennes','peages_moyens','adblue_moyen',
    'date_prochain_controle_technique','date_fin_assurance','date_prochain_entretien'
  ];
  const body=req.body||{};
  const sets=[]; const vals=[];
  allowed.forEach(k=>{ if (body[k] !== undefined) { vals.push(body[k]); sets.push(`${k}=$${vals.length}`); }});
  if (!sets.length) return res.status(400).json({error:'no_fields'});
  vals.push(orgId); vals.push(id);
  const { rows } = await pool.query(
    `UPDATE vehicles SET ${sets.join(',')}, updated_at=NOW() WHERE organization_id=$${vals.length-1} AND id=$${vals.length} RETURNING *`,
    vals
  );
  const r=rows[0]; if(!r) return res.status(404).json({error:'not_found'});
  res.json({ ...r, cout_variable_km: computeCost(r), alerts: toAlerts(r) });
});

// DELETE
router.delete('/:id', requireAuth, async (req,res)=>{
  const orgId = await orgIdOf(req); if(!orgId) return res.status(400).json({error:'no_org'});
  const id = Number(req.params.id);
  await pool.query('DELETE FROM vehicles WHERE organization_id=$1 AND id=$2',[orgId,id]);
  res.json({ ok:true });
});

module.exports = router;
