// Suscriptores en Resend Contacts. No guarda emails en el repo.
// Si existe RESEND_AUDIENCE_ID se usa; si no, usa contactos globales de Resend.
import crypto from 'node:crypto';
import { Resend } from 'resend';

let _resend;
const getResend = () => (_resend ??= new Resend(process.env.RESEND_API_KEY));
const audienceId = () => process.env.RESEND_AUDIENCE_ID || '';

export function missingSubscribeConfig() {
  return ['RESEND_API_KEY', 'SUBSCRIBE_SECRET'].filter((key) => !process.env[key]);
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

function withAudience(payload = {}) {
  return audienceId() ? { ...payload, audienceId: audienceId() } : payload;
}

function assertResendOk(result) {
  if (result?.error) {
    throw new Error(result.error.message || 'Resend rechazó la operación');
  }
  return result;
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
  const normalized = email.toLowerCase();
  try {
    return assertResendOk(await getResend().contacts.create(withAudience({
      email: normalized,
      unsubscribed: false,
    })));
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/already|exist|duplicate|conflict/i.test(message)) {
      return assertResendOk(await getResend().contacts.update(withAudience({
        email: normalized,
        unsubscribed: false,
      })));
    }
    throw error;
  }
}

export async function listarConfirmados() {
  assertSubscribeConfig();
  const r = assertResendOk(await getResend().contacts.list(withAudience({ limit: 100 })));
  const arr = r?.data?.data || r?.data || [];
  return arr.filter((c) => !c.unsubscribed).map((c) => ({ id: c.id, email: c.email }));
}

export async function darDeBaja(email) {
  assertSubscribeConfig();
  const normalized = email.toLowerCase();
  try {
    return assertResendOk(await getResend().contacts.update(withAudience({
      email: normalized,
      unsubscribed: true,
    })));
  } catch {
    const r = assertResendOk(await getResend().contacts.list(withAudience({ limit: 100 })));
    const arr = r?.data?.data || r?.data || [];
    const contact = arr.find((x) => (x.email || '').toLowerCase() === normalized);
    if (contact) {
      return assertResendOk(await getResend().contacts.update(withAudience({
        id: contact.id,
        unsubscribed: true,
      })));
    }
    return null;
  }
}
