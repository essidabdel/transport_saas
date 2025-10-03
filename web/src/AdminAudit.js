// web/src/AdminAudit.js
import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api';

export default function AdminAudit(){
  const [items,setItems]=useState([]);
  const [email,setEmail]=useState('');
  const [success,setSuccess]=useState('');
  const [msg,setMsg]=useState('');

  const load = useCallback(async ()=>{
    const qs = new URLSearchParams();
    if (email) qs.set('email', email);
    if (success) qs.set('success', success);
    const r = await apiFetch('/api/admin/audit' + (qs.toString()?`?${qs}`:''));
    if (!r.ok) return setMsg('Erreur chargement');
    setItems(await r.json());
  }, [email, success]);

  useEffect(()=>{ load(); }, [load]);

  const unlock = async ({emailToClear, ipToClear})=>{
    setMsg('');
    const r = await apiFetch('/api/admin/audit/unlock', {
      method:'POST',
      body: JSON.stringify({ email: emailToClear || undefined, ip: ipToClear || undefined })
    });
    if (!r.ok) return setMsg('Erreur déblocage');
    setMsg('Débloqué ✔'); setTimeout(()=>setMsg(''),1500);
    load();
  };

  return (
    <div style={{marginTop:16,fontFamily:'sans-serif'}}>
      <h3>Audit connexions</h3>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
        <input placeholder="Filtre email" value={email} onChange={e=>setEmail(e.target.value)} style={st.inp}/>
        <select value={success} onChange={e=>setSuccess(e.target.value)} style={st.inp}>
          <option value="">Tout</option>
          <option value="true">Succès</option>
          <option value="false">Échec</option>
        </select>
        <button onClick={load}>Recharger</button>
        {msg && <span style={{color:'#0bb07b',marginLeft:8}}>{msg}</span>}
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <button onClick={()=>unlock({ emailToClear: email || prompt('Email à débloquer ?') })}>Débloquer email</button>
          <button onClick={()=>unlock({ ipToClear: prompt('IP à débloquer ? (ex: ::1)') })}>Débloquer IP</button>
        </div>
      </div>

      <div style={{border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'140px 160px 90px 140px 1fr',gap:8,padding:'8px 12px',background:'#fafafa',fontWeight:600}}>
          <div>Date</div><div>Email</div><div>Succès</div><div>Raison</div><div>IP / Agent</div>
        </div>
        {items.map(i=>(
          <div key={i.id} style={{display:'grid',gridTemplateColumns:'140px 160px 90px 140px 1fr',gap:8,padding:'8px 12px',borderTop:'1px solid #eee'}}>
            <div>{new Date(i.created_at).toLocaleString()}</div>
            <div>{i.email}</div>
            <div style={{color:i.success?'#0bb07b':'#c0392b'}}>{String(i.success)}</div>
            <div>{i.reason||'—'}</div>
            <div>{i.ip} — {i.user_agent?.slice(0,60)}{i.user_agent?.length>60?'…':''}</div>
          </div>
        ))}
        {!items.length && <div style={{padding:12,color:'#666'}}>Aucune entrée</div>}
      </div>
    </div>
  );
}
const st={ inp:{padding:8} };
