import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api';

// Helper badge statut
const badge = (status) => {
  const s = String(status||'').toUpperCase();
  const color =
    s === 'OVERDUE'   ? '#ffe5e5' :
    s === 'PAID'      ? '#e6ffed' :
    s === 'CANCELLED' ? '#f2f2f2' :
                        '#eef3ff';
  const txt =
    s === 'OVERDUE'   ? '#c00' :
    s === 'PAID'      ? '#0a7a2a' :
    s === 'CANCELLED' ? '#666' :
                        '#1b4dd9';
  return <span style={{background:color,color:txt,borderRadius:14,padding:'2px 8px',fontSize:12,fontWeight:600}}>{s}</span>;
};

export default function Invoices(){
  const [items,setItems]=useState([]);
  const [quotes,setQuotes]=useState([]);
  const [pdf,setPdf]=useState('');
  const [edit,setEdit]=useState(null); // {id, vat_rate, due_date}
  const [pay,setPay]=useState(null);   // {id, amount, paid_at, method, note}
  const [fStatus,setFStatus]=useState(''); // filtre: '', OVERDUE, PAID, SENT, CANCELLED

  const r2json = async (r)=> (r.ok ? r.json() : []);

  // charge la liste en tenant compte du filtre
  const load = useCallback(async ()=>{
    const qs = fStatus ? `?status=${encodeURIComponent(fStatus)}` : '';
    const r = await apiFetch('/api/invoices'+qs);
    if (r.ok) setItems(await r.json());

    const q = await apiFetch('/api/quotes');
    if (q.ok) setQuotes(await r2json(q));
  }, [fStatus]);

  useEffect(()=>{ load(); }, [load]);

  const exportCsv = async ()=>{
    const qs = fStatus ? `?status=${encodeURIComponent(fStatus)}` : '';
    const r = await apiFetch('/api/invoices/export.csv'+qs, { headers:{ Accept:'text/csv' }});
    if(!r.ok){ alert('Erreur export'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`invoices_${fStatus||'all'}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const createFromQuote=async(id)=>{
    const r=await apiFetch(`/api/invoices/from-quote/${id}`,{method:'POST'});
    if(r.ok) load();
  };

  const makePdf=async(id)=>{
    const r=await apiFetch(`/api/invoices/${id}/pdf`,{method:'POST'});
    if(r.ok){ const d=await r.json(); setPdf(d.pdf_url); }
  };

  const saveEdit=async()=>{
    const r=await apiFetch(`/api/invoices/${edit.id}`,{
      method:'PUT',
      body:JSON.stringify({ vat_rate:Number(edit.vat_rate||0), due_date:edit.due_date })
    });
    if(r.ok){ setEdit(null); load(); }
  };

  const addPayment=async()=>{
    const body={ amount:Number(pay.amount), paid_at:pay.paid_at, method:pay.method, note:pay.note||null };
    const r=await apiFetch(`/api/invoices/${pay.id}/payments`,{method:'POST',body:JSON.stringify(body)});
    if(r.ok){ setPay(null); load(); }
  };

  return (
    <div style={{fontFamily:'sans-serif',padding:12}}>
      <h3>Factures</h3>

      {/* Barre d’actions (filtre + export) */}
      <div style={{display:'flex',gap:8,alignItems:'center',margin:'8px 0'}}>
        <label style={{fontSize:12,color:'#555'}}>Filtrer</label>
        <select value={fStatus} onChange={e=>{ setFStatus(e.target.value); }} style={{padding:6}}>
          <option value="">Tous</option>
          <option value="OVERDUE">OVERDUE</option>
          <option value="SENT">SENT</option>
          <option value="PAID">PAID</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
        <button onClick={load}>Appliquer</button>
        <button onClick={exportCsv} style={{marginLeft:'auto'}}>Export CSV</button>
      </div>

      {/* Création depuis devis */}
      <div style={{margin:'8px 0',display:'flex',gap:8,alignItems:'center'}}>
        <select id="qsel">
          <option value="">— Devis ACCEPTED —</option>
          {quotes.filter(q=>q.status==='ACCEPTED').map(q=><option key={q.id} value={q.id}>{q.number} — {q.customer_name}</option>)}
        </select>
        <button onClick={()=>{
          const v=document.getElementById('qsel').value;
          if(v) createFromQuote(Number(v));
        }}>Créer facture depuis devis</button>
      </div>

      {/* Tableau */}
      <div style={{border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'140px 1fr 90px 100px 110px 110px 220px',gap:8,padding:'8px 12px',background:'#fafafa',fontWeight:600}}>
          <div>N°</div><div>Client</div><div>TVA %</div><div>Statut</div><div>Total TTC</div><div>Reste dû</div><div>Actions</div>
        </div>
        {items.map(i=>(
          <div key={i.id} style={{display:'grid',gridTemplateColumns:'140px 1fr 90px 100px 110px 110px 220px',gap:8,padding:'8px 12px',borderTop:'1px solid #eee',alignItems:'center'}}>
            <div>{i.number}</div>
            <div>{i.customer_name}</div>
            <div>{Number(i.vat_rate||0).toFixed(2)}</div>
            <div>{badge(i.status)}</div>
            <div>{fmt(i.total_ttc||i.total_ht)}</div>
            <div>{fmt(i.remaining||0)}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <button onClick={()=>setEdit({ id:i.id, vat_rate:(i.vat_rate??0), due_date:(i.due_date??'') })}>TVA/Échéance</button>
              <button onClick={()=>setPay({ id:i.id, amount:'', paid_at:today(), method:'transfer', note:'' })}>Paiement</button>
              <button onClick={()=>makePdf(i.id)}>PDF</button>
            </div>
          </div>
        ))}
        {!items.length && <div style={{padding:12,color:'#666'}}>Aucune facture</div>}
      </div>

      {pdf && <div style={{marginTop:8}}><a href={pdf} target="_blank" rel="noreferrer">Ouvrir le PDF</a></div>}

      {/* Modale TVA / Échéance */}
      {edit && (
        <Modal onClose={()=>setEdit(null)} title={`Facture #${edit.id} — TVA / Échéance`}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <Inp label="TVA (%)"  type="number" step="0.01" value={edit.vat_rate} onChange={v=>setEdit({...edit,vat_rate:v})}/>
            <Inp label="Échéance" type="date" value={edit.due_date} onChange={v=>setEdit({...edit,due_date:v})}/>
          </div>
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button onClick={saveEdit}>Enregistrer</button>
            <button onClick={()=>setEdit(null)}>Annuler</button>
          </div>
        </Modal>
      )}

      {/* Modale Paiement */}
      {pay && (
        <Modal onClose={()=>setPay(null)} title={`Paiement — Facture #${pay.id}`}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <Inp label="Montant (€)" type="number" step="0.01" value={pay.amount} onChange={v=>setPay({...pay,amount:v})}/>
            <Inp label="Date" type="date" value={pay.paid_at} onChange={v=>setPay({...pay,paid_at:v})}/>
            <label>Mode
              <select value={pay.method} onChange={e=>setPay({...pay,method:e.target.value})} style={{width:'100%',padding:8,marginTop:4}}>
                <option value="transfer">Virement</option>
                <option value="card">Carte</option>
                <option value="cash">Espèces</option>
                <option value="check">Chèque</option>
              </select>
            </label>
            <Inp label="Note" value={pay.note} onChange={v=>setPay({...pay,note:v})}/>
          </div>
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button onClick={addPayment}>Ajouter</button>
            <button onClick={()=>setPay(null)}>Annuler</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Inp({label,value,onChange,type='text',step}){
  return (
    <label style={{fontSize:12,color:'#555'}}>{label}
      <input type={type} step={step} value={value??''} onChange={e=>onChange(e.target.value)}
             style={{width:'100%',padding:8,marginTop:4}}/>
    </label>
  );
}

function Modal({children,onClose,title}){
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.25)',display:'grid',placeItems:'center',zIndex:20}}>
      <div style={{background:'#fff',borderRadius:12,padding:16,minWidth:560,boxShadow:'0 10px 24px rgba(0,0,0,.15)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <h3 style={{margin:0}}>{title}</h3>
          <button onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fmt = (n)=> new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(Number(n||0));
const today = ()=> new Date().toISOString().slice(0,10);
