const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function orgId(req){ const r=await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]); return r.rows[0]?.organization_id; }

router.get('/', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const q=req.query.q?.trim(); const vals=[org]; let sql='SELECT * FROM customers WHERE organization_id=$1';
  if(q){ vals.push('%'+q+'%'); sql+=' AND name ILIKE $2'; }
  sql+=' ORDER BY created_at DESC LIMIT 100';
  const { rows } = await pool.query(sql, vals); res.json(rows);
});

router.post('/', requireAuth, async (req,res)=>{
  const org=await orgId(req); if(!org) return res.status(400).json({error:'no_org'});
  const { name,address,vat_number,email,phone } = req.body||{};
  const { rows } = await pool.query(
    'INSERT INTO customers(organization_id,name,address,vat_number,email,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [org,name,address,vat_number,email,phone]
  ); res.json(rows[0]);
});

module.exports = router;
