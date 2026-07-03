import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostPermitido } from '../lib/scraper.js';

// SEGURIDAD B3: solo se permite fetch a Diputados / HCDN.
test('hostPermitido acepta los dominios oficiales', () => {
  assert.equal(hostPermitido('https://www.diputados.gov.ar/comisiones/x.html'), true);
  assert.equal(hostPermitido('https://diputados.gov.ar/x'), true);
  assert.equal(hostPermitido('https://rest.hcdn.gob.ar/doc.pdf'), true);
});

test('hostPermitido rechaza dominios ajenos y trucos de sufijo', () => {
  assert.equal(hostPermitido('http://evil.com/x'), false);
  assert.equal(hostPermitido('https://diputados.gov.ar.evil.com/x'), false);
  assert.equal(hostPermitido('not-a-url'), false);
  assert.equal(hostPermitido(''), false);
});
