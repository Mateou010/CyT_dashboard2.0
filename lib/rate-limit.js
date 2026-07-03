// Rate limiter en memoria, por instancia (sliding window).
// NOTA: en Vercel serverless cada instancia "warm" tiene su propio contador, así
// que esto es best-effort (frena el abuso desde una IP contra UNA instancia).
// Para un límite global y robusto, usar Vercel KV / Upstash Ratelimit.
const store = new Map(); // key -> timestamps (ms)

export function rateLimit(key, { limit = 20, windowMs = 60_000, now = Date.now() } = {}) {
  // Purga liviana para no acumular keys viejas (ej. IPs que no vuelven).
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (!v.some((t) => t > now - windowMs)) store.delete(k);
    }
  }
  const hits = (store.get(key) || []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) {
    store.set(key, hits);
    return { ok: false, remaining: 0, retryAfterMs: hits[0] + windowMs - now };
  }
  hits.push(now);
  store.set(key, hits);
  return { ok: true, remaining: limit - hits.length, retryAfterMs: 0 };
}

// IP del cliente detrás del proxy de Vercel.
// Se prefiere x-real-ip (lo setea Vercel, no es spoofeable). En x-forwarded-for
// el PRIMER valor lo controla el cliente, así que si hay que usarlo tomamos el
// ÚLTIMO hop (el que agregó el proxy).
export function clientIp(req) {
  const h = req?.headers || {};
  const real = h['x-real-ip'];
  if (real) return String(Array.isArray(real) ? real[0] : real).trim() || 'unknown';
  const xff = h['x-forwarded-for'];
  const parts = (Array.isArray(xff) ? xff.join(',') : String(xff || ''))
    .split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'unknown';
}

export function _reset() { store.clear(); } // para tests
