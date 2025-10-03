// web/src/Client.js
import React, { useEffect, useState } from 'react';
import { apiFetch } from './api';
import Onboarding from './Onboarding';
import Company from './Company';
import CostWidget from './CostWidget';
import Vehicles from './Vehicles';

export default function Client({ email, onLogout }) {
  const [ready, setReady] = useState(false);
  const [needOb, setNeedOb] = useState(true);
  const [tab, setTab] = useState('home');

  useEffect(() => {
    (async () => {
      const r = await apiFetch('/api/org/me');
      if (!r.ok) { setNeedOb(true); setReady(true); return; }
      const d = await r.json();
      setNeedOb(!(d && d.name));
      setReady(true);
    })();
  }, []);

  if (!ready) return <div style={{ padding: 24 }}>...</div>;
  if (needOb) return <Onboarding onDone={() => setNeedOb(false)} />;

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h2>Dashboard Client</h2>
      <p>{email}</p>

      <div style={{ margin: '8px 0', display: 'flex', gap: 8 }}>
        <button onClick={() => setTab('home')}>Accueil</button>
        <button onClick={() => setTab('vehicles')}>Véhicules</button>
        <button onClick={onLogout} style={{ marginLeft: 'auto' }}>Se déconnecter</button>
      </div>

      {tab === 'home' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, maxWidth: 980 }}>
          <Company />
          <CostWidget />
        </div>
      )}

      {tab === 'vehicles' && <Vehicles />}
    </div>
  );
}
