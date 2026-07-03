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

// Los tokens expiran (default 7 días). El payload firmado incluye el vencimiento
// para que un link filtrado no sea válido para siempre.
const TOKEN_TTL_MS = Number(process.env.SUBSCRIBE_TOKEN_TTL_MS) || 7 * 24 * 60 * 60 * 1000;

function firma(email, proposito, exp) {
  assertSubscribeConfig();
  return crypto
    .createHmac('sha256', process.env.SUBSCRIBE_SECRET)
    .update(`${proposito}:${email.toLowerCase()}:${exp}`)
    .digest('hex');
}

export function generarToken(email, proposito) {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${firma(email, proposito, exp)}`;
}

export function tokenValido(email, proposito, token) {
  const [expStr, sig] = String(token || '').split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false; // vencido o mal formado
  let esperado;
  try {
    esperado = firma(email, proposito, exp);
  } catch {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(String(sig || '')));
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
  // Sin cap artificial: la API de Resend devuelve toda la audiencia. El
  // `limit:100` anterior dejaba afuera a los suscriptores 101+ sin avisar.
  const r = assertResendOk(await getResend().contacts.list(withAudience()));
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
    const r = assertResendOk(await getResend().contacts.list(withAudience()));
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
