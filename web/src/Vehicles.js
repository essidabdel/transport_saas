import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function Vehicles(){
  const [items,setItems]=useState([]);
  const [showForm,setShowForm]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [msg,setMsg]=useState('');

  const load=async()=>{ const r=await apiFetch('/api/vehicles'); if(!r.ok) return setMsg('Erreur chargement'); setItems(await r.json()); };
  useEffect(()=>{ load(); },[]);

  const onCreate=()=>{ setEditItem(null); setShowForm(true); };
  const onEdit=(it)=>{ setEditItem(it); setShowForm(true); };
  const onDelete = async (id) => {
  if (!window.confirm('Supprimer ?')) return;
  const r = await apiFetch(`/api/vehicles/${id}`, { method: 'DELETE' });
  if (r.ok) load();
};


  return (
    <div style={{fontFamily:'sans-serif',padding:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <h3 style={{margin:0}}>Véhicules</h3>
        <button onClick={onCreate} style={{marginLeft:'auto'}}>Nouveau</button>
      </div>
      {msg && <p style={{color:'red'}}>{msg}</p>}
      <div style={{marginTop:10,border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
        <Row head />
        {items.map(v=><Row key={v.id} v={v} onEdit={()=>onEdit(v)} onDelete={()=>onDelete(v.id)} />)}
        {!items.length && <div style={{padding:12,color:'#666'}}>Aucun véhicule</div>}
      </div>
      {showForm && <VehicleForm initial={editItem} onClose={()=>{setShowForm(false);}} onSaved={()=>{setShowForm(false);load();}} />}
    </div>
  );
}

function Row({head,v,onEdit,onDelete}){
  if (head) return (
    <div style={st.rowHead}>
      <div>Immat</div><div>Marque</div><div>Modèle</div><div>Énergie</div><div>€/km</div><div>Alertes</div><div>Actions</div>
    </div>
  );
  return (
    <div style={st.row}>
      <div>{v.immatriculation}</div>
      <div>{v.marque||'—'}</div>
      <div>{v.modele||'—'}</div>
      <div>{v.energie||'—'}</div>
      <div>{v.cout_variable_km?.toFixed(3)}</div>
      <div>{v.alerts?.map((a,i)=><span key={i} style={{padding:'2px 6px',marginRight:4,borderRadius:6,background:a.type==='overdue'?'#fdecea':'#fff6e6',color:a.type==='overdue'?'#c0392b':'#ad6800',fontSize:12}}>{a.label}</span>)}</div>
      <div><button onClick={onEdit}>Éditer</button> <button onClick={onDelete}>Suppr</button></div>
    </div>
  );
}
const st={
  rowHead:{display:'grid',gridTemplateColumns:'100px 110px 1fr 90px 90px 1fr 120px',gap:8,padding:'8px 12px',background:'#fafafa',fontWeight:600},
  row:{display:'grid',gridTemplateColumns:'100px 110px 1fr 90px 90px 1fr 120px',gap:8,padding:'8px 12px',borderTop:'1px solid #eee'}
};

function VehicleForm({ initial, onClose, onSaved }){
  const [f,setF]=useState(initial||{
    immatriculation:'', marque:'', modele:'', vin:'', energie:'diesel',
    date_mise_en_circulation:'', kilometrage_actuel:'',

    assurance_annuelle:'', financement_mensuel:'', taxe_annuelle:'', abonnement_gps:'',

    conso_moyenne:7.5, prix_carburant:1.85, entretien_moyen_km:0.05, pneus_prix_jeu:500, pneus_duree_vie_km:40000,
    reparations_moyennes:0.04, peages_moyens:0.03, adblue_moyen:0.001,

    date_prochain_controle_technique:'', date_fin_assurance:'', date_prochain_entretien:''
  });
  const save=async(e)=>{
    e.preventDefault();
    const url = initial? `/api/vehicles/${initial.id}` : '/api/vehicles';
    const method = initial? 'PUT':'POST';
    const r = await apiFetch(url,{ method, body: JSON.stringify(f) });
    if (r.ok) onSaved();
  };
  const Inp=({label,k,...rest})=>(
    <label style={{fontSize:12,color:'#555'}}>{label}
      <input value={f[k]??''} onChange={e=>setF({...f,[k]:e.target.value})} {...rest} style={{width:'100%',padding:8,marginTop:4}}/>
    </label>
  );
  const Num=({label,k,step='any'})=>(
    <label style={{fontSize:12,color:'#555'}}>{label}
      <input type="number" step={step} value={f[k]??''} onChange={e=>setF({...f,[k]: e.target.value===''?null:Number(e.target.value)})}
        style={{width:'100%',padding:8,marginTop:4}}/>
    </label>
  );

  return (
    <div style={m.back}>
      <div style={m.box}>
        <h3>{initial?'Éditer véhicule':'Nouveau véhicule'}</h3>
        <form onSubmit={save} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <Inp label="Immatriculation" k="immatriculation" required />
          <Inp label="Marque" k="marque" />
          <Inp label="Modèle" k="modele" />
          <Inp label="VIN" k="vin" />
          <label style={{fontSize:12,color:'#555'}}>Énergie
            <select value={f.energie||''} onChange={e=>setF({...f,energie:e.target.value})} style={{width:'100%',padding:8,marginTop:4}}>
              <option value="diesel">Diesel</option><option value="essence">Essence</option><option value="electrique">Électrique</option><option value="hybride">Hybride</option>
            </select>
          </label>
          <Inp label="Date mise en circ." k="date_mise_en_circulation" type="date" />
          <Num label="Kilométrage actuel" k="kilometrage_actuel" step="1" />

          <Num label="Assurance annuelle (€)" k="assurance_annuelle" />
          <Num label="Financement mensuel (€)" k="financement_mensuel" />
          <Num label="Taxe annuelle (€)" k="taxe_annuelle" />
          <Num label="Abonnement GPS (€)" k="abonnement_gps" />

          <Num label="Conso (L/100 km)" k="conso_moyenne" />
          <Num label="Prix carburant (€/L)" k="prix_carburant" />
          <Num label="Entretien (€/km)" k="entretien_moyen_km" />
          <Num label="Pneus (€/jeu)" k="pneus_prix_jeu" />
          <Num label="Durée pneus (km)" k="pneus_duree_vie_km" step="1" />
          <Num label="Réparations (€/km)" k="reparations_moyennes" />
          <Num label="Péages (€/km)" k="peages_moyens" />
          <Num label="AdBlue (€/km)" k="adblue_moyen" />

          <Inp label="Prochain CT" k="date_prochain_controle_technique" type="date" />
          <Inp label="Fin assurance" k="date_fin_assurance" type="date" />
          <Inp label="Prochain entretien" k="date_prochain_entretien" type="date" />

          <div style={{gridColumn:'1 / -1',display:'flex',gap:8,marginTop:6}}>
            <button type="submit">Enregistrer</button>
            <button type="button" onClick={onClose}>Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}
const m={
  back:{position:'fixed',inset:0,background:'rgba(0,0,0,.25)',display:'grid',placeItems:'center',zIndex:10},
  box:{background:'#fff',borderRadius:12,padding:16,minWidth:680,boxShadow:'0 10px 24px rgba(0,0,0,.15)'}
};
