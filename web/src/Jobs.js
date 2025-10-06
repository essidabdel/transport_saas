import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function Jobs(){
  const [items,setItems]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [vehicles,setVehicles]=useState([]);
  const [drivers,setDrivers]=useState([]);
  const [f,setF]=useState({ ref:'', customer_id:'', vehicle_id:'', driver_id:'', pickup_addr:'', dropoff_addr:'', date_plan:'', notes:'' });
  const [closeJob,setCloseJob]=useState(null);
  const [closeForm,setCloseForm]=useState({ km_start:'', km_end:'', tolls_eur:'', wait_minutes:'', drive_minutes:'', revenue_eur:'' });

  const load=async()=>{
    const r=await apiFetch('/api/jobs'); if(r.ok) setItems(await r.json());
    const c=await apiFetch('/api/customers'); if(c.ok) setCustomers(await c.json());
    const v=await apiFetch('/api/vehicles'); if(v.ok) setVehicles(await v.json());
    const d=await apiFetch('/api/drivers'); if(d.ok) setDrivers(await d.json());
  };
  useEffect(()=>{ load(); },[]);

  const create=async(e)=>{
    e.preventDefault();
    const body={...f, customer_id: numOrNull(f.customer_id), vehicle_id: numOrNull(f.vehicle_id), driver_id: numOrNull(f.driver_id)};
    const r=await apiFetch('/api/jobs',{method:'POST',body:JSON.stringify(body)});
    if(r.ok){ setF({ ref:'', customer_id:'', vehicle_id:'', driver_id:'', pickup_addr:'', dropoff_addr:'', date_plan:'', notes:'' }); load(); }
  };

  const markDone=async()=>{
    const id = closeJob.id;
    const body = {
      km_start: numOrNull(closeForm.km_start),
      km_end: numOrNull(closeForm.km_end),
      tolls_eur: numOrZero(closeForm.tolls_eur),
      wait_minutes: numOrZero(closeForm.wait_minutes),
      drive_minutes: numOrZero(closeForm.drive_minutes),
      revenue_eur: closeForm.revenue_eur===''? null : Number(closeForm.revenue_eur),
      started_at: null, ended_at: null
    };
    const r=await apiFetch(`/api/jobs/${id}/done`,{method:'POST',body:JSON.stringify(body)});
    if(r.ok){ setCloseJob(null); load(); }
  };

  // ✅ Export CSV avec token (via apiFetch)
  const exportCsv = async () => {
    const r = await apiFetch('/api/jobs/export.csv', { headers: { Accept: 'text/csv' } });
    if (!r.ok) { alert('Erreur export'); return; }
    const blob = await r.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jobs.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div style={{fontFamily:'sans-serif',padding:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <h3 style={{margin:0}}>Missions</h3>
        <button onClick={exportCsv} style={{marginLeft:'auto'}}>Export CSV</button>
      </div>

      <h4>Nouvelle mission</h4>
      <form onSubmit={create} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,maxWidth:1100}}>
        <input placeholder="Référence *" value={f.ref} onChange={e=>setF({...f,ref:e.target.value})} required />
        <select value={f.customer_id} onChange={e=>setF({...f,customer_id:e.target.value})}>
          <option value="">Client</option>
          {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={f.vehicle_id} onChange={e=>setF({...f,vehicle_id:e.target.value})}>
          <option value="">Véhicule</option>
          {vehicles.map(v=><option key={v.id} value={v.id}>{v.immatriculation}</option>)}
        </select>
        <select value={f.driver_id} onChange={e=>setF({...f,driver_id:e.target.value})}>
          <option value="">Chauffeur</option>
          {drivers.map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
        <input placeholder="Enlèvement (adresse)" value={f.pickup_addr} onChange={e=>setF({...f,pickup_addr:e.target.value})}/>
        <input placeholder="Livraison (adresse)" value={f.dropoff_addr} onChange={e=>setF({...f,dropoff_addr:e.target.value})}/>
        <input type="date" value={f.date_plan} onChange={e=>setF({...f,date_plan:e.target.value})} required />
        <input placeholder="Notes" value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/>
        <div style={{gridColumn:'1/-1'}}><button type="submit">Créer</button></div>
      </form>

      <h4 style={{marginTop:16}}>Liste</h4>
      <div style={{border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'110px 1fr 140px 120px 120px 120px 160px',gap:8,padding:'8px 12px',background:'#fafafa',fontWeight:600}}>
          <div>Ref</div><div>Client</div><div>Date</div><div>Véhicule</div><div>Chauffeur</div><div>Statut</div><div>Coûts / Marge</div>
        </div>
        {items.map(j=>(
          <div key={j.id} style={{display:'grid',gridTemplateColumns:'110px 1fr 140px 120px 120px 120px 160px',gap:8,padding:'8px 12px',borderTop:'1px solid #eee',alignItems:'center'}}>
            <div>{j.ref}</div>
            <div>{j.customer_name||'—'}</div>
            <div>{j.date_plan}</div>
            <div>{j.immatriculation||'—'}</div>
            <div>{j.driver_name||'—'}</div>
            <div>
              <span>{j.status}</span>
              {j.status!=='DONE' && <button onClick={()=>{ setCloseJob(j); setCloseForm({ km_start:'',km_end:'',tolls_eur:'',wait_minutes:'',drive_minutes:'',revenue_eur:'' }); }} style={{marginLeft:8}}>Clôturer</button>}
            </div>
            <div>
              {j.status==='DONE'
                ? (<span>{Number(j.cost_total_eur||0).toFixed(2)} € {j.revenue_eur!=null && <> / <b>{Number(j.margin_eur||0).toFixed(2)} €</b></>}</span>)
                : '—'}
            </div>
          </div>
        ))}
        {!items.length && <div style={{padding:12,color:'#666'}}>Aucune mission</div>}
      </div>

      {closeJob && (
        <div style={m.back}>
          <div style={m.box}>
            <h3>Clôturer mission {closeJob.ref}</h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <Inp label="Km départ" k="km_start" f={closeForm} setF={setCloseForm} type="number" />
              <Inp label="Km arrivée" k="km_end" f={closeForm} setF={setCloseForm} type="number" />
              <Inp label="Péages (€)" k="tolls_eur" f={closeForm} setF={setCloseForm} type="number" step="0.01" />
              <Inp label="Attente (min)" k="wait_minutes" f={closeForm} setF={setCloseForm} type="number" />
              <Inp label="Conduite (min)" k="drive_minutes" f={closeForm} setF={setCloseForm} type="number" />
              <Inp label="Recette (€) (optionnel)" k="revenue_eur" f={closeForm} setF={setCloseForm} type="number" step="0.01" />
            </div>
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <button onClick={markDone}>Valider</button>
              <button onClick={()=>setCloseJob(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Inp({label,k,f,setF,type='text',step}){
  return (
    <label style={{fontSize:12,color:'#555'}}>{label}
      <input type={type} step={step} value={f[k]??''} onChange={e=>setF({...f,[k]: e.target.value})}
        style={{width:'100%',padding:8,marginTop:4}}/>
    </label>
  );
}
function numOrNull(v){ return v===''? null : Number(v); }
function numOrZero(v){ return v===''? 0 : Number(v); }

const m={back:{position:'fixed',inset:0,background:'rgba(0,0,0,.25)',display:'grid',placeItems:'center',zIndex:10},
         box:{background:'#fff',borderRadius:12,padding:16,minWidth:740,boxShadow:'0 10px 24px rgba(0,0,0,.15)'}};
