require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');

(async () => {
  const email = 'admin@local.test';
  const password = 'Admin123!';
  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) ON CONFLICT (email) DO NOTHING', [email, hash, 'ADMIN']);
  console.log(`Seeded admin: ${email} / ${password}`);
  process.exit(0);
})();
