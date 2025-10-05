// backend/src/routes/quotes.js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const router = express.Router();

async function orgId(req) {
  const r = await pool.query('SELECT organization_id FROM users WHERE id=$1', [req.user.id]);
  return r.rows[0]?.organization_id;
}
async function nextNumber(org) {
  const y = new Date().getFullYear();
  const { rows } = await pool.query(
    `SELECT number FROM quotes WHERE organization_id=$1 AND number LIKE $2 ORDER BY id DESC LIMIT 1`,
    [org, `${y}-%`]
  );
  if (!rows[0]) return `${y}-0001`;
  const last = Number(rows[0].number.split('-')[1] || '0');
  const n = String(last + 1).padStart(4, '0');
  return `${y}-${n}`;
}

router.get('/', requireAuth, async (req, res) => {
  const org = await orgId(req);
  if (!org) return res.status(400).json({ error: 'no_org' });
  const { rows } = await pool.query(
    `
    SELECT q.*, c.name AS customer_name
    FROM quotes q JOIN customers c ON c.id=q.customer_id
    WHERE q.organization_id=$1
    ORDER BY q.created_at DESC LIMIT 100`,
    [org]
  );
  res.json(rows);
});

router.post('/', requireAuth, async (req, res) => {
  const org = await orgId(req);
  if (!org) return res.status(400).json({ error: 'no_org' });
  const { customer_id, items = [], margin_percent = 10, currency = 'EUR', notes = null } = req.body || {};
  const number = await nextNumber(org);
  const { rows: qr } = await pool.query(
    'INSERT INTO quotes(organization_id,customer_id,number,status,currency,margin_percent,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [org, customer_id, number, 'DRAFT', currency, margin_percent, notes]
  );
  const quote = qr[0];
  if (items.length) {
    const values = [];
    const placeholders = [];
    items.forEach((it) => {
      values.push(
        quote.id,
        it.kind,
        it.label,
        it.qty,
        it.unit_price,
        Number(it.qty || 0) * Number(it.unit_price || 0)
      );
      placeholders.push(
        `($${values.length - 5},$${values.length - 4},$${values.length - 3},$${values.length - 2},$${values.length - 1},$${values.length})`
      );
    });
    await pool.query(
      `INSERT INTO quote_items(quote_id,kind,label,qty,unit_price,line_total) VALUES ${placeholders.join(',')}`,
      values
    );
  }
  res.json(quote);
});

router.get('/:id', requireAuth, async (req, res) => {
  const org = await orgId(req);
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM quotes WHERE id=$1 AND organization_id=$2', [id, org]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  const q = rows[0];
  const its = await pool.query('SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY id', [id]);
  res.json({ quote: q, items: its.rows });
});

router.post('/:id/pdf', requireAuth, async (req,res)=>{
  const org=await orgId(req); const id=Number(req.params.id);
  const q = await pool.query(`
    SELECT q.*, c.name AS customer_name, c.address AS customer_address, c.vat_number AS customer_vat, c.email AS customer_email, c.phone AS customer_phone
    FROM quotes q JOIN customers c ON c.id=q.customer_id
    WHERE q.id=$1 AND q.organization_id=$2`,[id,org]
  );
  if(!q.rows[0]) return res.status(404).json({error:'not_found'});

  const it = await pool.query('SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY id',[id]);
  const orgInfo = await pool.query(`
    SELECT o.*, u.full_name, u.email
    FROM users u LEFT JOIN organizations o ON o.id=u.organization_id
    WHERE u.id=$1`, [req.user.id]);
  const R = q.rows[0], O = orgInfo.rows[0]||{};
  const currency = R.currency || 'EUR';

  // Paths
  const fs = require('fs'); const path = require('path'); const PDFDocument = require('pdfkit');
  const uploads = path.join(process.cwd(),'uploads','quotes'); if(!fs.existsSync(uploads)) fs.mkdirSync(uploads,{recursive:true});
  const pdfPath = path.join(uploads, `quote_${id}.pdf`);

  // Helpers
  const fm = n => Number(n||0).toFixed(2)+' '+currency;
  const num = v => Number(v||0);
  const today = new Date(); const fmtDate = d => new Date(d||today).toLocaleDateString();

  // Totaux
  const sub = it.rows.reduce((s,r)=>{
    const qty=num(r.qty), up=num(r.unit_price); const lt = r.line_total!=null? num(r.line_total) : qty*up;
    return s+lt;
  },0);
  const marginPct = num(R.margin_percent);
  const margin = sub * (marginPct/100);
  const total  = sub + margin;

  // PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.registerFont('H', 'Helvetica');
  doc.registerFont('HB', 'Helvetica-Bold');
  doc.pipe(fs.createWriteStream(pdfPath));

  // En-tête
  const startY = 40;
  if (O.logo_path) { try { doc.image(path.join(process.cwd(), O.logo_path.replace(/^\//,'')), 40, startY, { width: 90 }); } catch {} }
  doc.font('HB').fontSize(22).text('DEVIS', 0, startY, { align: 'right' });

  // Bloc société
  doc.font('HB').fontSize(12).text(O.name||'Ma société', 40, startY+100);
  doc.font('H').fontSize(10)
    .text(O.full_name||'', 40)
    .text(O.email||'', 40)
    .text(O.vat_number ? `TVA : ${O.vat_number}` : '', 40);

  // Bloc client
  const clientX = 320, clientY = startY+90;
  doc.font('HB').fontSize(12).text('Client', clientX, clientY);
  doc.font('H').fontSize(10)
    .text(R.customer_name||'', clientX)
    .text(R.customer_address||'', clientX, doc.y)
    .text(R.customer_email||R.customer_phone||'', clientX)
    .text(R.customer_vat ? `TVA : ${R.customer_vat}` : '', clientX);

  // Infos devis
  doc.moveDown(1.2);
  doc.font('HB').fontSize(12).text(`Devis n° ${R.number}`, 40, doc.y);
  doc.font('H').fontSize(10).text(`Date : ${fmtDate(R.created_at)}    •    Devise : ${currency}`, 40);

  // Tableau items
  doc.moveDown(0.8);
  const tableX = 40, tableY = doc.y + 6, tableW = 515;
  const cols = [
    { key:'label',  title:'Désignation', w: tableW*0.50, align:'left' },
    { key:'qty',    title:'Qté',         w: tableW*0.15, align:'center' },
    { key:'unit',   title:'PU',          w: tableW*0.15, align:'right' },
    { key:'total',  title:'Total',       w: tableW*0.20, align:'right' },
  ];

  // Header row (fond gris)
  doc.rect(tableX, tableY, tableW, 22).fill('#f3f4f6').stroke();
  doc.fillColor('#111').font('HB').fontSize(10);
  let x = tableX;
  cols.forEach(c=>{
    const opts = { width: c.w, align: c.align };
    doc.text(c.title, x+6, tableY+6, opts);
    x += c.w;
  });

  // Lignes
  let y = tableY + 22; doc.moveTo(tableX, y).lineTo(tableX+tableW, y).strokeColor('#ddd').stroke();
  doc.font('H').fillColor('#000').fontSize(10);
  it.rows.forEach(r=>{
    const qty = num(r.qty), up = num(r.unit_price);
    const lt  = r.line_total!=null? num(r.line_total) : qty*up;
    const rowH = 20;

    let cx = tableX;
    doc.text(String(r.label||''), cx+6, y+5, { width: cols[0].w, align: cols[0].align }); cx+=cols[0].w;
    doc.text(qty.toFixed(3),      cx+6, y+5, { width: cols[1].w, align: cols[1].align }); cx+=cols[1].w;
    doc.text(up.toFixed(2),       cx+6, y+5, { width: cols[2].w, align: cols[2].align }); cx+=cols[2].w;
    doc.font('HB').text(lt.toFixed(2),     cx+6, y+5, { width: cols[3].w, align: cols[3].align });
    doc.font('H');

    y += rowH;
    doc.moveTo(tableX, y).lineTo(tableX+tableW, y).strokeColor('#eee').stroke();
    // simple saut de page si proche du bas
    if (y > 760) { doc.addPage(); y = 60; }
  });

  // Totaux encadrés
  const boxW = 220, boxH = 70, boxX = tableX + tableW - boxW, boxY = y + 12;
  doc.roundedRect(boxX, boxY, boxW, boxH, 6).fillAndStroke('#fafafa','#e5e7eb');
  doc.fillColor('#111').font('H').fontSize(10);
  doc.text(`Sous-total : ${fm(sub)}`, boxX+10, boxY+10, { width: boxW-20, align:'right' });
  doc.text(`Marge (${marginPct}%) : ${fm(margin)}`, boxX+10, boxY+26, { width: boxW-20, align:'right' });
  doc.font('HB').text(`Total : ${fm(total)}`, boxX+10, boxY+44, { width: boxW-20, align:'right' });
  doc.font('H');

  // Notes
  if (R.notes) {
    doc.moveDown(2);
    doc.font('HB').text('Notes', 40);
    doc.font('H').fontSize(9).fillColor('#444').text(R.notes, 40);
    doc.fillColor('#000');
  }

  // Pied de page
  const footerY = 810;
  doc.fontSize(8).fillColor('#666')
     .text('Devis généré automatiquement — valable 30 jours sauf mention contraire.', 40, footerY, { align:'center', width: 515 });

  doc.end();

  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
  res.json({ ok:true, pdf_url: `${base}/uploads/quotes/quote_${id}.pdf` });
});
router.post('/:id/status', requireAuth, async (req,res)=>{
  const id = Number(req.params.id);
  const { status } = req.body || {}; // 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED'
  if (!['DRAFT','SENT','ACCEPTED','REJECTED'].includes(status)) return res.status(400).json({error:'bad_status'});

  const u = await pool.query('SELECT organization_id FROM users WHERE id=$1',[req.user.id]);
  const org = u.rows[0]?.organization_id;
  if (!org) return res.status(400).json({error:'no_org'});

  const fields = { SENT:'sent_at', ACCEPTED:'accepted_at', REJECTED:'rejected_at' };
  const setCols = [`status=$1`];
  const vals = [status, org, id];

  // reset timestamps then set the one for status
  const q = `
    UPDATE quotes
       SET status=$1,
           sent_at     = CASE WHEN $1='SENT'     THEN NOW() ELSE NULL END,
           accepted_at = CASE WHEN $1='ACCEPTED' THEN NOW() ELSE NULL END,
           rejected_at = CASE WHEN $1='REJECTED' THEN NOW() ELSE NULL END
     WHERE organization_id=$2 AND id=$3
     RETURNING *`;
  const { rows } = await pool.query(q, vals);
  if (!rows[0]) return res.status(404).json({error:'not_found'});
  res.json(rows[0]);
});


module.exports = router;
