import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFechaAR, ordenarPorFechaDesc, seleccionarVentana, tramiteCambio } from '../lib/seguimiento-utils.js';

test('parseFechaAR parsea DD/MM/YYYY', () => {
  const d = parseFechaAR('05/03/2024');
  assert.equal(d.getFullYear(), 2024);
  assert.equal(d.getMonth(), 2); // marzo = 2
  assert.equal(d.getDate(), 5);
});

test('parseFechaAR rechaza formato inválido y fechas inexistentes', () => {
  assert.equal(parseFechaAR('2024-03-05'), null);
  assert.equal(parseFechaAR('31/02/2024'), null); // febrero no tiene 31
  assert.equal(parseFechaAR(''), null);
  assert.equal(parseFechaAR(undefined), null);
});

test('ordenarPorFechaDesc pone los más nuevos primero y los sin fecha al final', () => {
  const items = [
    { id: 'a', fecha: '01/01/2024' },
    { id: 'b', fecha: '10/06/2024' },
    { id: 'c', fecha: '' },
    { id: 'd', fecha: '05/03/2024' },
  ];
  assert.deepEqual(ordenarPorFechaDesc(items).map((x) => x.id), ['b', 'd', 'a', 'c']);
});

test('ordenarPorFechaDesc no muta el array original', () => {
  const items = [{ id: 'a', fecha: '01/01/2024' }, { id: 'b', fecha: '10/06/2024' }];
  const copia = [...items];
  ordenarPorFechaDesc(items);
  assert.deepEqual(items, copia);
});

// CRÍTICO #3: la ventana debe tomar los N MÁS NUEVOS, no las primeras N filas.
test('seleccionarVentana toma los más nuevos aunque estén al final del listado', () => {
  const listado = [
    { id: 'viejo1', fecha: '01/01/2020' },
    { id: 'viejo2', fecha: '01/01/2021' },
    { id: 'nuevo', fecha: '01/01/2025' }, // el más nuevo está último (como en Diputados)
  ];
  const ventana = seleccionarVentana(listado, 1);
  assert.equal(ventana.length, 1);
  assert.equal(ventana[0].id, 'nuevo');
});

test('seleccionarVentana sin cantidad devuelve todo el listado sin reordenar', () => {
  const listado = [{ id: 'a', fecha: '01/01/2020' }, { id: 'b', fecha: '01/01/2025' }];
  assert.deepEqual(seleccionarVentana(listado, 0), listado);
  assert.deepEqual(seleccionarVentana(listado, undefined), listado);
});

// CRÍTICO #2: detección de cambio de trámite.
test('tramiteCambio detecta un hash nuevo y no re-notifica los ya vistos', () => {
  const guardado = { tramite_hash: 'h1', updates: ['h1'] };
  assert.equal(tramiteCambio('h2', guardado), true);   // cambió
  assert.equal(tramiteCambio('h1', guardado), false);  // igual al actual
  assert.equal(tramiteCambio('h2', { tramite_hash: 'h1', updates: ['h2'] }), false); // ya notificado
  assert.equal(tramiteCambio('h2', null), false);      // proyecto no guardado
});
