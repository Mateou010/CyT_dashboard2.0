// GET /api/confirm?email=...&t=...
import { tokenValido, agregarContacto, missingSubscribeConfig } from '../lib/subscribers.js';

const siteUrl = () => (process.env.SITE_URL || 'https://cytdashboard.vercel.app').replace(/\/$/, '');

export default async function handler(req, res) {
  const missing = missingSubscribeConfig();
  if (missing.length) return res.status(503).send('La suscripción todavía no está configurada.');

  const email = (req.query?.email || '').trim().toLowerCase();
  const token = req.query?.t;
  if (!email || !tokenValido(email, 'confirm', token)) return res.status(400).send('Link inválido o vencido.');

  try {
    await agregarContacto(email);
    res.writeHead(302, { Location: `${siteUrl()}/suscripcion-confirmada.html` });
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('No se pudo confirmar. Probá de nuevo.');
  }
}
