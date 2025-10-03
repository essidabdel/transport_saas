require('dotenv').config();
const { pool } = require('../db');

(async()=>{
  const orgName = 'Demo Transport';
  const o = await pool.query(
    "INSERT INTO organizations(name,currency,unit_system) VALUES($1,'EUR','metric') RETURNING id",
    [orgName]
  );
  const orgId = o.rows[0].id;
  await pool.query("UPDATE users SET organization_id=$1 WHERE email=$2", [orgId, 'admin@local.test']);
  console.log('Seeded org', orgId);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
