// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const crypto = require('crypto');
const { pool } = require('../db');
const { pushFail, clearIp, isIpLocked } = require('../middleware/loginIpGuard');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const LOCK_WINDOW_MIN = 15;
const MAX_FAILS = 5;

// helpers
async function isLocked(email) {
  const q = `
    SELECT COUNT(*)::int AS fails
    FROM login_audit
    WHERE email=$1 AND success=false AND created_at > NOW() - INTERVAL '${LOCK_WINDOW_MIN} minutes'
  `;
  const { rows } = await pool.query(q, [email]);
  return rows[0].fails >= MAX_FAILS;
}

async function audit({ user_id = null, email, ip, ua, success, reason = null }) {
  await pool.query(
    'INSERT INTO login_audit(user_id,email,ip,user_agent,success,reason) VALUES($1,$2,$3,$4,$5,$6)',
    [user_id, email, ip, ua, success, reason]
  );
}

// POST /api/auth/register (pour tests)
router.post('/register', async (req, res) => {
  const { email, password, role = 'CLIENT' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email/password' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id,email,role',
      [email, hash, role]
    );
    res.json(rows[0]);
  } catch {
    res.status(400).json({ error: 'duplicate or invalid' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password, otp_code } = req.body;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || '';

  if (!email || !password) return res.status(400).json({ error: 'email/password' });

  if (await isLocked(email) || isIpLocked(ip)) {
    await audit({ email, ip, ua, success: false, reason: 'locked' });
    return res.status(429).json({ error: 'Too many attempts, try later' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
  const user = rows[0];
  if (!user) {
    pushFail(ip);
    await audit({ email, ip, ua, success: false, reason: 'no_user' });
    return res.status(401).json({ error: 'Invalid creds' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    pushFail(ip);
    await audit({ user_id: user.id, email, ip, ua, success: false, reason: 'bad_password' });
    return res.status(401).json({ error: 'Invalid creds' });
  }

  if (user.otp_enabled) {
    if (!otp_code) {
      pushFail(ip);
      await audit({ user_id: user.id, email, ip, ua, success: false, reason: 'otp_required' });
      return res.status(401).json({ error: 'OTP required' });
    }
    const verified = speakeasy.totp.verify({
      secret: user.otp_secret,
      encoding: 'base32',
      token: otp_code,
      window: 1
    });
    if (!verified) {
      pushFail(ip);
      await audit({ user_id: user.id, email, ip, ua, success: false, reason: 'otp_invalid' });
      return res.status(401).json({ error: 'OTP invalid' });
    }
  }

  // --- bloc succès (remplacé) ---
  clearIp(ip);

  // Access 15 min
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // Refresh 7 jours
  const refreshToken = crypto.randomBytes(32).toString('hex');
  await pool.query(
    "INSERT INTO refresh_tokens(user_id, token, expires_at) VALUES($1,$2, NOW() + INTERVAL '7 days')",
    [user.id, refreshToken]
  );

  await audit({ user_id: user.id, email, ip, ua, success: true });
  return res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    role: user.role,
    email: user.email
  });
  // --- fin bloc succès ---
});

// POST /api/auth/enable-otp
router.post('/enable-otp', async (req, res) => {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const secret = speakeasy.generateSecret({ name: `TransportSaaS (${payload.email})` });
  await pool.query('UPDATE users SET otp_enabled=true, otp_secret=$1 WHERE id=$2', [
    secret.base32,
    payload.id
  ]);
  res.json({ base32: secret.base32, otpauth_url: secret.otpauth_url });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json(payload);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /api/auth/refresh  { refresh_token }
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'missing refresh_token' });

  const { rows } = await pool.query(
    'SELECT * FROM refresh_tokens WHERE token=$1 AND revoked=false AND expires_at>NOW()',
    [refresh_token]
  );
  const rt = rows[0];
  if (!rt) return res.status(401).json({ error: 'invalid refresh' });

  const ures = await pool.query('SELECT id,email,role FROM users WHERE id=$1', [rt.user_id]);
  const u = ures.rows[0];
  if (!u) return res.status(401).json({ error: 'invalid refresh' });

  // rotation
  await pool.query('UPDATE refresh_tokens SET revoked=true WHERE id=$1', [rt.id]);

  const newRefresh = crypto.randomBytes(32).toString('hex');
  await pool.query(
    "INSERT INTO refresh_tokens(user_id, token, expires_at) VALUES($1,$2, NOW() + INTERVAL '7 days')",
    [u.id, newRefresh]
  );

  const access = jwt.sign({ id: u.id, role: u.role, email: u.email }, process.env.JWT_SECRET, { expiresIn: '15m' });
  res.json({ access_token: access, refresh_token: newRefresh });
});

// POST /api/auth/logout  { refresh_token }
router.post('/logout', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'missing refresh_token' });
  await pool.query('UPDATE refresh_tokens SET revoked=true WHERE token=$1', [refresh_token]);
  res.json({ ok: true });
});
router.get('/roles-check', requireAuth, (req, res) => {
  res.json({ role: req.user.role, email: req.user.email });
});

module.exports = router;
