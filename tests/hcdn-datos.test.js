import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv, csvAObjetos, decodificarCsv, columnasCsv, tieneColumnas,
  nombreDisplay, claveNombre, capitalizar, mediana,
  calcularIntegrantes, calcularActividad, NOMBRE_ACTUAL, NOMBRE_ANTERIOR,
} from '../lib/hcdn-datos.js';

test('parseCsv soporta comillas con comas, saltos de línea y comillas escapadas', () => {
  const csv = 'A,B,C\r\n1,"hola, mundo","dijo ""sí"""\n2,"línea 1\nlínea 2",\n';
  assert.deepEqual(parseCsv(csv), [
    ['A', 'B', 'C'],
    ['1', 'hola, mundo', 'dijo "sí"'],
    ['2', 'línea 1\nlínea 2', ''],
  ]);
});

test('parseCsv ignora filas vacías y tolera la falta de salto final', () => {
  assert.deepEqual(parseCsv('A,B\n\n1,2'), [['A', 'B'], ['1', '2']]);
  assert.deepEqual(parseCsv(''), []);
});

test('csvAObjetos usa la cabecera (normalizada a mayúsculas) como claves', () => {
  const { columnas, filas } = csvAObjetos('proyecto_id,giro_comision\nHCDN1," CIENCIA Y TECNOLOGIA "\n');
  assert.deepEqual(columnas, ['PROYECTO_ID', 'GIRO_COMISION']);
  assert.deepEqual(filas, [{ PROYECTO_ID: 'HCDN1', GIRO_COMISION: 'CIENCIA Y TECNOLOGIA' }]);
});

test('decodificarCsv detecta UTF-8 y cae a Latin-1 si el UTF-8 es inválido', () => {
  const utf8 = Buffer.from('﻿NOMBRE\nRÍO NEGRO\n', 'utf8');
  assert.equal(decodificarCsv(utf8), 'NOMBRE\nRÍO NEGRO\n');
  const latin1 = Buffer.from('NOMBRE\nR\xCDO NEGRO, AG\xDCERO\n', 'latin1');
  assert.equal(decodificarCsv(latin1), 'NOMBRE\nRÍO NEGRO, AGÜERO\n');
});

test('columnasCsv + tieneColumnas identifican recursos por cabecera, sin importar el orden', () => {
  const cols = columnasCsv('COMISION_ID,DIPUTADO_NOMBRE,BLOQUE\r\nHCDN00185,"YEZA, Martín",PRO');
  assert.deepEqual(cols, ['COMISION_ID', 'DIPUTADO_NOMBRE', 'BLOQUE']);
  assert.equal(tieneColumnas(cols, ['BLOQUE', 'COMISION_ID', 'DIPUTADO_NOMBRE']), true);
  assert.equal(tieneColumnas(cols, ['COMISION_ID', 'DIPUTADO_NOMBRE', 'DISTRITO']), false);
  assert.equal(tieneColumnas(cols, ['COMISION_ID', 'DIPUTADO_NOMBRE']), false);
});

test('nombreDisplay convierte "APELLIDO, Nombre" en "Nombre Apellido"', () => {
  assert.equal(nombreDisplay('YEZA, Martín'), 'Martín Yeza');
  assert.equal(nombreDisplay('METRAL ASENSIO, Julieta'), 'Julieta Metral Asensio');
  assert.equal(nombreDisplay('AGÜERO, Guillermo César'), 'Guillermo César Agüero');
  assert.equal(nombreDisplay('FERNÁNDEZ MOLERO, Daiana'), 'Daiana Fernández Molero');
  assert.equal(nombreDisplay('DE LA TORRE, María'), 'María de la Torre');
  assert.equal(nombreDisplay("D'ALESSANDRO, Juan"), "Juan D'Alessandro");
  assert.equal(nombreDisplay('PÉREZ-GIL, Ana'), 'Ana Pérez-Gil');
});

test('nombreDisplay sin coma toma las palabras en mayúsculas como apellido', () => {
  assert.equal(nombreDisplay('MAYORAZ Nicolás'), 'Nicolás Mayoraz');
  assert.equal(nombreDisplay('GARCÍA LÓPEZ Ana María'), 'Ana María García López');
  assert.equal(nombreDisplay(''), '');
});

test('claveNombre iguala variantes con y sin coma o tildes', () => {
  assert.equal(claveNombre('YEZA, Martín'), claveNombre('YEZA Martin'));
  assert.equal(claveNombre('  AGÜERO,  Guillermo '), 'AGUERO GUILLERMO');
  assert.equal(capitalizar('PRESUPUESTO Y HACIENDA'), 'Presupuesto y Hacienda');
});

test('mediana con cantidad par e impar', () => {
  assert.equal(mediana([5, 1, 3]), 3);
  assert.equal(mediana([1, 2, 3, 10]), 3);
  assert.equal(mediana([]), null);
});

test('calcularIntegrantes cruza bloque, género y cargo aunque cambie el formato del nombre', () => {
  const id = 'HCDN00185';
  const r = calcularIntegrantes({
    integrantes: [
      { COMISION_ID: id, DIPUTADO_NOMBRE: 'ZETA, Ana', DISTRITO: 'CABA' },
      { COMISION_ID: id, DIPUTADO_NOMBRE: 'YEZA, Martín', DISTRITO: 'BUENOS AIRES' },
      { COMISION_ID: 'OTRA', DIPUTADO_NOMBRE: 'X, Y', DISTRITO: 'SALTA' },
    ],
    porBloque: [
      { COMISION_ID: id, DIPUTADO_NOMBRE: 'ZETA Ana', BLOQUE: 'UXP' },
      { COMISION_ID: id, DIPUTADO_NOMBRE: 'YEZA Martín', BLOQUE: 'PRO' },
    ],
    porGenero: [
      { COMISION_ID: id, DIPUTADO_NOMBRE: 'ZETA, Ana', DIPUTADO_GENERO: 'F' },
      { COMISION_ID: id, DIPUTADO_NOMBRE: 'YEZA, Martín', DIPUTADO_GENERO: 'M' },
    ],
    autoridades: [{ COMISION_ID: id, CARGO: 'Presidente', DIPUTADO_NOMBRE: 'YEZA Martín', BLOQUE: 'PRO', DISTRITO: 'BUENOS AIRES' }],
  }, id);
  assert.deepEqual(r.integrantes[0], {
    nombre: 'YEZA, Martín', nombre_display: 'Martín Yeza', bloque: 'PRO',
    distrito: 'BUENOS AIRES', genero: 'M', cargo: 'Presidente',
  });
  assert.equal(r.integrantes[1].cargo, null);
  assert.deepEqual(r.resumen_integrantes, {
    total: 2, mujeres: 1, varones: 1, distritos: 2,
    por_bloque: [{ bloque: 'PRO', n: 1 }, { bloque: 'UXP', n: 1 }],
  });
});

test('calcularActividad: recorrido, historia y destacados', () => {
  const proyectos = [
    { PROYECTO_ID: 'P1', TIPO: 'LEY', PUBLICACION_FECHA: '2020-01-01T00:00:00', EXP_DIPUTADOS: '0001-D-2020', EXP_SENADO: '', TITULO: 'LEY UNO' },
    { PROYECTO_ID: 'P2', TIPO: 'MENSAJE Y PROYECTO DE LEY', PUBLICACION_FECHA: '2024-03-01T00:00:00', EXP_DIPUTADOS: '', EXP_SENADO: '0002-S-2024', TITULO: 'LEY DOS' },
    { PROYECTO_ID: 'P3', TIPO: 'RESOLUCION', PUBLICACION_FECHA: '2024-05-01T00:00:00', EXP_DIPUTADOS: '0003-D-2024', EXP_SENADO: '', TITULO: 'RES' },
    { PROYECTO_ID: 'P4', TIPO: 'LEY', PUBLICACION_FECHA: '2010-06-01T00:00:00', EXP_DIPUTADOS: '0004-D-2010', EXP_SENADO: '', TITULO: 'VIEJA' },
  ];
  const giros = [
    { PROYECTO_ID: 'P1', COMISION: NOMBRE_ACTUAL },
    { PROYECTO_ID: 'P2', COMISION: NOMBRE_ACTUAL },
    { PROYECTO_ID: 'P3', COMISION: NOMBRE_ACTUAL },
    { PROYECTO_ID: 'P4', COMISION: NOMBRE_ANTERIOR },
    { PROYECTO_ID: 'P9', COMISION: NOMBRE_ACTUAL }, // no existe en proyectos: no cuenta
  ];
  const dictamenes = [
    { EXPEDIENTE: 'P1', GIRO: NOMBRE_ACTUAL, FECHA: '2020-01-11T00:00:00' },
    { EXPEDIENTE: 'P1', GIRO: NOMBRE_ACTUAL, FECHA: '2019-12-01T00:00:00' }, // anterior a la publicación: se ignora
    { EXPEDIENTE: 'P2', GIRO: NOMBRE_ACTUAL, FECHA: '2024-03-31T00:00:00' },
    { EXPEDIENTE: 'P3', GIRO: 'OTRA COMISION', FECHA: '2024-06-01T00:00:00' },
  ];
  const resultados = [
    // Varias filas por expediente: una con resultado y otra vacía. Cuenta el resultado.
    { EXPEDIENTE_ID: 'P1', RESULTADO: 'MEDIA SANCION' },
    { EXPEDIENTE_ID: 'P1', RESULTADO: '' },
    { EXPEDIENTE_ID: 'P2', RESULTADO: 'SANCIONADO' },
    { EXPEDIENTE_ID: 'P3', RESULTADO: 'APROBADO' },
  ];
  const r = calcularActividad({ giros, proyectos, dictamenes, resultados });
  assert.deepEqual(r.recorrido, {
    desde: 2014,
    ley: { girados: 2, con_dictamen: 2, media_sancion: 1, sancionados: 1, mediana_dias_dictamen: 20 },
    otros: { girados: 1, con_dictamen: 0, aprobados: 1 },
    total_girados: 3,
  });
  assert.deepEqual(r.historia, [
    { anio: 2010, ley: 1, otros: 0 },
    { anio: 2020, ley: 1, otros: 0 },
    { anio: 2024, ley: 1, otros: 1 },
  ]);
  assert.deepEqual(r.destacados.map((d) => [d.expediente, d.anio, d.resultado]), [
    ['0002-S-2024', 2024, 'SANCIONADO'],
    ['0001-D-2020', 2020, 'MEDIA SANCION'],
  ]);
});
