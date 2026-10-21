// ============================================================
// SYNC AGENDA — arma data/agenda.json con las reuniones de la Comisión de
// Ciencia y Tecnología: las pasadas (con citación y video) y las próximas
// (desde la agenda general de comisiones de Diputados).
//
// Uso:  node scripts/sync-agenda.mjs            (o: npm run sync:agenda)
//       node scripts/sync-agenda.mjs --alertar  (además avisa citaciones nuevas)
//
// Los avisos por email están APAGADOS por defecto: solo se envían si
// ALERTAS_CITACIONES=1. Si no, se loguea lo que se enviaría y no se marca nada.
// Las citaciones ya avisadas quedan en data/citaciones-enviadas.json.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import {
  obtenerAgenda, REUNIONES_URL, hoyArgentina, fechaLarga,
  citacionesPendientes, claveCitacion, asuntoCitacion,
} from '../lib/agenda.js';

const AGENDA_PATH = process.env.AGENDA_PATH || path.join(process.cwd(), 'data', 'agenda.json');
const ENVIADAS_PATH = process.env.CITACIONES_PATH || path.join(process.cwd(), 'data', 'citaciones-enviadas.json');
const DIAS_RETENCION = 180; // las citaciones avisadas más viejas que esto se olvidan

const leerJson = (archivo, porDefecto) => {
  try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return porDefecto; }
};
const guardarJson = (archivo, data) => {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(data, null, 2) + '\n');
};

async function alertar(proximas, hoy) {
  const estado = leerJson(ENVIADAS_PATH, { avisadas: [] });
  const avisadas = Array.isArray(estado.avisadas) ? estado.avisadas : [];
  const pendientes = citacionesPendientes(proximas, avisadas);
  if (!pendientes.length) {
    console.log('Citaciones: no hay reuniones nuevas para avisar.');
    return;
  }

  const activo = process.env.ALERTAS_CITACIONES === '1';
  if (!activo) {
    for (const r of pendientes) {
      console.log(`[simulación] Se enviaría "${asuntoCitacion(r)}" (${r.sala || 'sala s/d'}; ${r.citacion_url || 'sin citación'}).`);
    }
    console.log('Avisos de citación apagados (ALERTAS_CITACIONES != 1): no se envió ni se marcó nada.');
    return;
  }

  // Import dinámico: sin alertas activas no hace falta configurar Resend.
  const { listarConfirmados } = await import('../lib/subscribers.js');
  const { enviarATodos, htmlCitacion } = await import('../lib/mailer.js');

  let contactos;
  try {
    contactos = await listarConfirmados();
  } catch (e) {
    console.error('No pude leer suscriptores; las citaciones quedan pendientes para la próxima corrida:', e.message);
    return;
  }
  console.log(`Suscriptores confirmados: ${contactos.length}`);

  for (const r of pendientes) {
    const asunto = asuntoCitacion(r);
    let enviados = 0;
    if (contactos.length) {
      enviados = await enviarATodos(contactos, asunto, (email) => htmlCitacion(r, fechaLarga(r.fecha), email));
    }
    console.log(`→ ${asunto}: avisado a ${enviados} suscriptor(es).`);
    avisadas.push({
      clave: claveCitacion(r), reunion_id: r.reunion_id, fecha: r.fecha, hora: r.hora,
      avisado: new Date().toISOString(), enviados,
    });
  }

  const limite = new Date(Date.parse(`${hoy}T00:00:00Z`) - DIAS_RETENCION * 86400000).toISOString().slice(0, 10);
  guardarJson(ENVIADAS_PATH, { avisadas: avisadas.filter((a) => (a.fecha || '') >= limite) });
  console.log(`Citaciones avisadas guardadas en ${ENVIADAS_PATH}`);
}

async function main() {
  const hoy = hoyArgentina();
  const anterior = leerJson(AGENDA_PATH, null);

  let datos;
  try {
    datos = await obtenerAgenda({ hoy });
  } catch (e) {
    console.warn('No pude consultar la web de Diputados. Se termina sin cambios y sin enviar emails:', e.message);
    return;
  }

  let { reuniones } = datos;
  if (!datos.videosOk && anterior?.reuniones) {
    // Sin la página de videos, conservamos los links que ya teníamos.
    const previos = new Map(anterior.reuniones.map((r) => [`${r.fecha}|${r.hora}`, r.video_url]));
    reuniones = reuniones.map((r) => ({ ...r, video_url: previos.get(`${r.fecha}|${r.hora}`) || null }));
  }
  if (!reuniones.length && anterior?.reuniones?.length) {
    console.warn('La página de reuniones vino vacía (¿cambió el HTML?). Conservo las reuniones anteriores.');
    reuniones = anterior.reuniones;
  }

  const resultado = {
    generado: new Date().toISOString(),
    fuente: REUNIONES_URL,
    dia_habitual: datos.dia_habitual || anterior?.dia_habitual || null,
    proxima: datos.proxima,
    proximas: datos.proximas,
    reuniones,
  };

  const sinFecha = (o) => JSON.stringify({ ...o, generado: null });
  if (anterior && sinFecha(anterior) === sinFecha(resultado)) {
    console.log(`Agenda sin cambios. ${AGENDA_PATH} queda como estaba.`);
  } else {
    guardarJson(AGENDA_PATH, resultado);
    console.log(`Guardado ${AGENDA_PATH}`);
  }

  const porAnio = {};
  for (const r of reuniones) porAnio[r.fecha.slice(0, 4)] = (porAnio[r.fecha.slice(0, 4)] || 0) + 1;
  console.log(`Reuniones: ${reuniones.length} (${Object.entries(porAnio).map(([a, n]) => `${a}: ${n}`).join(', ')}), `
    + `con video: ${reuniones.filter((r) => r.video_url).length}. Próximas de CyT: ${datos.proximas.length}`
    + (datos.proxima ? ` (la próxima: ${datos.proxima.fecha} ${datos.proxima.hora})` : ' (ninguna en agenda)'));

  if (process.argv.includes('--alertar')) await alertar(datos.proximas, hoy);
}

main().catch((e) => { console.error(e); process.exit(1); });
