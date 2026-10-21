import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.RESEND_API_KEY = 'test_key';
process.env.SUBSCRIBE_SECRET = 'x'.repeat(30);
process.env.SITE_URL = 'https://cyt.example';
const {
  parsearReuniones, parsearVideos, parsearAgenda, parsearDiaHabitual, asignarVideos,
  proximasDesde, citacionesPendientes, claveCitacion, asuntoCitacion,
  fechaEnPalabras, fechaDdMmAaaa, fechaLarga, limpiarSala, hoyArgentina,
} = await import('../lib/agenda.js');
const { htmlCitacion } = await import('../lib/mailer.js');

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const htmlReuniones = fixture('reuniones-cyt.html');
const reuniones = parsearReuniones(htmlReuniones);
const agenda = parsearAgenda(fixture('agenda-comisiones.html'));

test('parsearReuniones lee cada bloque "REUNIONES DEL DIA" con su DOM', () => {
  assert.equal(reuniones.length, 7);
  assert.deepEqual(reuniones[0], {
    fecha: '2026-06-30',
    hora: '14:00',
    sala: 'Sala 4 - Anexo "A"',
    tipos: ['temas-varios'],
    conjunta_con: [],
    rotulo: 'TEMAS VARIOS.',
    temario: 'Establecer agenda de trabajo. Proyectos de resolución y declaración.',
    citacion_url: 'https://parlamentaria.hcdn.gob.ar/comisiones/reuniones/1254/archivo/526BJSAZBZBXMHJP.pdf',
    ampliaciones: ['https://parlamentaria.hcdn.gob.ar/comisiones/reuniones/1254/archivo/ZG517EHKCZ3W0Z39.pdf'],
    video_url: null,
    suspendida: false,
    reunion_id: '1254',
  });
});

test('parsearReuniones clasifica conjuntas, informativas, invitados, emplazamiento, constitutivas y suspendidas', () => {
  const porFecha = Object.fromEntries(reuniones.map((r) => [r.fecha, r]));
  const rigi = porFecha['2026-06-10'];
  assert.equal(rigi.sala, 'Anexo "C" - 2° piso');
  assert.deepEqual(rigi.tipos, ['conjunta', 'informativa', 'invitados']);
  assert.deepEqual(rigi.conjunta_con, ['Presupuesto y Hacienda', 'Industria']);
  assert.match(rigi.temario, /^Mensaje nro: 181\/2026/);
  // Conjunta sin el rótulo "REUNIÓN CONJUNTA": se deduce por las dos comisiones.
  assert.deepEqual(porFecha['2025-11-27'].tipos, ['conjunta', 'informativa', 'invitados']);
  assert.deepEqual(porFecha['2025-11-27'].conjunta_con, ['Accion Social y Salud Publica']);
  assert.equal(porFecha['2025-06-17'].sala, null);
  assert.match(porFecha['2025-06-17'].citacion_url, /reuniones\/898\/archivo\/PXH7/);
  assert.deepEqual(porFecha['2025-08-13'].tipos, ['conjunta', 'emplazamiento']);
  const susp = porFecha['2024-05-02'];
  assert.equal(susp.suspendida, true);
  assert.equal(susp.sala, 'Sala 4 (327)');
  assert.deepEqual(susp.tipos, ['temas-varios', 'suspendida']);
  assert.equal(susp.reunion_id, null);
  assert.equal(susp.citacion_url, 'https://www4.hcdn.gob.ar/archivos/dcomisiones-citaciones/cyt-02-05-2024.pdf');
  const constitutiva = porFecha['2024-04-17'];
  assert.equal(constitutiva.sala, 'Sala 1. Anexo "A"');
  assert.deepEqual(constitutiva.tipos, ['informativa', 'constitutiva']);
  assert.equal(constitutiva.citacion_url, null);
});

test('parsearDiaHabitual lee el campo "Reuniones:" del encabezado', () => {
  assert.equal(parsearDiaHabitual(htmlReuniones), 'Martes 15:00');
  assert.equal(parsearDiaHabitual('<p>sin datos</p>'), null);
});

test('parsearVideos agrupa por fecha, ignora hosts ajenos y asignarVideos mapea por fecha', () => {
  const videos = parsearVideos(fixture('videos-cyt.html'));
  assert.deepEqual(Object.keys(videos), ['2026-06-30', '2026-06-10', '2025-11-27', '2025-02-05']);
  const conVideo = asignarVideos(reuniones, videos);
  assert.equal(conVideo[0].video_url, 'https://videos.hcdn.gob.ar/video/evento/e/7498');
  assert.equal(conVideo.find((r) => r.fecha === '2025-06-17').video_url, null);
  assert.equal(conVideo.filter((r) => r.video_url).length, 3);
});

test('parsearAgenda se queda solo con reuniones donde participa CyT (también conjuntas)', () => {
  assert.deepEqual(agenda.map((r) => `${r.fecha} ${r.hora}`), ['2026-10-21 14:00', '2026-10-27 16:00', '2026-10-29 11:00']);
  const conjunta = agenda[1];
  assert.deepEqual(conjunta.tipos, ['conjunta', 'invitados']);
  assert.deepEqual(conjunta.conjunta_con, ['Presupuesto y Hacienda', 'Relaciones Exteriores y Culto']);
  assert.equal(conjunta.temario, 'Mensaje Nro. 275/2026 y proyecto de ley.\n- Expediente 0032-S-2026.\n- Orden del Día 349.');
  assert.equal(conjunta.reunion_id, '1366');
  // Sin PDF de citación: el id sale del link comentado (reun=1370). Leyenda SUSPENDIDA.
  assert.equal(agenda[2].reunion_id, '1370');
  assert.equal(agenda[2].suspendida, true);
  assert.equal(agenda[2].citacion_url, null);
});

test('proximasDesde ordena, descarta pasadas y no elige una suspendida como próxima', () => {
  const { proxima, proximas } = proximasDesde(agenda, '2026-10-22');
  assert.equal(proximas.length, 2);
  assert.equal(proxima.fecha, '2026-10-27');
  assert.equal(proximasDesde(agenda, '2026-10-30').proxima, null);
  assert.equal(proximasDesde([], '2026-10-22').proxima, null);
});

test('citacionesPendientes ignora suspendidas y las ya avisadas', () => {
  const { proximas } = proximasDesde(agenda, '2026-10-21');
  assert.equal(citacionesPendientes(proximas, []).length, 2);
  const avisadas = [{ clave: claveCitacion(proximas[0]) }];
  assert.deepEqual(citacionesPendientes(proximas, avisadas).map((r) => r.fecha), ['2026-10-27']);
  // Si la reprograman (cambia la fecha), es una citación nueva.
  assert.notEqual(claveCitacion({ ...proximas[1], fecha: '2026-11-03' }), claveCitacion(proximas[1]));
});

test('asunto y fechas en castellano', () => {
  assert.equal(asuntoCitacion({ fecha: '2026-10-27', hora: '16:00' }), 'Citación: la comisión se reúne el martes 27 de octubre a las 16:00');
  assert.equal(fechaEnPalabras(' miércoles 21 de octubre del 2026'), '2026-10-21');
  assert.equal(fechaEnPalabras('sábado 1 de marzo de 2025'), '2025-03-01');
  assert.equal(fechaDdMmAaaa('REUNIONES DEL DIA 02/05/2024'), '2024-05-02');
  assert.equal(fechaLarga('2026-10-21'), 'miércoles 21 de octubre');
  assert.equal(hoyArgentina(new Date('2026-10-22T02:00:00Z')), '2026-10-21');
});

test('limpiarSala separa agregados de la sala', () => {
  assert.deepEqual(limpiarSala('Sala 1  -   Anexo "A"   -   Reunión Informativa'), { sala: 'Sala 1 - Anexo "A"', informativa: true, suspendida: false });
  assert.deepEqual(limpiarSala('Sala 4 (327) -SUSPENDIDA'), { sala: 'Sala 4 (327)', informativa: false, suspendida: true });
  assert.deepEqual(limpiarSala('Sala 7 '), { sala: 'Sala 7', informativa: false, suspendida: false });
});

test('htmlCitacion escapa el temario y enlaza a la agenda del sitio', () => {
  const html = htmlCitacion({
    fecha: '2026-10-27', hora: '16:00', sala: 'Sala <b>4</b>', temario: '<script>x</script>\nlinea 2',
    citacion_url: 'javascript:alert(1)', conjunta_con: ['Industria'],
  }, 'martes 27 de octubre', 'user@dominio.com');
  assert.ok(html.includes('La comisión se reúne el martes 27 de octubre a las 16:00'));
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;<br>linea 2'));
  assert.ok(!html.includes('javascript:alert(1)'));
  assert.ok(html.includes('https://cyt.example/agenda'));
});
