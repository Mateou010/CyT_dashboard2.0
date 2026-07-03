import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.RESEND_API_KEY = 'test_key';
process.env.SUBSCRIBE_SECRET = 'x'.repeat(30);
process.env.SITE_URL = 'https://cyt.example';
const { esc, safeUrl, conReintentos, htmlNuevoProyecto } = await import('../lib/mailer.js');

test('esc escapa los metacaracteres de HTML', () => {
  assert.equal(esc('<img onerror=x>'), '&lt;img onerror=x&gt;');
  assert.equal(esc(`a & "b" 'c'`), 'a &amp; &quot;b&quot; &#39;c&#39;');
  assert.equal(esc(null), '');
});

test('safeUrl solo deja pasar http(s)', () => {
  assert.equal(safeUrl('https://diputados.gov.ar/x.pdf'), 'https://diputados.gov.ar/x.pdf');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,x'), '');
  assert.equal(safeUrl(''), '');
});

// SEGURIDAD B2: datos scrapeados no deben inyectar HTML en el email.
test('htmlNuevoProyecto escapa contenido malicioso y neutraliza URLs no http', () => {
  const html = htmlNuevoProyecto(
    {
      expediente: '0001-D-2024',
      sumario: '<script>alert(1)</script>',
      fecha: '01/01/2024',
      autores: [{ nombre: '<b>x</b>', bloque: 'B' }],
      giro: [],
      resumen: 'linea1\n<img src=x onerror=y>',
      pdf_url: 'javascript:alert(1)',
    },
    'user@dominio.com',
  );
  assert.ok(!html.includes('<script>alert(1)</script>'), 'no debe contener el script crudo');
  assert.ok(html.includes('&lt;script&gt;'), 'debe estar escapado');
  assert.ok(!html.includes('javascript:alert(1)'), 'la URL peligrosa debe quedar fuera');
  assert.ok(html.includes('linea1<br>'), 'los saltos de línea del resumen se mantienen como <br>');
});

// BUG #6: reintentos ante fallos transitorios (429).
test('conReintentos reintenta y termina devolviendo el resultado', async () => {
  let intentos = 0;
  const r = await conReintentos(
    () => { intentos++; if (intentos < 3) throw new Error('429'); return 'ok'; },
    { intentos: 3, sleep: () => Promise.resolve() },
  );
  assert.equal(r, 'ok');
  assert.equal(intentos, 3);
});

test('conReintentos se rinde tras agotar los intentos y propaga el error', async () => {
  let intentos = 0;
  await assert.rejects(
    () => conReintentos(() => { intentos++; throw new Error('siempre falla'); }, { intentos: 2, sleep: () => Promise.resolve() }),
    /siempre falla/,
  );
  assert.equal(intentos, 2);
});
