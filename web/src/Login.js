import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [email,setEmail]=useState('client@local.test');
  const [password,setPassword]=useState('Client123!');
  const [otp,setOtp]=useState('');
  const [err,setErr]=useState('');

  const submit = async (e)=>{
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password, otp_code: otp || undefined })
    });
    const data = await res.json();
    if (!res.ok) return setErr(data.error || 'Erreur');
    onLogin({ token: data.access_token, refresh: data.refresh_token, role: data.role, email: data.email });
  };

  return (
    <div style={{maxWidth:360,margin:'64px auto',fontFamily:'sans-serif'}}>
      <h2>Connexion</h2>
      <form onSubmit={submit}>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={s.i}/>
        <input placeholder="Mot de passe" type="password" value={password} onChange={e=>setPassword(e.target.value)} style={s.i}/>
        <input placeholder="Code OTP (si activé)" value={otp} onChange={e=>setOtp(e.target.value)} style={s.i}/>
        <button type="submit" style={{width:'100%',padding:10}}>Se connecter</button>
      </form>
      {err && <p style={{color:'red'}}>{err}</p>}
    </div>
  );
}
const s={i:{width:'100%',padding:8,margin:'8px 0'}};
