import React from 'react';
import { apiFetch } from './api';

export default function Protected({ need, children, fallback = null }) {
  const [ok, setOk] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      const res = await apiFetch('/api/auth/roles-check');
      if (!res.ok) return setOk(false);
      const me = await res.json();
      setOk(need.includes(me.role));
    })();
  }, [need]);

  if (ok === null) return <div style={{padding:24}}>...</div>;
  if (!ok) return fallback;
  return children;
}
