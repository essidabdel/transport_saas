// web/src/Customers.js
import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api';

export default function Customers(){
  const [items,setItems]=useState([]);
  const [q,setQ]=useState('');
  const [f,setF]=useState({ name:'', address:'', vat_number:'', email:'', phone:'' });

  const load = useCallback(async ()=>{
    const r = await apiFetch('/api/customers' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    if (r.ok) setItems(await r.json());
  }, [q]);

  useEffect(()=>{ load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const r = await apiFetch('/api/customers', { method:'POST', body: JSON.stringify(f) });
    if (r.ok) { setF({ name:'', address:'', vat_number:'', email:'', phone:'' }); load(); }
  };

  return (
    <div style={{fontFamily:'sans-serif',padding:12}}>
      <h3>Clients</h3>
      <div style={{display:'flex',gap:8}}>
        <input placeholder="Recherche" value={q} onChange={e=>setQ(e.target.value)} />
        <button onClick={load}>Rechercher</button>
      </div>
      <div style={{marginTop:10,border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 160px 140px',gap:8,padding:'8px 12px',background:'#fafafa',fontWeight:600}}>
          <div>Nom</div><div>Adresse</div><div>TVA</div><div>Contact</div>
        </div>
        {items.map(c=>(
          <div key={c.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 160px 140px',gap:8,padding:'8px 12px',borderTop:'1px solid #eee'}}>
            <div>{c.name}</div><div>{c.address||'—'}</div><div>{c.vat_number||'—'}</div><div>{c.email||c.phone||'—'}</div>
          </div>
        ))}
        {!items.length && <div style={{padding:12,color:'#666'}}>Aucun client</div>}
      </div>

      <h4 style={{marginTop:16}}>Nouveau client</h4>
      <form onSubmit={save} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,maxWidth:800}}>
        <input placeholder="Nom *" value={f.name} onChange={e=>setF({...f,name:e.target.value})} required />
        <input placeholder="N° TVA" value={f.vat_number} onChange={e=>setF({...f,vat_number:e.target.value})} />
        <input placeholder="Adresse" value={f.address} onChange={e=>setF({...f,address:e.target.value})} />
        <input placeholder="Email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} />
        <input placeholder="Téléphone" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})} />
        <div style={{gridColumn:'1 / -1'}}><button type="submit">Enregistrer</button></div>
      </form>
    </div>
  );
}
