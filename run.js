// ============================================================
// ORQUESTADOR — hace todo tu proceso manual, automáticamente:
//   1. Lee el listado de la comisión y filtra SOLO proyectos de LEY.
//   2. Para cada proyecto NUEVO (no visto en data/proyectos-seguimiento.json):
//        detalle -> PDF -> resumen IA -> email a los suscriptores -> guarda.
//   3. Para cada proyecto YA conocido: si cambió el trámite, avisa.
//   4. Guarda el estado en data/proyectos-seguimiento.json (la GitHub Action
//      lo commitea al repo; ese archivo también puede alimentar tu página).
//
// Uso:  node run.js               (nuevos + cambios de trámite)
//       node run.js --solo-nuevos (solo carga nuevos, sin revisar trámites)
//       node run.js --ultimo      (solo revisa el último proyecto del listado)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { listarProyectosLey, getDetalle, getPdfUrl, descargarPdf } from './lib/scraper.js';
import { extraerTextoPdf, resumir } from './lib/summarize.js';
import { listarConfirmados } from './lib/subscribers.js';
import { enviarATodos, htmlNuevoProyecto, htmlActualizacion } from './lib/mailer.js';

const ESTADO_PATH = process.env.ESTADO_PATH || path.join(process.cwd(), 'data', 'proyectos-seguimiento.json');
const hash = (s) => crypto.createHash('sha1').update(s || '').digest('hex');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function leerEstado() {
  try { return JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8')); } catch { return []; }
}
function guardarEstado(lista) {
  fs.mkdirSync(path.dirname(ESTADO_PATH), { recursive: true });
  fs.writeFileSync(ESTADO_PATH, JSON.stringify(lista, null, 2) + '\n');
}

async function main() {
  const soloNuevos = process.argv.includes('--solo-nuevos');
  const soloUltimo = process.argv.includes('--ultimo');
  const estado = leerEstado();
  const primeraCarga = estado.length === 0 && process.env.SEGUIMIENTO_NOTIFY_INITIAL !== 'true';
  const porExp = new Map(estado.map(p => [p.expediente, p]));

  if (primeraCarga) {
    console.log('Primera carga detectada: se guardará el estado inicial sin enviar emails masivos.');
  }

  const contactos = await listarConfirmados().catch(e => { console.error('No pude leer suscriptores:', e.message); return []; });
  console.log(`Suscriptores confirmados: ${contactos.length}`);

  const listado = await listarProyectosLey();
  const proyectos = soloUltimo ? listado.slice(0, 1) : listado;
  console.log(`Proyectos de LEY en el listado: ${proyectos.length}`);

  let nuevos = 0, cambios = 0;

  for (const item of proyectos) {
    const guardado = porExp.get(item.expediente);
    try {
      if (!guardado) {
        // NUEVO
        console.log('→ Nuevo proyecto de LEY:', item.expediente);
        const det = await getDetalle(item.expediente);
        let pdf_url = '', resumen = item.sumario;
        try {
          pdf_url = await getPdfUrl(det.adjuntoLink);
          if (pdf_url) {
            const texto = await extraerTextoPdf(await descargarPdf(pdf_url));
            resumen = await resumir({ sumario: item.sumario, textoPdf: texto });
          }
        } catch (e) { console.error('  PDF/resumen falló:', e.message); }

        const registro = {
          expediente: item.expediente, tipo: item.tipo, sumario: item.sumario, fecha: item.fecha,
          autores: det.autores, giro: det.giro, pdf_url, resumen, url: det.url,
          tramite_hash: hash(det.tramite), updates: [],
        };
        porExp.set(item.expediente, registro);

        if (!primeraCarga && contactos.length) {
          const n = await enviarATodos(contactos, `Nuevo proyecto de ley: ${item.expediente}`,
            (email) => htmlNuevoProyecto(registro, email));
          console.log(`  Avisado a ${n} suscriptor(es).`);
        }
        nuevos++;
      } else if (!soloNuevos && !soloUltimo) {
        // YA CONOCIDO: ¿cambió el trámite?
        const det = await getDetalle(item.expediente);
        const nuevoHash = hash(det.tramite);
        if (nuevoHash !== guardado.tramite_hash && !(guardado.updates || []).includes(nuevoHash)) {
          console.log('→ Cambio de trámite en:', item.expediente);
          guardado.tramite_hash = nuevoHash;
          guardado.giro = det.giro;
          guardado.updates = [...(guardado.updates || []), nuevoHash];
          const detalle = 'El proyecto registró un movimiento en su trámite parlamentario. '
            + 'Entrá al enlace para ver el detalle actualizado en Diputados.';
          if (contactos.length) {
            await enviarATodos(contactos, `Novedad — ${item.expediente}`,
              (email) => htmlActualizacion(guardado, detalle, email));
          }
          cambios++;
        }
      }
    } catch (e) { console.error('Error con', item.expediente, e.message); }
    if (!soloUltimo) await sleep(800); // cortesía con el servidor de Diputados
  }

  guardarEstado([...porExp.values()]);
  console.log(`Listo. ${nuevos} nuevo(s), ${cambios} cambio(s) de trámite. Estado guardado en ${ESTADO_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
