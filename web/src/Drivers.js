import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function Drivers(){
  const [items,setItems]=useState([]);
  const [show,setShow]=useState(false);
  const [edit,setEdit]=useState(null);
  const [f,setF]=useState(empty());
  const load=async()=>{ const r=await apiFetch('/api/drivers'); if(r.ok) setItems(await r.json()); };
  useEffect(()=>{ load(); },[]);
  const openNew=()=>{ setEdit(null); setF(empty()); setShow(true); };
  const openEdit=(d)=>{ setEdit(d); setF(d); setShow(true); };
  const del=async(id)=>{ if(!window.confirm('Supprimer ?')) return; const r=await apiFetch(`/api/drivers/${id}`,{method:'DELETE'}); if(r.ok) load(); };
  const save=async(e)=>{ e.preventDefault(); const url= edit? `/api/drivers/${edit.id}`:'/api/drivers'; const method= edit?'PUT':'POST';
    const r=await apiFetch(url,{method,body:JSON.stringify(f)}); if(r.ok){ setShow(false); load(); } };
  const Inp=({label,k,type='text',step})=>(
    <label style={{fontSize:12,color:'#555'}}>{label}
      <input type={type} step={step} value={f[k]??''} onChange={e=>setF({...f,[k]: type==='number'? Number(e.target.value) : e.target.value})}
        style={{width:'100%',padding:8,marginTop:4}}/>
    </label>
  );
  return (
    <div style={{fontFamily:'sans-serif',padding:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <h3 style={{margin:0}}>Chauffeurs</h3>
        <button onClick={openNew} style={{marginLeft:'auto'}}>Nouveau</button>
      </div>
      <div style={{marginTop:10,border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
        <Row head/>
        {items.map(d=><Row key={d.id} d={d} onEdit={()=>openEdit(d)} onDelete={()=>del(d.id)}/>)}
        {!items.length && <div style={{padding:12,color:'#666'}}>Aucun chauffeur</div>}
      </div>

      {show && (
        <div style={m.back}>
          <div style={m.box}>
            <h3>{edit?'Éditer chauffeur':'Nouveau chauffeur'}</h3>
            <form onSubmit={save} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <Inp label="Nom complet" k="full_name"/>
              <Inp label="Email" k="email" />
              <Inp label="Téléphone" k="phone" />
              <Inp label="Salaire brut mensuel (€)" k="salaire_brut_mensuel" type="number" step="0.01"/>
              <Inp label="Charges patronales (%)" k="charges_patronales_pct" type="number" step="0.01"/>
              <Inp label="Frais généraux (%)" k="frais_generaux_pct" type="number" step="0.01"/>
              <Inp label="Heures productives / mois" k="heures_productives_mois" type="number" step="0.1"/>
              <div style={{gridColumn:'1/-1',display:'flex',gap:8,marginTop:6}}>
                <button type="submit">Enregistrer</button>
                <button type="button" onClick={()=>setShow(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
function Row({head,d,onEdit,onDelete}){
  if(head) return (
    <div style={st.rowHead}>
      <div>Nom</div><div>Contact</div><div>€/h</div><div>Actions</div>
    </div>
  );
  return (
    <div style={st.row}>
      <div>{d.full_name}</div>
      <div>{d.email||d.phone||'—'}</div>
      <div><b>{Number(d.cout_horaire||0).toFixed(2)}</b></div>
      <div><button onClick={onEdit}>Éditer</button> <button onClick={onDelete}>Suppr</button></div>
    </div>
  );
}
const st={rowHead:{display:'grid',gridTemplateColumns:'1fr 1fr 120px 140px',gap:8,padding:'8px 12px',background:'#fafafa',fontWeight:600},
          row:{display:'grid',gridTemplateColumns:'1fr 1fr 120px 140px',gap:8,padding:'8px 12px',borderTop:'1px solid #eee'}};
const m={back:{position:'fixed',inset:0,background:'rgba(0,0,0,.25)',display:'grid',placeItems:'center',zIndex:10},
         box:{background:'#fff',borderRadius:12,padding:16,minWidth:680,boxShadow:'0 10px 24px rgba(0,0,0,.15)'}};
function empty(){ return { full_name:'', email:'', phone:'', salaire_brut_mensuel:2000, charges_patronales_pct:42, frais_generaux_pct:10, heures_productives_mois:140 }; }
