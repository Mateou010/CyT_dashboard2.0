// Suscriptores en Resend Audiences. No guarda emails en el repo.
import crypto from 'node:crypto';
import { Resend } from 'resend';

let _resend;
const getResend = () => (_resend ??= new Resend(process.env.RESEND_API_KEY));
const audienceId = () => process.env.RESEND_AUDIENCE_ID;

export function missingSubscribeConfig() {
  return ['RESEND_API_KEY', 'RESEND_AUDIENCE_ID', 'SUBSCRIBE_SECRET']
    .filter((key) => !process.env[key]);
}

export function assertSubscribeConfig() {
  const missing = missingSubscribeConfig();
  if (missing.length) {
    throw new Error('Configuración pendiente: ' + missing.join(', '));
  }
  if (String(process.env.SUBSCRIBE_SECRET || '').length < 24) {
    throw new Error('SUBSCRIBE_SECRET debe tener al menos 24 caracteres.');
  }
}

function firma(email, proposito) {
  assertSubscribeConfig();
  return crypto
    .createHmac('sha256', process.env.SUBSCRIBE_SECRET)
    .update(`${proposito}:${email.toLowerCase()}`)
    .digest('hex');
}

export function generarToken(email, proposito) {
  return firma(email, proposito);
}

export function tokenValido(email, proposito, token) {
  const esperado = firma(email, proposito);
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(String(token || '')));
  } catch {
    return false;
  }
}

export async function agregarContacto(email) {
  assertSubscribeConfig();
  return getResend().contacts.create({
    email: email.toLowerCase(),
    unsubscribed: false,
    audienceId: audienceId(),
  });
}

export async function listarConfirmados() {
  assertSubscribeConfig();
  const r = await getResend().contacts.list({ audienceId: audienceId() });
  const arr = r?.data?.data || r?.data || [];
  return arr.filter((c) => !c.unsubscribed).map((c) => ({ id: c.id, email: c.email }));
}

export async function darDeBaja(email) {
  assertSubscribeConfig();
  const normalized = email.toLowerCase();
  try {
    return await getResend().contacts.update({
      audienceId: audienceId(),
      email: normalized,
      unsubscribed: true,
    });
  } catch {
    const r = await getResend().contacts.list({ audienceId: audienceId() });
    const arr = r?.data?.data || r?.data || [];
    const contact = arr.find((x) => (x.email || '').toLowerCase() === normalized);
    if (contact) {
      return getResend().contacts.update({
        audienceId: audienceId(),
        id: contact.id,
        unsubscribed: true,
      });
    }
    return null;
  }
}
