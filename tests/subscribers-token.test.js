import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Config mínima para que assertSubscribeConfig no falle (import dinámico luego de setear env).
process.env.RESEND_API_KEY = 'test_key';
process.env.SUBSCRIBE_SECRET = 'x'.repeat(30);
const { generarToken, tokenValido } = await import('../lib/subscribers.js');

const SECRET = process.env.SUBSCRIBE_SECRET;
const firmar = (email, prop, exp) =>
  crypto.createHmac('sha256', SECRET).update(`${prop}:${email.toLowerCase()}:${exp}`).digest('hex');

test('un token recién generado es válido', () => {
  const t = generarToken('user@dominio.com', 'confirm');
  assert.equal(tokenValido('user@dominio.com', 'confirm', t), true);
});

test('token con firma alterada es inválido', () => {
  const t = generarToken('user@dominio.com', 'confirm');
  const [exp] = t.split('.');
  assert.equal(tokenValido('user@dominio.com', 'confirm', `${exp}.deadbeef`), false);
});

test('no vale el token de otro email ni de otro propósito', () => {
  const t = generarToken('user@dominio.com', 'confirm');
  assert.equal(tokenValido('otro@dominio.com', 'confirm', t), false);
  assert.equal(tokenValido('user@dominio.com', 'unsub', t), false);
});

// BUG #5: los tokens deben expirar.
test('un token vencido es rechazado aunque la firma sea correcta', () => {
  const exp = Date.now() - 1000; // ya venció
  const token = `${exp}.${firmar('user@dominio.com', 'confirm', exp)}`;
  assert.equal(tokenValido('user@dominio.com', 'confirm', token), false);
});

test('un token futuro con firma válida se acepta (valida el formato exp.sig)', () => {
  const exp = Date.now() + 60_000;
  const token = `${exp}.${firmar('user@dominio.com', 'confirm', exp)}`;
  assert.equal(tokenValido('user@dominio.com', 'confirm', token), true);
});

test('tokens vacíos o mal formados no rompen', () => {
  assert.equal(tokenValido('user@dominio.com', 'confirm', ''), false);
  assert.equal(tokenValido('user@dominio.com', 'confirm', undefined), false);
  assert.equal(tokenValido('user@dominio.com', 'confirm', 'sinpunto'), false);
});
