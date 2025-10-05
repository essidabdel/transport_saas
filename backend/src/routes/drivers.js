const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function orgId(req) {
  const r = await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]);
  return r.rows[0]?.organization_id;
}
function computeCost(d){
  const brut = Number(d.salaire_brut_mensuel||0);
  const ch   = Number(d.charges_patronales_pct||0)/100;
  const fg   = Number(d.frais_generaux_pct||0)/100;
  const hpm  = Math.max(1, Number(d.heures_productives_mois||1));
  const mensuel_total = brut * (1+ch) * (1+fg);
  return Number((mensuel_total / hpm).toFixed(2));
}

router.get('/', requireAuth, async (req,res)=>{
  const org = await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { rows } = await pool.query('SELECT * FROM drivers WHERE organization_id=$1 ORDER BY created_at DESC',[org]);
  res.json(rows.map(r=>({ ...r, cout_horaire: computeCost(r) })));
});

router.post('/', requireAuth, async (req,res)=>{
  const org = await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const f = req.body||{};
  const ch = await pool.query(
    `INSERT INTO drivers(organization_id,full_name,email,phone,
      salaire_brut_mensuel,charges_patronales_pct,frais_generaux_pct,heures_productives_mois,cout_horaire)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [org,f.full_name,f.email,f.phone,f.salaire_brut_mensuel,f.charges_patronales_pct,f.frais_generaux_pct,f.heures_productives_mois,null]
  );
  const d = ch.rows[0]; const cost = computeCost(d);
  const upd = await pool.query('UPDATE drivers SET cout_horaire=$1 WHERE id=$2 RETURNING *',[cost,d.id]);
  res.json(upd.rows[0]);
});

router.put('/:id', requireAuth, async (req,res)=>{
  const org = await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const id = Number(req.params.id);
  const allowed = ['full_name','email','phone','salaire_brut_mensuel','charges_patronales_pct','frais_generaux_pct','heures_productives_mois'];
  const sets=[], vals=[];
  allowed.forEach(k=>{ if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); } });
  if (!sets.length) return res.status(400).json({error:'no_fields'});
  vals.push(org); vals.push(id);
  const { rows } = await pool.query(
    `UPDATE drivers SET ${sets.join(',')}, updated_at=NOW()
     WHERE organization_id=$${vals.length-1} AND id=$${vals.length} RETURNING *`, vals);
  const d = rows[0]; if(!d) return res.status(404).json({error:'not_found'});
  const cost = computeCost(d);
  const upd = await pool.query('UPDATE drivers SET cout_horaire=$1 WHERE id=$2 RETURNING *',[cost,d.id]);
  res.json(upd.rows[0]);
});

router.delete('/:id', requireAuth, async (req,res)=>{
  const org = await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  await pool.query('DELETE FROM drivers WHERE organization_id=$1 AND id=$2',[org,Number(req.params.id)]);
  res.json({ ok:true });
});

module.exports = router;
