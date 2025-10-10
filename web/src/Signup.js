import React, { useState } from 'react';

export default function Signup({ onLogin, onCancel }) {
  // Minimal single-page signup: company + user
  const [company, setCompany] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setSuccess(false);
    if (!company.trim()) return setErr('Nom de la société requis');
    if (!email.trim() || !password) return setErr('Email et mot de passe requis');
    if (password !== confirm) return setErr('Les mots de passe ne correspondent pas');

    setLoading(true);
    try {
      // 1) register user
      let r = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'CLIENT' })
      });
      const data = await r.json();
      if (!r.ok) return setErr(data.error || 'Erreur inscription');

      // 2) login
      r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const login = await r.json();
      if (!r.ok) return setErr(login.error || 'Erreur connexion');

      const token = login.access_token;

      // 3) create organisation and switch in one call
      await fetch('/api/org/create-and-switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: company, full_name: fullName || '' })
      });

      // success -> inform parent to store session and continue
      onLogin({ token: login.access_token, refresh: login.refresh_token, role: login.role, email: login.email });
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setErr('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 460, margin: '36px auto', fontFamily: 'sans-serif' }}>
      <h2>Créer un compte — Société & utilisateur</h2>
      <p style={{ color: '#555' }}>Renseignez le nom de votre société et vos identifiants. Vous serez connecté automatiquement.</p>
      <form onSubmit={submit}>
        <input placeholder="Nom de la société *" value={company} onChange={e => setCompany(e.target.value)} style={i} />
        <input placeholder="Nom et prénom (optionnel)" value={fullName} onChange={e => setFullName(e.target.value)} style={i} />
        <input placeholder="Email *" value={email} onChange={e => setEmail(e.target.value)} style={i} />
        <input placeholder="Mot de passe *" type="password" value={password} onChange={e => setPassword(e.target.value)} style={i} />
        <input placeholder="Confirmer le mot de passe *" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={i} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={{ flex: 1, padding: 10 }} disabled={loading}>Créer le compte</button>
          <button type="button" onClick={onCancel} style={{ padding: 10 }}>Retour</button>
        </div>
      </form>

      {err && <p style={{ color: 'red', marginTop: 12 }}>{err}</p>}
      {success && <p style={{ color: 'green', marginTop: 12 }}>Compte créé — vous êtes connecté.</p>}
    </div>
  );
}

const i = { width: '100%', padding: 8, margin: '8px 0' };
