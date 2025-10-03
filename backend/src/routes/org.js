const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT o.id,o.name,o.vat_number,o.currency,o.unit_system,o.logo_path,
           u.full_name,u.email
    FROM users u
    LEFT JOIN organizations o ON o.id=u.organization_id
    WHERE u.id=$1
  `,[req.user.id]);
  res.json(rows[0] || null);
});

router.put('/me', requireAuth, async (req, res) => {
  const { name, vat_number, currency='EUR', unit_system='metric', full_name, logo_base64 } = req.body || {};
  let orgId;
  const u = await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]);

  if (u.rows[0].organization_id) {
    orgId = u.rows[0].organization_id;
  } else {
    const o = await pool.query(
      'INSERT INTO organizations(name,vat_number,currency,unit_system) VALUES($1,$2,$3,$4) RETURNING id',
      [name || 'Ma société', vat_number, currency, unit_system]
    );
    orgId = o.rows[0].id;
    await pool.query('UPDATE users SET organization_id=$1 WHERE id=$2',[orgId, req.user.id]);
  }

  // logo (optionnel)
  let setLogo = '';
  let vals = [name, vat_number, currency, unit_system, orgId];
  if (logo_base64 && /^data:image\/(png|jpe?g);base64,/.test(logo_base64)) {
    const fs = require('fs'); const path = require('path');
    const ext = logo_base64.includes('image/png') ? 'png' : 'jpg';
    const b64 = logo_base64.split(',')[1];
    const buf = Buffer.from(b64,'base64');
    const uploads = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploads)) fs.mkdirSync(uploads);
    const fname = `logo_org_${orgId}.${ext}`;
    fs.writeFileSync(path.join(uploads, fname), buf);
    setLogo = ', logo_path=$6';
    vals = [name, vat_number, currency, unit_system, orgId, `/uploads/${fname}`];
  }

  await pool.query(
    `UPDATE organizations SET name=$1, vat_number=$2, currency=$3, unit_system=$4${setLogo} WHERE id=$5`,
    vals
  );

  if (full_name !== undefined) {
    await pool.query('UPDATE users SET full_name=$1 WHERE id=$2',[full_name, req.user.id]);
  }

  const { rows } = await pool.query(`
    SELECT o.id,o.name,o.vat_number,o.currency,o.unit_system,o.logo_path,
           u.full_name,u.email
    FROM users u JOIN organizations o ON o.id=u.organization_id
    WHERE u.id=$1
  `,[req.user.id]);

  res.json(rows[0]);
});


module.exports = router;
