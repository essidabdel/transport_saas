import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function Company() {
  const [data,setData]=useState(null);
  const [edit,setEdit]=useState(false);
  const [f,setF]=useState({ name:'', vat_number:'', currency:'EUR', unit_system:'metric', full_name:'', logo_base64:'' });
  const [msg,setMsg]=useState('');
  const [toast,setToast]=useState('');

  useEffect(()=>{ (async()=>{
    const r = await apiFetch('/api/org/me');
    if (!r.ok) return setMsg('Erreur chargement');
    const d = await r.json(); setData(d);
    setF({
      name: d?.name || '', vat_number: d?.vat_number || '',
      currency: d?.currency || 'EUR', unit_system: d?.unit_system || 'metric',
      full_name: d?.full_name || '', logo_base64: ''
    });
  })(); },[]);

  const pickLogo = e=>{
    const file=e.target.files?.[0]; if(!file) return;
    const r=new FileReader();
    r.onload=()=>setF(prev=>({ ...prev, logo_base64:r.result }));
    r.readAsDataURL(file);
  };

  const save=async(e)=>{
    e.preventDefault(); setMsg('');
    const r = await apiFetch('/api/org/me',{ method:'PUT', body: JSON.stringify(f) });
    if (!r.ok) return setMsg('Erreur sauvegarde');
    const d = await r.json(); setData({...data, ...d}); setEdit(false);
    setF(x=>({ ...x, logo_base64:'' })); // reset preview
    setToast('Enregistré ✔'); setTimeout(()=>setToast(''), 2000);
  };

  if (!data) return <div style={{padding:12}}>Chargement…</div>;

  const logoSrc = f.logo_base64 || data.logo_path || '';

  return (
    <div style={s.card}>
      {/* Toast */}
      {toast && <div style={s.toast}>{toast}</div>}

      <div style={{display:'flex',alignItems:'center',gap:16}}>
        {logoSrc
          ? <img src={logoSrc} alt="logo" style={s.logo}/>
          : <div style={s.logoPh}>Logo</div>}
        <div>
          <div style={s.title}>{data.name || '—'}</div>
          <div style={s.muted}>{data.email}</div>
        </div>
        <div style={{marginLeft:'auto'}}>
          {!edit ? <button onClick={()=>setEdit(true)}>Modifier</button> : null}
        </div>
      </div>

      {!edit ? (
        <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <Field label="N° TVA" value={data.vat_number || '—'} />
          <Field label="Devise" value={data.currency} />
          <Field label="Unités" value={data.unit_system==='metric'?'Métrique (km,L)':'Impérial (mi,gal)'} />
          <Field label="Nom complet" value={data.full_name || '—'} />
        </div>
      ) : (
        <form onSubmit={save} style={{marginTop:12}}>
          <input style={s.input} placeholder="Nom de la société" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
          <input style={s.input} placeholder="N° TVA (option)" value={f.vat_number} onChange={e=>setF({...f,vat_number:e.target.value})}/>
          <select style={s.input} value={f.currency} onChange={e=>setF({...f,currency:e.target.value})}>
            <option>EUR</option><option>GBP</option><option>USD</option>
          </select>
          <select style={s.input} value={f.unit_system} onChange={e=>setF({...f,unit_system:e.target.value})}>
            <option value="metric">Métrique (km,L)</option>
            <option value="imperial">Impérial (mi,gal)</option>
          </select>
          <input style={s.input} placeholder="Votre nom complet" value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})}/>
          <div style={{display:'flex',alignItems:'center',gap:12,margin:'6px 0'}}>
            <input type="file" accept="image/*" onChange={pickLogo}/>
            {f.logo_base64 && <img src={f.logo_base64} alt="aperçu" style={{width:48,height:48,objectFit:'contain',border:'1px solid #eee',borderRadius:8}}/>}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button type="submit">Enregistrer</button>
            <button type="button" onClick={()=>{ setEdit(false); setF({...f,logo_base64:''}); }}>Annuler</button>
          </div>
          {msg && <p style={{color:'red'}}>{msg}</p>}
        </form>
      )}
    </div>
  );
}

function Field({label,value}) {
  return <div><div style={s.label}>{label}</div><div>{value}</div></div>;
}

const s={
  card:{position:'relative',padding:16,border:'1px solid #eee',borderRadius:12,marginTop:16,fontFamily:'sans-serif',background:'#fff',maxWidth:440},
  logo:{width:64,height:64,objectFit:'contain',border:'1px solid #eee',borderRadius:8},
  logoPh:{width:64,height:64,display:'grid',placeItems:'center',border:'1px dashed #ccc',borderRadius:8,fontSize:12,color:'#777'},
  title:{fontSize:18,fontWeight:700},
  muted:{color:'#666',fontSize:12},
  input:{width:'100%',padding:8,margin:'6px 0'},
  label:{color:'#666',fontSize:12,marginBottom:2},
  toast:{position:'absolute',top:-12,right:12,transform:'translateY(-100%)',background:'#0bb07b',color:'#fff',padding:'6px 10px',borderRadius:8,fontSize:12,boxShadow:'0 2px 8px rgba(0,0,0,.1)'}
};
