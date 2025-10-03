// web/src/Admin.js (remplace par)
import React, { useState } from 'react';
import { apiFetch } from './api';
import AdminAudit from './AdminAudit';

export default function Admin({ email, onLogout }) {
  const [status,setStatus]=useState('');
  const [showAudit,setShowAudit]=useState(true);
  const ping=async()=>{ const r=await apiFetch('/api/admin/ping'); setStatus(String(r.status)); };
  return (
    <div style={{padding:24,fontFamily:'sans-serif'}}>
      <h2>Admin</h2><p>{email}</p>
      <div style={{marginBottom:8}}>
        <button onClick={ping}>Tester /admin/ping</button> <span>{status}</span>
        <button onClick={onLogout} style={{marginLeft:12}}>Se déconnecter</button>
        <button onClick={()=>setShowAudit(s=>!s)} style={{marginLeft:12}}>{showAudit?'Masquer':'Voir'} audit</button>
      </div>
      {showAudit && <AdminAudit/>}
    </div>
  );
}
