import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function Quotes(){
  const [quotes,setQuotes]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [items,setItems]=useState([{ kind:'KM', label:'Kilométrage', qty:0, unit_price:0 }]);
  const [customerId,setCustomerId]=useState('');
  const [margin,setMargin]=useState(10);
  const [notes,setNotes]=useState('');
  const [pdf,setPdf]=useState('');

  const load=async()=>{
    const r1=await apiFetch('/api/quotes'); if(r1.ok) setQuotes(await r1.json());
    const r2=await apiFetch('/api/customers'); if(r2.ok) setCustomers(await r2.json());
  };
  useEffect(()=>{ load(); },[]);

  const addItem=()=>setItems([...items,{ kind:'KM', label:'', qty:0, unit_price:0 }]);
  const delItem=i=>setItems(items.filter((_,idx)=>idx!==i));
  const setItem=(i,k,v)=>setItems(items.map((it,idx)=>idx===i?{...it,[k]:v}:it));

  const subtotal = items.reduce((s,it)=>s+(Number(it.qty||0)*Number(it.unit_price||0)),0);
  const total = subtotal * (1 + Number(margin||0)/100);

  const saveQuote=async()=>{
    const body={ customer_id:Number(customerId), items, margin_percent:Number(margin), notes };
    const r=await apiFetch('/api/quotes',{ method:'POST', body:JSON.stringify(body) });
    if(r.ok){ setItems([{ kind:'KM', label:'Kilométrage', qty:0, unit_price:0 }]); setCustomerId(''); setMargin(10); setNotes(''); setPdf(''); load(); }
  };

  const makePdf=async(id)=>{
    const r=await apiFetch(`/api/quotes/${id}/pdf`,{method:'POST'});
    if(r.ok){ const d=await r.json(); setPdf(d.pdf_url); }
  };

  return (
    <div style={{fontFamily:'sans-serif',padding:12}}>
      <h3>Devis</h3>

      <div style={{marginTop:8,border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'120px 1fr 120px 120px 120px',gap:8,padding:'8px 12px',background:'#fafafa',fontWeight:600}}>
          <div>N°</div><div>Client</div><div>Statut</div><div>Marge %</div><div>PDF</div>
        </div>
        {quotes.map(q=>(
          <div key={q.id} style={{display:'grid',gridTemplateColumns:'120px 1fr 120px 120px 120px',gap:8,padding:'8px 12px',borderTop:'1px solid #eee'}}>
            <div>{q.number}</div><div>{q.customer_name}</div><div>{q.status}</div><div>{q.margin_percent}</div>
            <div><button onClick={()=>makePdf(q.id)}>Générer PDF</button></div>
          </div>
        ))}
        {!quotes.length && <div style={{padding:12,color:'#666'}}>Aucun devis</div>}
      </div>
      {pdf && <div style={{marginTop:8}}><a href={pdf} target="_blank" rel="noreferrer">Ouvrir le PDF</a></div>}

      <h4 style={{marginTop:16}}>Nouveau devis</h4>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,maxWidth:900}}>
        <label>Client
          <select value={customerId} onChange={e=>setCustomerId(e.target.value)} style={{width:'100%',padding:8}}>
            <option value="">— Choisir —</option>
            {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Marge (%)<input type="number" step="0.1" value={margin} onChange={e=>setMargin(e.target.value)} style={{width:'100%',padding:8}}/></label>
      </div>

      <div style={{marginTop:8,border:'1px solid #eee',borderRadius:8,padding:12}}>
        <div style={{display:'grid',gridTemplateColumns:'100px 1fr 120px 120px 80px',gap:8,fontWeight:600}}>
          <div>Type</div><div>Désignation</div><div>Qté</div><div>PU</div><div></div>
        </div>
        {items.map((it,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'100px 1fr 120px 120px 80px',gap:8,marginTop:8}}>
            <select value={it.kind} onChange={e=>setItem(i,'kind',e.target.value)}>
              <option>KM</option><option>H</option><option>FIXED</option>
            </select>
            <input placeholder="Désignation" value={it.label} onChange={e=>setItem(i,'label',e.target.value)} />
            <input type="number" step="any" value={it.qty} onChange={e=>setItem(i,'qty', Number(e.target.value))}/>
            <input type="number" step="any" value={it.unit_price} onChange={e=>setItem(i,'unit_price', Number(e.target.value))}/>
            <button onClick={()=>delItem(i)}>Suppr</button>
          </div>
        ))}
        <div style={{marginTop:8}}>
          <button onClick={addItem}>+ Ligne</button>
        </div>
        <div style={{marginTop:8,textAlign:'right'}}>
          <div>Sous-total: {subtotal.toFixed(2)}</div>
          <div>Total (marge incl.): <b>{total.toFixed(2)}</b></div>
        </div>
      </div>

      <label style={{display:'block',marginTop:8}}>Notes
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} style={{width:'100%',height:80}} />
      </label>

      <div style={{marginTop:8,display:'flex',gap:8}}>
        <button onClick={saveQuote} disabled={!customerId}>Enregistrer le devis</button>
      </div>
    </div>
  );
}
