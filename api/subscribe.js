// POST /api/subscribe body: { email }
// Doble opt-in: NO da de alta directo. Envía un email de confirmación con un
// token firmado; el alta real la hace /api/confirm cuando el dueño del email
// hace clic. Esto evita suscribir a terceros sin su consentimiento.
import { mailConfirmacion } from '../lib/mailer.js';
import { missingSubscribeConfig } from '../lib/subscribers.js';
import { rateLimit, clientIp } from '../lib/rate-limit.js';

const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // Rate-limit por IP (best-effort) para frenar flood de suscripciones.
  if (!rateLimit(`subscribe:${clientIp(req)}`, { limit: 5, windowMs: 60_000 }).ok) {
    return res.status(429).json({ error: 'Demasiados intentos. Esperá un momento.' });
  }

  const missing = missingSubscribeConfig();
  if (missing.length) {
    console.error('Suscripción pendiente de configuración:', missing.join(', '));
    return res.status(503).json({ error: 'La suscripción todavía no está configurada. Intentá nuevamente más tarde.' });
  }

  const email = (req.body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Email inválido' });

  try {
    await mailConfirmacion(email);
    return res.status(200).json({
      ok: true,
      message: 'Te enviamos un email para confirmar tu suscripción. Revisá tu casilla (y el spam) y hacé clic en el enlace.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo enviar el email de confirmación. Probá de nuevo.' });
  }
}
