require('dotenv').config();
const { requireAuth, requireRoles } = require('./middleware/auth');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/org', require('./routes/org'));

// init DB schema once at startup
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
pool.query(schema).catch(err => { console.error('Schema init error', err); process.exit(1); });

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./routes/auth'));

const port = process.env.PORT || 4000;
app.get('/api/admin/ping', requireAuth, requireRoles('ADMIN'), (_req, res)=>res.json({ ok:true, scope:'admin' }));
app.get('/api/client/ping', requireAuth, requireRoles('CLIENT','ADMIN'), (_req, res)=>res.json({ ok:true, scope:'client' }));

app.listen(port, () => console.log(`API on http://localhost:${port}`));

const rateLimit = require('./middleware/rateLimit');

// ...
app.use('/api/auth', rateLimit, require('./routes/auth'));
app.use('/api/admin/audit', require('./routes/admin/audit'));
app.use('/api/cost', require('./routes/cost'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/quotes', require('./routes/quotes'));