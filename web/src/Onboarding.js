import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function Onboarding({ onDone }) {
  const [f,setF]=useState({ full_name:'', name:'', vat_number:'', currency:'EUR', unit_system:'metric' });
  const [msg,setMsg]=useState('');

  useEffect(()=>{ (async()=>{
    const r = await apiFetch('/api/org/me');
    if (r.ok) {
      const d = await r.json();
      if (d?.name) onDone();
      else setF(x=>({ ...x, full_name: d?.full_name || '' }));
    }
  })(); },[onDone]);

  const save=async(e)=>{
    e.preventDefault();
    const r = await apiFetch('/api/org/me',{ method:'PUT', body: JSON.stringify(f) });
    if (!r.ok) return setMsg('Erreur');
    onDone();
  };

  return (<div style={{maxWidth:420,margin:'48px auto',fontFamily:'sans-serif'}}>
    <h2>Onboarding — Société</h2>
    <form onSubmit={save}>
      <input placeholder="Votre nom complet" value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})} style={i}/>
      <input placeholder="Nom de la société" value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={i}/>
      <input placeholder="N° TVA (option)" value={f.vat_number} onChange={e=>setF({...f,vat_number:e.target.value})} style={i}/>
      <select value={f.currency} onChange={e=>setF({...f,currency:e.target.value})} style={i}>
        <option>EUR</option><option>GBP</option><option>USD</option>
      </select>
      <select value={f.unit_system} onChange={e=>setF({...f,unit_system:e.target.value})} style={i}>
        <option value="metric">Métrique (km,L)</option>
        <option value="imperial">Impérial (mi,gal)</option>
      </select>
      <button type="submit" style={{width:'100%',padding:10}}>Enregistrer</button>
    </form>
    {msg && <p style={{color:'red'}}>{msg}</p>}
  </div>);
}
const i={width:'100%',padding:8,margin:'8px 0'};
