import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function CostWidget(){
  const [loading,setLoading]=useState(true);
  const [kpi,setKpi]=useState({ eur_km_variable:null, eur_hour:null });
  const [edit,setEdit]=useState(false);
  const [f,setF]=useState({});

  const load = async ()=>{
    setLoading(true);
    const r = await apiFetch('/api/cost/compute');
    if (r.ok) {
      const d = await r.json();
      setKpi({ eur_km_variable: d.eur_km_variable, eur_hour: d.eur_hour });
      setF({
        conso_l_100km: d.params.conso_l_100km,
        prix_carburant_eur_l: d.params.prix_carburant_eur_l,
        entretien_eur_km: d.params.entretien_eur_km,
        pneus_prix_jeu: d.params.pneus_prix_jeu,
        pneus_duree_vie_km: d.params.pneus_duree_vie_km,
        reparations_eur_km: d.params.reparations_eur_km,
        peages_eur_km: d.params.peages_eur_km,
        adblue_eur_km: d.params.adblue_eur_km,
        cout_horaire_chauffeur: d.params.cout_horaire_chauffeur,
        frais_fixes_horaire: d.params.frais_fixes_horaire
      });
    }
    setLoading(false);
  };

  useEffect(()=>{ load(); },[]);

  const save = async (e)=>{
    e.preventDefault();
    const r = await apiFetch('/api/cost/params',{ method:'PUT', body: JSON.stringify(f) });
    if (r.ok) { await load(); setEdit(false); }
  };

  if (loading) return <div style={s.card}>Chargement…</div>;

  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center'}}>
        <div style={{fontWeight:700,fontSize:16}}>Calculateur express</div>
        <div style={{marginLeft:'auto'}}>
          {!edit && <button onClick={()=>setEdit(true)}>Ajuster</button>}
        </div>
      </div>

      {!edit ? (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
          <Kpi label="Coût variable / km" value={`${kpi.eur_km_variable.toFixed(3)} € / km`} />
          <Kpi label="Coût horaire" value={`${kpi.eur_hour.toFixed(2)} € / h`} />
        </div>
      ) : (
        <form onSubmit={save} style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <Num label="Conso (L/100km)" v="conso_l_100km" f={f} setF={setF}/>
          <Num label="Prix carburant (€/L)" v="prix_carburant_eur_l" f={f} setF={setF}/>
          <Num label="Entretien (€/km)" v="entretien_eur_km" f={f} setF={setF}/>
          <Num label="Pneus (€/jeu)" v="pneus_prix_jeu" f={f} setF={setF}/>
          <Num label="Durée pneus (km)" v="pneus_duree_vie_km" f={f} setF={setF}/>
          <Num label="Réparations (€/km)" v="reparations_eur_km" f={f} setF={setF}/>
          <Num label="Péages (€/km)" v="peages_eur_km" f={f} setF={setF}/>
          <Num label="AdBlue (€/km)" v="adblue_eur_km" f={f} setF={setF}/>
          <Num label="Chauffeur (€/h)" v="cout_horaire_chauffeur" f={f} setF={setF}/>
          <Num label="Frais fixes (€/h)" v="frais_fixes_horaire" f={f} setF={setF}/>
          <div style={{gridColumn:'1 / -1',display:'flex',gap:8,marginTop:6}}>
            <button type="submit">Enregistrer</button>
            <button type="button" onClick={()=>setEdit(false)}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Kpi({label, value}){ return (
  <div style={{border:'1px solid #eee',borderRadius:10,padding:12}}>
    <div style={{fontSize:12,color:'#666'}}>{label}</div>
    <div style={{fontSize:20,fontWeight:700}}>{value}</div>
  </div>
);}
function Num({label,v,f,setF}){
  return (<label style={{fontSize:12,color:'#555'}}>
    {label}
    <input type="number" step="any" value={f[v]??''}
      onChange={e=>setF({...f,[v]: e.target.value === '' ? null : Number(e.target.value)})}
      style={{width:'100%',padding:8,marginTop:4}}/>
  </label>);
}
const s={ card:{padding:16,border:'1px solid #eee',borderRadius:12,background:'#fff',fontFamily:'sans-serif',maxWidth:600} };
