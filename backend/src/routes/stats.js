const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function orgId(req){ const r=await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]); return r.rows[0]?.organization_id; }

router.get('/kpis', requireAuth, async (req,res)=>{
  const org = await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { from, to } = req.query;

  const base = [`organization_id=$1`]; const vals=[org];
  if(from){ vals.push(from); base.push(`date_plan >= $${vals.length}`); }
  if(to){   vals.push(to);   base.push(`date_plan <= $${vals.length}`); }
  const where = base.join(' AND ');

  const q = await pool.query(`
    WITH s AS (
      SELECT *
      FROM jobs
      WHERE ${where} AND status='DONE'
    )
    SELECT
      COUNT(*)::int AS jobs_done,
      COALESCE(SUM(GREATEST(COALESCE(km_end,0)-COALESCE(km_start,0),0)),0)::int AS km_tot,
      COALESCE(SUM(cost_total_eur),0)::float AS cout_total,
      COALESCE(SUM(revenue_eur),0)::float    AS ca,
      COALESCE(SUM(margin_eur),0)::float     AS marge
    FROM s
  `, vals);

  const r = q.rows[0];
  const eur_km_reel = (Number(r.km_tot)>0) ? (Number(r.cout_total)/Number(r.km_tot)).toFixed(3) : null;

  res.json({
    jobs_done: r.jobs_done,
    km_total: Number(r.km_tot||0),
    cout_total: Number(r.cout_total||0).toFixed(2),
    ca: Number(r.ca||0).toFixed(2),
    marge: Number(r.marge||0).toFixed(2),
    eur_km_reel
  });
});


router.get('/revenue-by-day', requireAuth, async (req,res)=>{
  const org = await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { from, to } = req.query;
  const vals=[org]; let where=`organization_id=$1 AND status='DONE'`;
  if(from){ vals.push(from); where+=` AND date_plan >= $${vals.length}`; }
  if(to){   vals.push(to);   where+=` AND date_plan <= $${vals.length}`; }
  const { rows } = await pool.query(`
    SELECT to_char(date_plan,'YYYY-MM-DD') AS d,
           COALESCE(SUM(revenue_eur),0)::float AS ca,
           COALESCE(SUM(cost_total_eur),0)::float AS cout
    FROM jobs
    WHERE ${where}
    GROUP BY d ORDER BY d
  `, vals);
  res.json(rows);
});


module.exports = router;
