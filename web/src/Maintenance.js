import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function Maintenance(){
  const [items,setItems]=useState([]);
  const [vehicles,setVehicles]=useState([]);
  const [f,setF]=useState({ vehicle_id:'', kind:'ENTRETIEN', due_date:'', due_km:'', notes:'' });

  const load=async()=>{
    const r1=await apiFetch('/api/maintenance'); if(r1.ok) setItems(await r1.json());
    const r2=await apiFetch('/api/vehicles'); if(r2.ok) setVehicles(await r2.json());
  };
  useEffect(()=>{ load(); },[]);

  const save=async(e)=>{
    e.preventDefault();
    const body={ ...f, vehicle_id: Number(f.vehicle_id)||null, due_km: f.due_km===''?null:Number(f.due_km) };
    const r=await apiFetch('/api/maintenance',{method:'POST',body:JSON.stringify(body)});
    if(r.ok){ setF({ vehicle_id:'', kind:'ENTRETIEN', due_date:'', due_km:'', notes:'' }); load(); }
  };
  const finish=async(id)=>{
    const mileage = prompt('Kilométrage à la réalisation ? (optionnel)');
    const r=await apiFetch(`/api/maintenance/${id}`,{ method:'PUT', body: JSON.stringify({ done:true, done_at:new Date().toISOString(), mileage_at_done: mileage? Number(mileage):null }) });
    if(r.ok) load();
  };
  const del=async(id)=>{ if(!window.confirm('Supprimer ?')) return; const r=await apiFetch(`/api/maintenance/${id}`,{method:'DELETE'}); if(r.ok) load(); };

  return (
    <div style={{fontFamily:'sans-serif',padding:12}}>
      <h3>Maintenance</h3>

      <h4>Nouvelle tâche</h4>
      <form onSubmit={save} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:8,maxWidth:1000}}>
        <label>Véhicule
          <select value={f.vehicle_id} onChange={e=>setF({...f,vehicle_id:e.target.value})} style={{width:'100%',padding:8}}>
            <option value="">— Choisir —</option>
            {vehicles.map(v=><option key={v.id} value={v.id}>{v.immatriculation}</option>)}
          </select>
        </label>
        <label>Type
          <select value={f.kind} onChange={e=>setF({...f,kind:e.target.value})} style={{width:'100%',padding:8}}>
            <option>ENTRETIEN</option><option>CT</option><option>ASSURANCE</option><option>AUTRE</option>
          </select>
        </label>
        <label>Échéance (date)
          <input type="date" value={f.due_date} onChange={e=>setF({...f,due_date:e.target.value})} style={{width:'100%',padding:8}}/>
        </label>
        <label>Échéance (km)
          <input type="number" value={f.due_km} onChange={e=>setF({...f,due_km:e.target.value})} style={{width:'100%',padding:8}}/>
        </label>
        <label>Notes
          <input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} style={{width:'100%',padding:8}}/>
        </label>
        <div style={{gridColumn:'1/-1'}}><button type="submit">Ajouter</button></div>
      </form>

      <h4 style={{marginTop:16}}>Liste</h4>
      <div style={{border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'120px 1fr 120px 100px 90px 160px',gap:8,padding:'8px 12px',background:'#fafafa',fontWeight:600}}>
          <div>Véhicule</div><div>Libellé</div><div>Échéance</div><div>État</div><div></div><div></div>
        </div>
        {items.map(m=>{
          const due = m.due_date || (m.due_km? `${m.due_km} km`: '—');
          return (
            <div key={m.id} style={{display:'grid',gridTemplateColumns:'120px 1fr 120px 100px 90px 160px',gap:8,padding:'8px 12px',borderTop:'1px solid #eee'}}>
              <div>{m.immatriculation}</div>
              <div>{m.notes || m.kind}</div>
              <div>{due}</div>
              <div>{m.done? 'Fait' : 'À faire'}</div>
              <div>{!m.done && <button onClick={()=>finish(m.id)}>Marquer fait</button>}</div>
              <div><button onClick={()=>del(m.id)}>Supprimer</button></div>
            </div>
          );
        })}
        {!items.length && <div style={{padding:12,color:'#666'}}>Aucune tâche</div>}
      </div>
    </div>
  );
}
