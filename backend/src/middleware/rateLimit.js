const WINDOW_MS = 5 * 60 * 1000; // 5 min
const MAX_REQ = 30;              // 30 req / 5 min / IP (global /auth)
const buckets = new Map();

module.exports = function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const arr = buckets.get(ip) || [];
  const fresh = arr.filter(ts => now - ts < WINDOW_MS);
  fresh.push(now);
  buckets.set(ip, fresh);
  if (fresh.length > MAX_REQ) return res.status(429).json({ error: 'Too many requests' });
  next();
};
