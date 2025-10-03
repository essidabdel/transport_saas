// src/routes/admin/audit.js
const express = require('express');
const { pool } = require('../../db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { email, success, limit=50, offset=0 } = req.query;
  const cond=[], vals=[];
  if (email) { vals.push(email); cond.push(`email=$${vals.length}`); }
  if (success==='true' || success==='false') { vals.push(success==='true'); cond.push(`success=$${vals.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const q = `
    SELECT id,user_id,email,ip,user_agent,success,reason,created_at
    FROM login_audit
    ${where}
    ORDER BY created_at DESC
    LIMIT ${Number(limit)||50} OFFSET ${Number(offset)||0}
  `;
  const { rows } = await pool.query(q, vals);
  res.json(rows);
});

router.post('/unlock', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { email, ip } = req.body || {};
  const tasks = [];
  if (email) tasks.push(pool.query('DELETE FROM login_audit WHERE email=$1', [email]));
  if (ip) { const { clearIp } = require('../../middleware/loginIpGuard'); clearIp(ip); }
  await Promise.all(tasks);
  res.json({ ok: true, cleared_email: !!email, cleared_ip: !!ip });
});

module.exports = router;
