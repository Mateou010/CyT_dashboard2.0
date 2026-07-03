// POST /api/subscribe body: { email }
import { agregarContacto, missingSubscribeConfig } from '../lib/subscribers.js';

const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const missing = missingSubscribeConfig();
  if (missing.length) {
    console.error('Suscripción pendiente de configuración:', missing.join(', '));
    return res.status(503).json({ error: 'La suscripción todavía no está configurada. Intentá nuevamente más tarde.' });
  }

  const email = (req.body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Email inválido' });

  try {
    await agregarContacto(email);
    return res.status(200).json({
      ok: true,
      message: 'Gracias por suscribirte. Pronto vas a recibir los nuevos proyectos de ley en tiempo real, ya resumidos.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo completar la suscripción.' });
  }
}
