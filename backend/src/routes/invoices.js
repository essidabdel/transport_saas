// backend/src/routes/invoices.js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const router = express.Router();

/* ---------- Logger + guards param ---------- */
router.use((req, res, next) => {
  console.log('[invoices]', req.method, req.originalUrl);
  next();
});

const asInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
};
router.param('id', (req, res, next, id) => {
  const n = asInt(id);
  if (n === null) return res.status(400).json({ error: 'bad_id' });
  req.invId = n;
  next();
});
router.param('quoteId', (req, res, next, id) => {
  const n = asInt(id);
  if (n === null) return res.status(400).json({ error: 'bad_quote_id' });
  req.quoteId = n;
  next();
});

/* ---------- Helpers ---------- */
const asNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

async function orgId(req) {
  const r = await pool.query('SELECT organization_id FROM users WHERE id=$1', [req.user.id]);
  return r.rows[0]?.organization_id;
}
async function nextNumber(org) {
  const y = new Date().getFullYear();
  const { rows } = await pool.query(
    `SELECT number FROM invoices WHERE organization_id=$1 AND number LIKE $2 ORDER BY id DESC LIMIT 1`,
    [org, `${y}-INV-%`]
  );
  if (!rows[0]) return `${y}-INV-0001`;
  const last = Number(rows[0].number.split('-').pop() || '0');
  return `${y}-INV-${String(last + 1).padStart(4, '0')}`;
}

/* ---------- Recompute totals + status ---------- */
async function recomputeInvoiceTotals(clientOrPool, id, orgId) {
  const c = clientOrPool;
  const inv = await c.query(
    `SELECT vat_rate, due_date, status
     FROM invoices WHERE id=$1 AND organization_id=$2`,
    [id, orgId]
  );
  if (!inv.rows[0]) throw new Error('inv_not_found');

  const vat = Number(inv.rows[0].vat_rate || 0);
  const due = inv.rows[0].due_date ? String(inv.rows[0].due_date).slice(0, 10) : null;
  const currStatus = inv.rows[0].status;

  const it = await c.query(
    `SELECT COALESCE(SUM(line_total),0)::float AS ht
     FROM invoice_items WHERE invoice_id=$1`,
    [id]
  );
  const total_ht = Number(it.rows[0].ht || 0);
  const total_ttc = total_ht * (1 + vat / 100);

  const pay = await c.query(
    `SELECT COALESCE(SUM(amount),0)::float AS paid
     FROM invoice_payments WHERE invoice_id=$1`,
    [id]
  );
  const paid = Number(pay.rows[0].paid || 0);
  const remaining = Math.max(0, total_ttc - paid);

  // statut calculé
  const today = new Date().toISOString().slice(0, 10);
  let nextStatus = currStatus;
  if (currStatus !== 'CANCELLED') {
    if (remaining <= 0) nextStatus = 'PAID';
    else if (due && due < today) nextStatus = 'OVERDUE';
    else nextStatus = 'SENT';
  }

  const up = await c.query(
    `UPDATE invoices
       SET total_ht=$1, total_ttc=$2, remaining=$3, status=$4
     WHERE id=$5 AND organization_id=$6
     RETURNING *`,
    [total_ht.toFixed(2), total_ttc.toFixed(2), remaining.toFixed(2), nextStatus, id, orgId]
  );
  return up.rows[0];
}

/* ===========================================================
   1) LISTE
   =========================================================== */
router.get('/', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).json({ error: 'no_org' });

  const { status } = req.query; // OVERDUE | PAID | SENT | CANCELLED
  const { rows } = await pool.query(`
    SELECT
      i.*,
      c.name AS customer_name,
      CASE
        WHEN i.status <> 'CANCELLED'
         AND i.remaining > 0
         AND i.due_date IS NOT NULL
         AND i.due_date < CURRENT_DATE
        THEN 'OVERDUE'
        ELSE i.status
      END AS status_calc
    FROM invoices i
    JOIN customers c ON c.id=i.customer_id
    WHERE i.organization_id=$1
    ORDER BY i.created_at DESC
    LIMIT 500
  `, [org]);

  const out = rows.map(r => ({ ...r, status: r.status_calc }));
  const filtered = status ? out.filter(r => String(r.status) === String(status)) : out;
  res.json(filtered);
});

/* ===========================================================
   2) EXPORT CSV (avant /:id)
   =========================================================== */
router.get('/export.csv', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).send('no_org');
  const { status } = req.query;

  const { rows } = await pool.query(`
    SELECT
      i.*,
      c.name AS customer_name,
      CASE
        WHEN i.status <> 'CANCELLED'
         AND i.remaining > 0
         AND i.due_date IS NOT NULL
         AND i.due_date < CURRENT_DATE
        THEN 'OVERDUE'
        ELSE i.status
      END AS status_calc
    FROM invoices i
    JOIN customers c ON c.id=i.customer_id
    WHERE i.organization_id=$1
    ORDER BY i.created_at DESC
    LIMIT 500
  `, [org]);

  const data = rows.map(r => ({
    number: r.number,
    customer: r.customer_name,
    due_date: r.due_date ? String(r.due_date).slice(0, 10) : '',
    status: r.status_calc,
    total_ht: Number(r.total_ht || 0).toFixed(2),
    total_ttc: Number(r.total_ttc || 0).toFixed(2),
    paid: (Number(r.total_ttc || 0) - Number(r.remaining || 0)).toFixed(2),
    remaining: Number(r.remaining || 0).toFixed(2)
  })).filter(r => !status || r.status === status);

  const cols = ['number', 'customer', 'due_date', 'status', 'total_ht', 'total_ttc', 'paid', 'remaining'];
  const sep = ';';
  const esc = s => {
    const str = s == null ? '' : String(s);
    return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = cols.join(sep);
  const lines = data.map(r => cols.map(k => esc(r[k])).join(sep));
  const csv = '\uFEFF' + [head, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="invoices_${status || 'all'}.csv"`);
  res.send(csv);
});

/* ===========================================================
   3) FROM QUOTE (avant /:id)
   =========================================================== */
router.post('/from-quote/:quoteId', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).json({ error: 'no_org' });
  const qid = req.quoteId; // validé par router.param

  const q = await pool.query(
    `SELECT * FROM quotes WHERE id=$1 AND organization_id=$2`,
    [qid, org]
  );
  if (!q.rows[0]) return res.status(404).json({ error: 'quote_not_found' });

  // Lignes du devis
  const qi = await pool.query(
    `SELECT label, qty, unit_price, COALESCE(line_total, qty*unit_price) AS line_total
     FROM quote_items WHERE quote_id=$1 ORDER BY id`,
    [qid]
  );
  if (qi.rows.length === 0) return res.status(400).json({ error: 'quote_empty' });

  // Numéro + total
  const number = await nextNumber(org);
  const total = qi.rows.reduce((s, r) => s + Number(r.line_total || 0), 0);

  // Transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ins = await client.query(
      `INSERT INTO invoices(organization_id,customer_id,number,quote_id,currency,notes,total_ht)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [org, q.rows[0].customer_id, number, qid, q.rows[0].currency, q.rows[0].notes || null, total.toFixed(2)]
    );
    const invId = ins.rows[0].id;

    // Items
    const vals = [], ph = [];
    qi.rows.forEach((r, idx) => {
      vals.push(invId, r.label, Number(r.qty || 0), Number(r.unit_price || 0), Number(r.line_total || 0));
      const i = idx * 5;
      ph.push(`($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5})`);
    });
    await client.query(
      `INSERT INTO invoice_items(invoice_id,label,qty,unit_price,line_total) VALUES ${ph.join(',')}`,
      vals
    );

    await client.query('COMMIT');
    return res.json({ id: invId, number });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'create_invoice_failed' });
  } finally {
    client.release();
  }
});

// --- NOUVELLE ROUTE : création manuelle d'une facture -->
router.post('/', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).json({ error: 'no_org' });
  const { customer_id, items = [], vat_rate = 0, due_date = null, currency = 'EUR', notes = null } = req.body || {};

  if (!customer_id) return res.status(400).json({ error: 'missing_customer' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'empty_items' });

  // total HT
  const total_ht = items.reduce((s, r) => s + Number(r.line_total != null ? r.line_total : (Number(r.qty || 0) * Number(r.unit_price || 0))), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const number = await nextNumber(org);

    const ins = await client.query(
      `INSERT INTO invoices(organization_id, customer_id, number, currency, notes, vat_rate, total_ht)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [org, customer_id, number, currency, notes, Number(vat_rate || 0), total_ht.toFixed(2)]
    );
    const invId = ins.rows[0].id;

    // items insertion
    const vals = [];
    const ph = [];
    items.forEach((it, idx) => {
      vals.push(invId, it.label || null, Number(it.qty || 0), Number(it.unit_price || 0), Number(it.line_total != null ? it.line_total : (Number(it.qty || 0) * Number(it.unit_price || 0))));
      const i = idx * 5;
      ph.push(`($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5})`);
    });
    await client.query(
      `INSERT INTO invoice_items(invoice_id,label,qty,unit_price,line_total) VALUES ${ph.join(',')}`,
      vals
    );

    // set due_date if provided
    if (due_date) {
      await client.query(`UPDATE invoices SET due_date=$1 WHERE id=$2 AND organization_id=$3`, [due_date, invId, org]);
    }

    // recompute totals/status
    const updated = await recomputeInvoiceTotals(client, invId, org);

    await client.query('COMMIT');
    res.json({ ok: true, invoice: updated });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'create_invoice_failed' });
  } finally {
    client.release();
  }
});

/* ===========================================================
   4) Routes avec :id
   =========================================================== */

// get one
router.get('/:id', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).json({ error: 'no_org' });
  const id = req.invId;

  const inv = await pool.query(`SELECT * FROM invoices WHERE id=$1 AND organization_id=$2`, [id, org]);
  if (!inv.rows[0]) return res.status(404).json({ error: 'not_found' });
  const items = await pool.query(`SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id`, [id]);
  res.json({ invoice: inv.rows[0], items: items.rows });
});

// pdf
router.post('/:id/pdf', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).json({ error: 'no_org' });
  const id = req.invId;

  const r = await pool.query(`
    SELECT i.*, c.name AS customer_name, c.address AS customer_address, c.vat_number AS customer_vat
    FROM invoices i JOIN customers c ON c.id=i.customer_id
    WHERE i.id=$1 AND i.organization_id=$2`, [id, org]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });

  const it = await pool.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id', [id]);
  const orgInfo = await pool.query(`
    SELECT o.*, u.full_name, u.email
    FROM users u LEFT JOIN organizations o ON o.id=u.organization_id
    WHERE u.id=$1`, [req.user.id]
  );

  const I = r.rows[0], O = orgInfo.rows[0] || {}, currency = I.currency || 'EUR';

  const uploads = path.join(process.cwd(), 'uploads', 'invoices');
  if (!fs.existsSync(uploads)) fs.mkdirSync(uploads, { recursive: true });
  const pdfPath = path.join(uploads, `invoice_${id}.pdf`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(fs.createWriteStream(pdfPath));

  // Header
  if (O.logo_path) {
    try { doc.image(path.join(process.cwd(), O.logo_path.replace(/^\//, '')), 40, 40, { width: 90 }); } catch { }
  }
  doc.font('Helvetica-Bold').fontSize(22).text('FACTURE', 0, 40, { align: 'right' });

  // Soc + Client
  doc.font('Helvetica-Bold').fontSize(12).text(O.name || 'Ma société', 40, 140);
  doc.font('Helvetica').fontSize(10)
    .text(O.full_name || '', 40)
    .text(O.email || '', 40)
    .text(O.vat_number ? `TVA : ${O.vat_number}` : '', 40);

  const cx = 320;
  doc.font('Helvetica-Bold').text('Client', cx, 130);
  doc.font('Helvetica')
    .text(I.customer_name || '', cx)
    .text(I.customer_address || '', cx)
    .text(I.customer_vat ? `TVA : ${I.customer_vat}` : '', cx);

  doc.moveDown().font('Helvetica-Bold').text(`Facture n° ${I.number}`, 40)
    .font('Helvetica').text(`Devise : ${currency}`, 40);

  // Table
  const num = v => Number(v || 0);
  doc.moveDown();
  doc.font('Helvetica-Bold')
    .text('Désignation', 40)
    .text('Qté', { continued: true, align: 'center' })
    .text('PU', { continued: true, align: 'right' })
    .text('Total', { align: 'right' });
  doc.moveTo(40, doc.y + 2).lineTo(550, doc.y + 2).stroke();

  it.rows.forEach(rw => {
    const qty = num(rw.qty), up = num(rw.unit_price), lt = num(rw.line_total ?? qty * up);
    doc.moveDown(0.5);
    doc.font('Helvetica')
      .text(String(rw.label || ''), 40)
      .text(qty.toFixed(3), { continued: true, align: 'center' })
      .text(up.toFixed(2), { continued: true, align: 'right' })
      .font('Helvetica-Bold').text(lt.toFixed(2), { align: 'right' })
      .font('Helvetica');
  });

  // Récapitulatif
  const n = (x) => Number(x || 0);
  const total_ht = n(I.total_ht);
  const vat_rate = n(I.vat_rate || 0);
  const total_ttc = total_ht * (1 + vat_rate / 100);
  const payments = await pool.query(
    'SELECT COALESCE(SUM(amount),0)::float AS paid FROM invoice_payments WHERE invoice_id=$1', [id]
  );
  const paid = n(payments.rows[0]?.paid || 0);
  const remaining = Math.max(0, total_ttc - paid);
  const cur = I.currency || 'EUR';

  doc.moveDown(1.2);
  const boxX = 340, boxW = 200;
  doc.roundedRect(boxX, doc.y, boxW, 90, 8).stroke('#eaeaea');
  const y0 = doc.y + 8;
  doc.font('Helvetica').fontSize(11);
  doc.text(`Sous-total : ${total_ht.toFixed(2)} ${cur}`, boxX + 12, y0, { width: boxW - 24, align: 'right' });
  doc.text(`TVA (${vat_rate.toFixed(2)}%) : ${(total_ht * vat_rate / 100).toFixed(2)} ${cur}`, { width: boxW - 24, align: 'right' });
  doc.text(`Payé : ${paid.toFixed(2)} ${cur}`, { width: boxW - 24, align: 'right' });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold');
  doc.text(`Total TTC : ${total_ttc.toFixed(2)} ${cur}`, { width: boxW - 24, align: 'right' });
  doc.text(`Reste dû : ${remaining.toFixed(2)} ${cur}`, { width: boxW - 24, align: 'right' });

  doc.end();

  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
  res.json({ ok: true, pdf_url: `${base}/uploads/invoices/invoice_${id}.pdf` });
});

// put (TVA/échéance/notes/statut)
router.put('/:id', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).json({ error: 'no_org' });
  const id = req.invId;

  const { status, vat_rate, due_date, notes } = req.body || {};
  const fields = [], vals = [];
  if (status) { vals.push(status); fields.push(`status=$${vals.length}`); }
  if (vat_rate !== undefined) { vals.push(asNum(vat_rate, 0)); fields.push(`vat_rate=$${vals.length}`); }
  if (due_date !== undefined) { vals.push(due_date); fields.push(`due_date=$${vals.length}`); }
  if (notes !== undefined) { vals.push(notes); fields.push(`notes=$${vals.length}`); }
  if (!fields.length) return res.status(400).json({ error: 'no_fields' });

  vals.push(id, org);
  await pool.query(`UPDATE invoices SET ${fields.join(',')} WHERE id=$${vals.length - 1} AND organization_id=$${vals.length}`, vals);
  const updated = await recomputeInvoiceTotals(pool, id, org);
  res.json(updated);
});

// payments
router.post('/:id/payments', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).json({ error: 'no_org' });
  const id = req.invId;

  const { amount, method = 'transfer', paid_at, note = null } = req.body || {};
  const amt = asNum(amount, NaN);
  if (!Number.isFinite(amt) || !paid_at) return res.status(400).json({ error: 'missing_amount_or_date' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const chk = await client.query(`SELECT id FROM invoices WHERE id=$1 AND organization_id=$2`, [id, org]);
    if (!chk.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'not_found' }); }

    await client.query(
      `INSERT INTO invoice_payments(invoice_id, amount, method, paid_at, note)
       VALUES($1,$2,$3,$4,$5)`,
      [id, amt, method, paid_at, note]
    );
    const updated = await recomputeInvoiceTotals(client, id, org);
    await client.query('COMMIT');
    res.json({ ok: true, invoice: updated });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'payment_failed' });
  } finally {
    client.release();
  }
});

// recompute (optionnel)
router.post('/:id/recompute', requireAuth, async (req, res) => {
  const org = await orgId(req); if (!org) return res.status(400).json({ error: 'no_org' });
  const id = req.invId;
  const updated = await recomputeInvoiceTotals(pool, id, org);
  res.json({ ok: true, invoice: updated });
});

module.exports = router;
