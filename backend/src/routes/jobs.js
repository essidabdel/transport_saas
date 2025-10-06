// backend/src/routes/jobs.js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function orgId(req) {
  const r = await pool.query('SELECT organization_id FROM users WHERE id=$1', [req.user.id]);
  return r.rows[0]?.organization_id;
}

// ---------- Helpers coût ----------
async function getOrgParams(orgId){
  const r = await pool.query('SELECT * FROM cost_params WHERE organization_id=$1',[orgId]);
  return r.rows[0] || {};
}
function vehCostPerKm(v, p){
  const pick=(vk,pk)=> (v && v[vk]!=null) ? Number(v[vk]) : Number(p[pk]||0);
  const carburant = (pick('conso_moyenne','conso_l_100km') * pick('prix_carburant','prix_carburant_eur_l')) / 100;
  const pneus = (pick('pneus_prix_jeu','pneus_prix_jeu') / Math.max(1, pick('pneus_duree_vie_km','pneus_duree_vie_km')));
  return Number((carburant
    + pick('entretien_moyen_km','entretien_eur_km')
    + pneus
    + pick('reparations_moyennes','reparations_eur_km')
    + pick('peages_moyens','peages_eur_km')
    + pick('adblue_moyen','adblue_eur_km')).toFixed(3));
}
function driverCostPerHour(d){
  if (!d) return 0;
  const brut = Number(d.salaire_brut_mensuel||d.salaire_brut_mensuel===0? d.salaire_brut_mensuel : d.brut) || 0;
  const ch   = Number(d.charges_patronales_pct || d.charges || 0)/100;
  const fg   = Number(d.frais_generaux_pct || d.fg || 0)/100;
  const hpm  = Math.max(1, Number(d.heures_productives_mois || d.hpm || 140));
  const mensuel_total = brut*(1+ch)*(1+fg);
  return Number((mensuel_total/hpm).toFixed(2));
}

// ---------- List ----------
router.get('/', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { from, to, status } = req.query;

  const vals=[org];
  let sql=`
    SELECT j.*, 
           c.name AS customer_name, 
           v.immatriculation, 
           d.full_name AS driver_name
    FROM jobs j
    LEFT JOIN customers c ON c.id=j.customer_id
    LEFT JOIN vehicles v  ON v.id=j.vehicle_id
    LEFT JOIN drivers d   ON d.id=j.driver_id
    WHERE j.organization_id=$1`;
  if (from){ vals.push(from); sql+=` AND j.date_plan >= $${vals.length}`; }
  if (to){   vals.push(to);   sql+=` AND j.date_plan <= $${vals.length}`; }
  if (status){ vals.push(status); sql+=` AND j.status = $${vals.length}`; }
  sql += ` ORDER BY j.date_plan DESC, j.id DESC LIMIT 500`;

  const { rows } = await pool.query(sql, vals);
  res.json(rows);
});

// ---------- Create (PLANNED) ----------
router.post('/', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { customer_id=null, vehicle_id=null, driver_id=null, ref, pickup_addr='', dropoff_addr='', date_plan, notes='' } = req.body||{};
  if(!ref || !date_plan) return res.status(400).json({error:'missing_ref_or_date'});

  const { rows } = await pool.query(
    `INSERT INTO jobs(organization_id,customer_id,vehicle_id,driver_id,ref,pickup_addr,dropoff_addr,date_plan,notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [org, customer_id, vehicle_id, driver_id, ref, pickup_addr, dropoff_addr, date_plan, notes]
  );
  res.json(rows[0]);
});

// ---------- Edit ----------
router.put('/:id', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const id=Number(req.params.id);
  const allowed=['customer_id','vehicle_id','driver_id','ref','pickup_addr','dropoff_addr','date_plan','status','notes'];

  const sets=[], vals=[];
  allowed.forEach(k=>{ if (req.body[k] !== undefined){ vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); }});
  if(!sets.length) return res.status(400).json({error:'no_fields'});

  vals.push(org); vals.push(id);
  const { rows } = await pool.query(
    `UPDATE jobs SET ${sets.join(',')}, updated_at=NOW()
     WHERE organization_id=$${vals.length-1} AND id=$${vals.length}
     RETURNING *`, vals);
  if(!rows[0]) return res.status(404).json({error:'not_found'});
  res.json(rows[0]);
});

// ---------- Mark DONE (saisie réels + calculs) ----------
router.post('/:id/done', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const id=Number(req.params.id);
  const { km_start=null, km_end=null, tolls_eur=0, wait_minutes=0, drive_minutes=0, started_at=null, ended_at=null, revenue_eur=null } = req.body||{};

  // fetch job
  const j = await pool.query('SELECT * FROM jobs WHERE id=$1 AND organization_id=$2',[id,org]);
  if(!j.rows[0]) return res.status(404).json({error:'not_found'});
  const job=j.rows[0];

  // contexte coûts
  const p = await getOrgParams(org);
  const v = job.vehicle_id ? (await pool.query('SELECT * FROM vehicles WHERE id=$1 AND organization_id=$2',[job.vehicle_id,org])).rows[0] : null;
  const d = job.driver_id  ? (await pool.query('SELECT * FROM drivers  WHERE id=$1 AND organization_id=$2',[job.driver_id,org])).rows[0]  : null;

  const eur_km = v ? vehCostPerKm(v,p) : vehCostPerKm(null,p);
  const eur_h  = d ? (Number(d.cout_horaire||0) || driverCostPerHour(d)) : Number(p.cout_horaire_chauffeur||0) + Number(p.frais_fixes_horaire||0);

  // --- Validation & calculs demandés ---
  const km = (km_start!=null && km_end!=null) ? (Number(km_end) - Number(km_start)) : 0;
  if (km < 0)  return res.status(400).json({ error:'km_negative' });
  if (km > 1500) return res.status(400).json({ error:'km_unrealistic' }); // plafond simple

  const hours = Number(drive_minutes||0)/60 + Number(wait_minutes||0)/60;

  const cost_vehicle = (km * eur_km) + Number(tolls_eur||0);
  const cost_driver  = (hours * eur_h);
  const cost_total   = cost_vehicle + cost_driver;
  const revenue      = revenue_eur!=null ? Number(revenue_eur) : null;
  const margin       = revenue!=null ? (revenue - cost_total) : null;

  const { rows } = await pool.query(
    `UPDATE jobs SET 
       status='DONE',
       km_start=$1, km_end=$2, tolls_eur=$3, wait_minutes=$4, drive_minutes=$5,
       started_at=$6, ended_at=$7,
       cost_vehicle_eur=$8, cost_driver_eur=$9, cost_total_eur=$10,
       revenue_eur=$11, margin_eur=$12,
       updated_at=NOW()
     WHERE organization_id=$13 AND id=$14
     RETURNING *`,
    [km_start, km_end, tolls_eur, wait_minutes, drive_minutes, started_at, ended_at,
     cost_vehicle.toFixed(2), cost_driver.toFixed(2), cost_total.toFixed(2),
     revenue!=null? revenue.toFixed(2): null, margin!=null? margin.toFixed(2): null,
     org, id]
  );
  res.json(rows[0]);
});

// ---------- Export CSV (UTF-8 BOM ; séparateur ;) ----------
router.get('/export.csv', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).send('no_org');
  const { from, to } = req.query;

  const cols = [
    'id','ref','date','status','customer','vehicle','driver',
    'km_start','km_end','tolls_eur','wait_minutes','drive_minutes',
    'cost_vehicle_eur','cost_driver_eur','cost_total_eur','revenue_eur','margin_eur'
  ];

  const vals=[org];
  let sql=`
    SELECT j.id,
           j.ref,
           to_char(j.date_plan,'YYYY-MM-DD') AS date,       -- date ISO
           j.status,
           COALESCE(c.name,'') AS customer,
           COALESCE(v.immatriculation,'') AS vehicle,
           COALESCE(d.full_name,'') AS driver,
           j.km_start, j.km_end, j.tolls_eur, j.wait_minutes, j.drive_minutes,
           j.cost_vehicle_eur, j.cost_driver_eur, j.cost_total_eur,
           j.revenue_eur, j.margin_eur
    FROM jobs j
    LEFT JOIN customers c ON c.id=j.customer_id
    LEFT JOIN vehicles  v ON v.id=j.vehicle_id
    LEFT JOIN drivers   d ON d.id=j.driver_id
    WHERE j.organization_id=$1`;
  if(from){ vals.push(from); sql+=` AND j.date_plan >= $${vals.length}`; }
  if(to){   vals.push(to);   sql+=` AND j.date_plan <= $${vals.length}`; }
  sql += ' ORDER BY j.date_plan DESC, j.id DESC';

  const { rows } = await pool.query(sql, vals);

  const sep = ';'; // séparateur FR pour Excel
  const esc = s => {
    const str = s==null ? '' : String(s);
    return /[";\n]/.test(str) ? `"${str.replace(/"/g,'""')}"` : str;
  };
  const head = cols.join(sep);
  const lines = rows.map(r => cols.map(k => esc(r[k])).join(sep));
  const csv = '\uFEFF' + [head, ...lines].join('\n'); // BOM UTF-8

  res.setHeader('Content-Type','text/csv; charset=utf-8');
  const name = `jobs_${(from||'all')}_${(to||'all')}.csv`.replace(/[^a-zA-Z0-9_.-]/g,'_');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
});

module.exports = router;
