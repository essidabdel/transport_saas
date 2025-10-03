import React, { useState } from 'react';
import Protected from './Protected';
import Admin from './Admin';
import Client from './Client';
import Login from './Login';
import { apiFetch } from './api';

export default function App() {
  const [session, setSession] = useState(() => {
    const s = localStorage.getItem('session');
    return s ? JSON.parse(s) : null;
  });

  if (!session) {
    return <Login onLogin={(s)=>{
      localStorage.setItem('session', JSON.stringify(s));
      setSession(s);
    }} />;
  }

  const logout = ()=>{
    const s = JSON.parse(localStorage.getItem('session')||'null');
    if (s?.refresh) apiFetch('/api/auth/logout', { method:'POST', body: JSON.stringify({ refresh_token: s.refresh })});
    localStorage.removeItem('session');
    setSession(null);
  };

  if (session.role === 'ADMIN') {
    return (
      <Protected need={['ADMIN']} fallback={<button onClick={logout}>Se déconnecter</button>}>
        <Admin email={session.email} onLogout={logout} />
      </Protected>
    );
  }
  return (
    <Protected need={['CLIENT','ADMIN']} fallback={<button onClick={logout}>Se déconnecter</button>}>
      <Client email={session.email} onLogout={logout} />
    </Protected>
  );
}
