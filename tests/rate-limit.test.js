import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, clientIp, _reset } from '../lib/rate-limit.js';

test('permite hasta el límite y luego bloquea', () => {
  _reset();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(rateLimit('k', { limit: 3, windowMs: 60_000, now }).ok, true);
  }
  const bloqueado = rateLimit('k', { limit: 3, windowMs: 60_000, now });
  assert.equal(bloqueado.ok, false);
  assert.ok(bloqueado.retryAfterMs > 0);
});

test('la ventana se libera al pasar el tiempo', () => {
  _reset();
  const base = 1_000_000;
  for (let i = 0; i < 3; i++) rateLimit('k', { limit: 3, windowMs: 60_000, now: base });
  assert.equal(rateLimit('k', { limit: 3, windowMs: 60_000, now: base }).ok, false);
  // 61s después, la ventana ya no cuenta los hits viejos
  assert.equal(rateLimit('k', { limit: 3, windowMs: 60_000, now: base + 61_000 }).ok, true);
});

test('claves distintas no se pisan', () => {
  _reset();
  const now = 2_000_000;
  assert.equal(rateLimit('a', { limit: 1, now }).ok, true);
  assert.equal(rateLimit('a', { limit: 1, now }).ok, false);
  assert.equal(rateLimit('b', { limit: 1, now }).ok, true);
});

test('clientIp prefiere x-real-ip y, si no, el último hop (no el primero, spoofeable)', () => {
  assert.equal(clientIp({ headers: { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '9.9.9.9');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '5.6.7.8');
  assert.equal(clientIp({ headers: {} }), 'unknown');
});
