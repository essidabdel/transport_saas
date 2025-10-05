import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function AlertsWidget(){
  const [items,setItems]=useState([]);
  useEffect(()=>{ (async()=>{ const r=await apiFetch('/api/maintenance/alerts'); if(r.ok) setItems(await r.json()); })(); },[]);
  if(!items.length) return <div style={card}>Aucune alerte ⚑</div>;
  return (
    <div style={card}>
      <div style={{fontWeight:700,marginBottom:8}}>Alertes (30 jours)</div>
      <div style={{display:'grid',gap:6}}>
        {items.map((a,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'110px 1fr 120px 100px',gap:8,alignItems:'center'}}>
            <span style={pill(a.status)}>{a.status==='overdue'?'En retard':'Bientôt'}</span>
            <span>{a.label} — <b>{a.immat}</b></span>
            <span style={{color:'#555'}}>{a.type}</span>
            <span>{a.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
const card={padding:16,border:'1px solid #eee',borderRadius:12,background:'#fff',fontFamily:'sans-serif',maxWidth:800};
const pill=(st)=>({padding:'2px 8px',borderRadius:999,background: st==='overdue'?'#fdecea':'#fff7e6', color: st==='overdue'?'#c0392b':'#ad6800', fontSize:12, width:'fit-content'});
