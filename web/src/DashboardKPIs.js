import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api';

const fmt = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n||0));

export default function DashboardKPIs(){
  const [from,setFrom]=useState(firstDayOfMonth());
  const [to,setTo]=useState(today());
  const [kpi,setKpi]=useState({jobs_done:0,km_total:0,cout_total:'0.00',ca:'0.00',marge:'0.00',eur_km_reel:null});
  const [series,setSeries]=useState([]);

  const load = useCallback(async ()=>{
    const qs = `?from=${from}&to=${to}`;
    const r1 = await apiFetch('/api/stats/kpis'+qs); if(r1.ok) setKpi(await r1.json());
    const r2 = await apiFetch('/api/stats/revenue-by-day'+qs); if(r2.ok) setSeries(await r2.json());
  }, [from,to]);

  useEffect(()=>{ load(); }, [load]);

  return (
    <div style={{fontFamily:'sans-serif', display:'grid', gap:12}}>
      <div style={{display:'flex',gap:8,alignItems:'end'}}>
        <div>
          <div style={{fontSize:12,color:'#555'}}>Du</div>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
        </div>
        <div>
          <div style={{fontSize:12,color:'#555'}}>Au</div>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
        </div>
        <button onClick={load}>Actualiser</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:8}}>
        <Card title="Missions faites" value={kpi.jobs_done} />
        <Card title="KM total" value={fmt(kpi.km_total)} />
        <Card title="Coût total (€)" value={fmt(kpi.cout_total)} />
        <Card title="CA (€)" value={fmt(kpi.ca)} />
        <Card title="Marge (€)" value={fmt(kpi.marge)} />
      </div>
      <div style={{fontSize:13,color:'#555'}}>€/km réel: <b>{kpi.eur_km_reel ?? '—'}</b></div>

      <LineChart data={series} />
    </div>
  );
}

function Card({title,value}){
  return (
    <div style={{border:'1px solid #eee',borderRadius:12,padding:12,background:'#fff'}}>
      <div style={{fontSize:12,color:'#666'}}>{title}</div>
      <div style={{fontSize:22,fontWeight:700}}>{value}</div>
    </div>
  );
}

function LineChart({data}){
  const W=800, H=260, P=32;
  if(!data.length){
    return <div style={{border:'1px solid #eee',borderRadius:12,padding:12,background:'#fff'}}>Pas de données</div>;
  }

  const ca = data.map(d=>Number(d.ca||0));
  const ct = data.map(d=>Number(d.cout||0));
  const maxY = Math.max(1, ...ca, ...ct);

  const X = i => P + (i) * ((W-2*P)/Math.max(1, data.length-1));
  const Y = v => H-P - (v/maxY) * (H-2*P);

  const pathFrom = (arr)=> (arr.length===1)
    ? `M ${X(0)-1} ${Y(arr[0])} L ${X(0)+1} ${Y(arr[0])}`
    : arr.map((v,i)=> (i?'L':'M') + X(i) + ' ' + Y(v)).join(' ');

  const grid = [0,0.5,1].map(t=>({y: Y(t*maxY), v: (t*maxY)}));

  return (
    <div style={{border:'1px solid #eee',borderRadius:12,background:'#fff',padding:8,overflow:'auto'}}>
      <div style={{display:'flex',gap:12,alignItems:'center',padding:'4px 8px'}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
          <span style={{width:14,height:3,background:'#000',display:'inline-block'}}></span> CA
        </span>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
          <span style={{width:14,height:3,background:'#888',display:'inline-block'}}></span> Coût
        </span>
      </div>
      <svg width={W} height={H}>
        {/* axes */}
        <line x1={P} y1={H-P} x2={W-P} y2={H-P} stroke="#ddd"/>
        <line x1={P} y1={P}   x2={P}   y2={H-P} stroke="#ddd"/>

        {/* grilles + labels Y */}
        {grid.map((g,i)=>(
          <g key={i}>
            <line x1={P} x2={W-P} y1={g.y} y2={g.y} stroke="#f2f2f2"/>
            <text x={P-6} y={g.y+4} fontSize="10" textAnchor="end">{g.v.toFixed(0)}</text>
          </g>
        ))}

        {/* CA (noir) */}
        <path d={pathFrom(ca)} fill="none" stroke="#000"/>
        {data.map((d,i)=>(
          <circle key={'ca'+i} cx={X(i)} cy={Y(ca[i])} r="3" fill="#000"/>
        ))}

        {/* Coût (gris) */}
        <path d={pathFrom(ct)} fill="none" stroke="#888"/>
        {data.map((d,i)=>(
          <circle key={'ct'+i} cx={X(i)} cy={Y(ct[i])} r="3" fill="#888"/>
        ))}

        {/* étiquettes X (dates) */}
        {data.map((d,i)=>(
          <text key={'dx'+i} x={X(i)} y={H-P+14} fontSize="10" textAnchor="middle">{d.d}</text>
        ))}
      </svg>
    </div>
  );
}




function today(){ const d=new Date(); return d.toISOString().slice(0,10); }
function firstDayOfMonth(){ const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); }
