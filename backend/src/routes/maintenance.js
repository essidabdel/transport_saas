const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function orgId(req){ const r=await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]); return r.rows[0]?.organization_id; }

/** Agrège alertes “système” depuis vehicles (CT/Assurance/Entretien) + tâches maintenance en retard/à venir (30j) */
router.get('/alerts', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { rows:vs } = await pool.query('SELECT * FROM vehicles WHERE organization_id=$1',[org]);
  const today = new Date(); const add=(arr,type,label,veh,date)=>{ if(!date) return;
    const d=new Date(date); const diff = Math.floor((d - today)/(1000*3600*24));
    if (diff <= 30) arr.push({ type, label, vehicle_id:veh.id, immat:veh.immatriculation, date: d.toISOString().slice(0,10), status: diff<0?'overdue':'soon' });
  };
  const alerts=[];
  vs.forEach(v=>{
    add(alerts,'CT','Contrôle technique',v, v.date_prochain_controle_technique);
    add(alerts,'ASSURANCE','Fin assurance',v, v.date_fin_assurance);
    add(alerts,'ENTRETIEN','Prochain entretien',v, v.date_prochain_entretien);
  });

  const { rows:ms } = await pool.query(
    `SELECT m.*, v.immatriculation FROM maintenance m
     JOIN vehicles v ON v.id=m.vehicle_id
     WHERE m.organization_id=$1 AND m.done=false AND (m.due_date IS NOT NULL)`, [org]);
  ms.forEach(m=>{
    const d = new Date(m.due_date); const diff = Math.floor((d - today)/(1000*3600*24));
    if (diff <= 30) alerts.push({ type:m.kind, label:m.notes||m.kind, vehicle_id:m.vehicle_id, immat:m.immatriculation, date: d.toISOString().slice(0,10), status: diff<0?'overdue':'soon' });
  });

  alerts.sort((a,b)=>a.date.localeCompare(b.date));
  res.json(alerts);
});

// CRUD maintenance
router.get('/', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { rows } = await pool.query(
    `SELECT m.*, v.immatriculation FROM maintenance m
     JOIN vehicles v ON v.id=m.vehicle_id
     WHERE m.organization_id=$1
     ORDER BY m.done ASC, COALESCE(m.due_date, NOW()+interval '100 years') ASC, m.created_at DESC
     LIMIT 500`, [org]);
  res.json(rows);
});

router.post('/', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { vehicle_id, kind, due_date, due_km, notes } = req.body||{};
  const { rows } = await pool.query(
    `INSERT INTO maintenance(organization_id, vehicle_id, kind, due_date, due_km, notes)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [org, vehicle_id, kind, due_date||null, due_km||null, notes||null]
  );
  res.json(rows[0]);
});

router.put('/:id', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const id=Number(req.params.id); const body=req.body||{};
  const allowed=['kind','due_date','due_km','notes','done','done_at','mileage_at_done'];
  const sets=[]; const vals=[];
  allowed.forEach(k=>{ if (body[k] !== undefined) { vals.push(body[k]); sets.push(`${k}=$${vals.length}`); }});
  if (!sets.length) return res.status(400).json({error:'no_fields'});
  vals.push(org); vals.push(id);
  const { rows } = await pool.query(
   `UPDATE maintenance SET ${sets.join(',')}, updated_at=NOW()
    WHERE organization_id=$${vals.length-1} AND id=$${vals.length}
    RETURNING *`, vals);
  if(!rows[0]) return res.status(404).json({error:'not_found'});
  res.json(rows[0]);
});

router.delete('/:id', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const id=Number(req.params.id);
  await pool.query('DELETE FROM maintenance WHERE organization_id=$1 AND id=$2',[org,id]);
  res.json({ ok:true });
});

module.exports = router;
