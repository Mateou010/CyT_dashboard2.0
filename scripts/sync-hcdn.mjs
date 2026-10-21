// ============================================================
// SYNC HCDN — arma data/comision.json desde los datos abiertos de Diputados
// (datos.hcdn.gob.ar, API CKAN). Integrantes y autoridades de la comisión,
// recorrido de los proyectos girados, historia por año y sanciones recientes.
//
// Uso:  node scripts/sync-hcdn.mjs     (o: npm run sync:hcdn)
//
// Las URLs de los CSV se toman de la API (package_show), no se hardcodean, y
// cada recurso se identifica por sus columnas, no por su posición.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { getRecurso } from '../lib/scraper.js';
import {
  decodificarCsv, csvAObjetos, columnasCsv, tieneColumnas,
  calcularIntegrantes, calcularActividad, COMISION_ID,
} from '../lib/hcdn-datos.js';

const API = 'https://datos.hcdn.gob.ar/api/3/action/package_show?id=';
const SALIDA = process.env.COMISION_PATH || path.join(process.cwd(), 'data', 'comision.json');

// Recursos que necesitamos: dataset + columnas esperadas.
const RECURSOS = {
  comisiones: { dataset: 'comisiones', columnas: ['ID', 'NOMBRE', 'GRUPO', 'PERIODO_DE_INICIO', 'PERIODO_DE_FINALIZACION', 'FECHA_DE_INICIO', 'FECHA_DE_FINALIZACION', 'TIPO_DE_COMISION'] },
  autoridades: { dataset: 'comisiones', columnas: ['COMISION_ID', 'CARGO', 'DIPUTADO_NOMBRE', 'BLOQUE', 'DISTRITO'] },
  integrantes: { dataset: 'comisiones', columnas: ['COMISION_ID', 'DIPUTADO_NOMBRE', 'DISTRITO'] },
  porBloque: { dataset: 'comisiones', columnas: ['COMISION_ID', 'DIPUTADO_NOMBRE', 'BLOQUE'] },
  porGenero: { dataset: 'comisiones', columnas: ['COMISION_ID', 'DIPUTADO_NOMBRE', 'DIPUTADO_GENERO'] },
  giros: { dataset: 'giro-a-comisiones', columnas: ['PROYECTO_ID', 'COMISION', 'ORDEN'] },
  proyectos: { dataset: 'proyectos-parlamentarios', columnas: ['PROYECTO_ID', 'TITULO', 'PUBLICACION_FECHA', 'PUBLICACION_ID', 'CAMARA_ORIGEN', 'EXP_DIPUTADOS', 'EXP_SENADO', 'TIPO', 'AUTOR'] },
  dictamenes: { dataset: 'dictamenes', columnas: ['EXPEDIENTE', 'GIRO', 'ORDEN', 'TIPO', 'OBSERVACIONES', 'NUMERO', 'FECHA', 'EXPEDIENTES'] },
  resultados: { dataset: 'resultado-proyectos', columnas: ['EXPEDIENTE_ID', 'CABECERA', 'DICTAMEN_TIPO', 'OD_NUMERO', 'OD_PUBLICACION', 'FECHA', 'RESULTADO'] },
};

async function paquete(id) {
  const json = JSON.parse(await getRecurso(API + encodeURIComponent(id), { timeoutMs: 60000 }));
  if (!json.success || !json.result) throw new Error(`La API no devolvió el dataset ${id}`);
  return json.result;
}

// Baja todos los CSV de un dataset y los indexa por su cabecera.
async function csvsDelDataset(paq) {
  const csvs = (paq.resources || []).filter((r) => String(r.format || '').toUpperCase() === 'CSV' && r.url);
  const salida = [];
  for (const r of csvs) {
    const t0 = Date.now();
    // Los CSV grandes (~30 MB) tardan: timeout generoso.
    const texto = decodificarCsv(await getRecurso(r.url, { timeoutMs: 600000, binario: true, intentos: 3 }));
    console.log(`  ${paq.name} / ${r.name.trim()}: ${(texto.length / 1e6).toFixed(1)} MB en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    salida.push({ nombre: r.name.trim(), columnas: columnasCsv(texto), texto });
  }
  return salida;
}

async function main() {
  const datasets = [...new Set(Object.values(RECURSOS).map((r) => r.dataset))];
  const paquetes = {};
  const csvs = {};
  for (const id of datasets) {
    console.log(`→ Dataset ${id}`);
    paquetes[id] = await paquete(id);
    csvs[id] = await csvsDelDataset(paquetes[id]);
  }

  const datos = {};
  for (const [clave, { dataset, columnas }] of Object.entries(RECURSOS)) {
    const recurso = csvs[dataset].find((c) => tieneColumnas(c.columnas, columnas));
    if (!recurso) {
      throw new Error(`No encontré en "${dataset}" un CSV con columnas [${columnas.join(',')}]. `
        + `Disponibles: ${csvs[dataset].map((c) => `${c.nombre} [${c.columnas.join(',')}]`).join(' | ')}`);
    }
    datos[clave] = csvAObjetos(recurso.texto).filas;
  }

  const comision = datos.comisiones.find((c) => c.ID === COMISION_ID);
  if (!comision) throw new Error(`La comisión ${COMISION_ID} no figura en el dataset de comisiones`);
  const [d, m, a] = comision.FECHA_DE_INICIO.split('/');

  const { integrantes, resumen_integrantes } = calcularIntegrantes(datos);
  const { recorrido, destacados, historia } = calcularActividad(datos);

  const fuenteActualizada = datasets
    .map((id) => String(paquetes[id].metadata_modified || '').slice(0, 10))
    .sort()
    .pop();

  const resultado = {
    generado: new Date().toISOString(),
    fuente: 'datos.hcdn.gob.ar',
    fuente_actualizada: fuenteActualizada,
    comision: { id: COMISION_ID, nombre: comision.NOMBRE, desde: a && m && d ? `${a}-${m}-${d}` : null },
    integrantes,
    resumen_integrantes,
    recorrido,
    destacados,
    historia,
  };

  // Si solo cambiaría "generado", no reescribimos: así el workflow no commitea ruido.
  let anterior = null;
  try { anterior = JSON.parse(fs.readFileSync(SALIDA, 'utf8')); } catch { /* primera vez */ }
  const sinFecha = (o) => JSON.stringify({ ...o, generado: null });
  if (anterior && sinFecha(anterior) === sinFecha(resultado)) {
    console.log(`Sin cambios en los datos. ${SALIDA} queda como estaba.`);
  } else {
    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    fs.writeFileSync(SALIDA, JSON.stringify(resultado, null, 2) + '\n');
    console.log(`Guardado ${SALIDA}`);
  }

  const { ley, otros } = recorrido;
  console.log(`Integrantes: ${resumen_integrantes.total} (${resumen_integrantes.mujeres} F / ${resumen_integrantes.varones} M), `
    + `bloques: ${resumen_integrantes.por_bloque.map((b) => `${b.bloque} ${b.n}`).join(', ')}`);
  console.log(`Recorrido desde ${recorrido.desde}: LEY girados ${ley.girados}, dictamen ${ley.con_dictamen}, `
    + `media sanción ${ley.media_sancion}, sancionados ${ley.sancionados}, mediana ${ley.mediana_dias_dictamen} días | `
    + `otros girados ${otros.girados}, dictamen ${otros.con_dictamen}, aprobados ${otros.aprobados} | total ${recorrido.total_girados}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
