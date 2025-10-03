export async function apiFetch(path, opts = {}) {
  const s = JSON.parse(localStorage.getItem('session') || 'null');
  const headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;

  let res = await fetch(path, { ...opts, headers });
  if (res.status !== 401 || !s?.refresh) return res;

  const r = await fetch('/api/auth/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh })
  });
  if (!r.ok) return res;

  const data = await r.json();
  const next = { ...s, token: data.access_token, refresh: data.refresh_token };
  localStorage.setItem('session', JSON.stringify(next));

  const headers2 = { ...(opts.headers || {}), 'Content-Type': 'application/json', Authorization: `Bearer ${next.token}` };
  return fetch(path, { ...opts, headers: headers2 });
}
