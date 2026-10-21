// ============================================================
// Datos abiertos de la HCDN (datos.hcdn.gob.ar) — partes puras.
//   - decodificarCsv(buf)   -> texto (detecta UTF-8 vs Latin-1)
//   - parseCsv(texto)       -> filas (soporta comillas, comas y saltos de línea)
//   - csvAObjetos(texto)    -> { columnas, filas: [{COLUMNA: valor}] }
//   - nombreDisplay(nombre) -> "APELLIDO, Nombre" => "Nombre Apellido"
//   - calcularComision(...) -> el JSON de data/comision.json (sin metadatos de red)
// No hace fetch: eso vive en scripts/sync-hcdn.mjs, así esto se testea offline.
// ============================================================

// --- CSV -----------------------------------------------------

// Los CSV de la HCDN vienen casi siempre en UTF-8, pero algunos recursos
// históricos están en Latin-1 (Windows-1252). Si el UTF-8 es inválido, caemos
// a windows-1252, que cubre tildes y ñ.
export function decodificarCsv(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

// Parser CSV RFC 4180 mínimo: campos entre comillas con comas, saltos de línea
// y comillas escapadas (""). Acepta \n y \r\n. Ignora filas totalmente vacías.
export function parseCsv(texto, separador = ',') {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  const n = texto.length;

  for (let i = 0; i < n; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') entreComillas = true;
    else if (c === separador) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    if (fila.length > 1 || fila[0] !== '') filas.push(fila);
  }
  return filas;
}

export function csvAObjetos(texto) {
  const [cabecera = [], ...resto] = parseCsv(texto);
  const columnas = cabecera.map((c) => c.trim().toUpperCase());
  const filas = resto.map((f) => {
    const o = {};
    columnas.forEach((col, i) => { o[col] = (f[i] ?? '').trim(); });
    return o;
  });
  return { columnas, filas };
}

// Lee solo la primera línea (cabecera) sin parsear todo el archivo.
export function columnasCsv(texto) {
  const fin = texto.search(/\r?\n/);
  const primera = fin === -1 ? texto : texto.slice(0, fin);
  return (parseCsv(primera)[0] || []).map((c) => c.trim().toUpperCase());
}

// ¿La cabecera tiene exactamente estas columnas (en cualquier orden)?
export function tieneColumnas(columnas, esperadas) {
  const set = new Set(columnas);
  return esperadas.length === set.size && esperadas.every((c) => set.has(c));
}

// --- Nombres -------------------------------------------------

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'van', 'von']);

// Clave para cruzar nombres entre recursos: los CSV mezclan "YEZA, Martín" y
// "MAYORAZ Nicolás". Sin tildes, sin comas, mayúsculas, espacios simples.
export function claveNombre(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function capitalizarPalabra(palabra, esPrimera) {
  const minus = palabra.toLocaleLowerCase('es');
  if (!esPrimera && MINUSCULAS.has(minus)) return minus;
  // Capitaliza también después de guion o apóstrofo (D'Alessandro, Pérez-Gil).
  return minus.replace(/(^|[-'’])(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase('es'));
}

export function capitalizar(texto) {
  return String(texto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => capitalizarPalabra(p, i === 0))
    .join(' ');
}

// "METRAL ASENSIO, Julieta" -> "Julieta Metral Asensio".
// Sin coma ("MAYORAZ Nicolás"): las palabras iniciales en MAYÚSCULAS son el apellido.
export function nombreDisplay(nombre) {
  const s = String(nombre || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  let apellido;
  let nombres;
  const coma = s.indexOf(',');
  if (coma !== -1) {
    apellido = s.slice(0, coma);
    nombres = s.slice(coma + 1);
  } else {
    const palabras = s.split(' ');
    const esMayus = (p) => p === p.toLocaleUpperCase('es') && /\p{L}/u.test(p);
    let k = 0;
    while (k < palabras.length && esMayus(palabras[k])) k++;
    if (k === 0 || k === palabras.length) return capitalizar(s);
    apellido = palabras.slice(0, k).join(' ');
    nombres = palabras.slice(k).join(' ');
  }
  // Se capitaliza todo junto: así "DE LA TORRE, María" queda "María de la Torre".
  return capitalizar(`${nombres} ${apellido}`);
}

// --- Cálculos ------------------------------------------------

export const COMISION_ID = 'HCDN00185';
export const NOMBRE_ACTUAL = 'CIENCIA, TECNOLOGIA E INNOVACION PRODUCTIVA';
export const NOMBRE_ANTERIOR = 'CIENCIA Y TECNOLOGIA'; // hasta 2014
export const ANIO_DESDE = 2014;

const esLey = (tipo) => /LEY/.test(String(tipo || '').toUpperCase());
const anioDe = (fecha) => {
  const m = String(fecha || '').match(/^(\d{4})-/) || String(fecha || '').match(/\/(\d{4})/);
  return m ? Number(m[1]) : null;
};
// "2016-05-06T00:00:00" | "06/05/2016" -> ms UTC (null si no parsea).
export function fechaMs(fecha) {
  const s = String(fecha || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}
const isoDia = (fecha) => {
  const ms = fechaMs(fecha);
  return ms == null ? '' : new Date(ms).toISOString().slice(0, 10);
};

export function mediana(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(v.length / 2);
  return v.length % 2 ? v[mitad] : Math.round((v[mitad - 1] + v[mitad]) / 2);
}

const ordenarConteo = (a, b) => b.n - a.n || a.bloque.localeCompare(b.bloque, 'es');

export function calcularIntegrantes({ integrantes, porBloque, porGenero, autoridades }, comisionId = COMISION_ID) {
  const deLaComision = (filas) => filas.filter((f) => f.COMISION_ID === comisionId);
  const indice = (filas, campo) => new Map(deLaComision(filas).map((f) => [claveNombre(f.DIPUTADO_NOMBRE), f[campo]]));
  const bloques = indice(porBloque, 'BLOQUE');
  const generos = indice(porGenero, 'DIPUTADO_GENERO');
  const cargos = new Map();
  for (const a of deLaComision(autoridades)) {
    const k = claveNombre(a.DIPUTADO_NOMBRE);
    if (!cargos.has(k)) cargos.set(k, a);
  }

  const lista = deLaComision(integrantes).map((f) => {
    const k = claveNombre(f.DIPUTADO_NOMBRE);
    const aut = cargos.get(k);
    return {
      nombre: f.DIPUTADO_NOMBRE,
      nombre_display: nombreDisplay(f.DIPUTADO_NOMBRE),
      bloque: bloques.get(k) || aut?.BLOQUE || '',
      distrito: f.DISTRITO || aut?.DISTRITO || '',
      genero: generos.get(k) || '',
      cargo: aut?.CARGO || null,
    };
  });

  // Autoridades primero (en el orden del CSV), después alfabético por apellido.
  const ordenCargo = [...cargos.keys()];
  const rango = (p) => {
    const i = ordenCargo.indexOf(claveNombre(p.nombre));
    return i === -1 ? Infinity : i;
  };
  lista.sort((a, b) => rango(a) - rango(b) || claveNombre(a.nombre).localeCompare(claveNombre(b.nombre), 'es'));

  const conteo = new Map();
  for (const p of lista) conteo.set(p.bloque, (conteo.get(p.bloque) || 0) + 1);

  return {
    integrantes: lista,
    resumen_integrantes: {
      total: lista.length,
      mujeres: lista.filter((p) => p.genero === 'F').length,
      varones: lista.filter((p) => p.genero === 'M').length,
      distritos: new Set(lista.map((p) => p.distrito).filter(Boolean)).size,
      por_bloque: [...conteo].map(([bloque, n]) => ({ bloque, n })).sort(ordenarConteo),
    },
  };
}

// giros: [{PROYECTO_ID, COMISION}], proyectos: Map|array de proyectos,
// dictamenes: [{EXPEDIENTE, GIRO, FECHA}], resultados: [{EXPEDIENTE_ID, RESULTADO}]
export function calcularActividad({ giros, proyectos, dictamenes, resultados }) {
  const porId = proyectos instanceof Map ? proyectos : new Map(proyectos.map((p) => [p.PROYECTO_ID, p]));

  const idsActual = new Set();
  const idsHistoricos = new Set();
  for (const g of giros) {
    const com = String(g.COMISION || '').trim().toUpperCase();
    if (com === NOMBRE_ACTUAL) { idsActual.add(g.PROYECTO_ID); idsHistoricos.add(g.PROYECTO_ID); }
    else if (com === NOMBRE_ANTERIOR) idsHistoricos.add(g.PROYECTO_ID);
  }

  // Dictámenes de la comisión (nombre actual) por expediente.
  const fechasDictamen = new Map();
  for (const d of dictamenes) {
    if (!String(d.GIRO || '').toUpperCase().startsWith(NOMBRE_ACTUAL)) continue;
    if (!idsActual.has(d.EXPEDIENTE)) continue;
    if (!fechasDictamen.has(d.EXPEDIENTE)) fechasDictamen.set(d.EXPEDIENTE, []);
    const ms = fechaMs(d.FECHA);
    if (ms != null) fechasDictamen.get(d.EXPEDIENTE).push(ms);
  }

  // Resultados (un expediente puede tener varias filas: nos quedamos con todas).
  const resultadosPorId = new Map();
  for (const r of resultados) {
    const res = String(r.RESULTADO || '').trim().toUpperCase();
    if (!res || !idsHistoricos.has(r.EXPEDIENTE_ID)) continue;
    if (!resultadosPorId.has(r.EXPEDIENTE_ID)) resultadosPorId.set(r.EXPEDIENTE_ID, new Set());
    resultadosPorId.get(r.EXPEDIENTE_ID).add(res);
  }
  const tiene = (id, res) => resultadosPorId.get(id)?.has(res) || false;

  // --- recorrido (nombre actual) ---
  const ley = { girados: 0, con_dictamen: 0, media_sancion: 0, sancionados: 0, mediana_dias_dictamen: null };
  const otros = { girados: 0, con_dictamen: 0, aprobados: 0 };
  const dias = [];
  for (const id of idsActual) {
    const p = porId.get(id);
    if (!p) continue;
    const conDictamen = fechasDictamen.has(id);
    if (esLey(p.TIPO)) {
      ley.girados++;
      if (conDictamen) ley.con_dictamen++;
      if (tiene(id, 'SANCIONADO')) ley.sancionados++;
      if (tiene(id, 'MEDIA SANCION')) ley.media_sancion++;
      const pub = fechaMs(p.PUBLICACION_FECHA);
      const posteriores = (fechasDictamen.get(id) || []).filter((ms) => pub != null && ms >= pub);
      if (posteriores.length) dias.push(Math.round((Math.min(...posteriores) - pub) / 86400000));
    } else {
      otros.girados++;
      if (conDictamen) otros.con_dictamen++;
      if (tiene(id, 'APROBADO')) otros.aprobados++;
    }
  }
  ley.mediana_dias_dictamen = mediana(dias);

  // --- historia (ambos nombres, por año de publicación) ---
  const porAnio = new Map();
  for (const id of idsHistoricos) {
    const p = porId.get(id);
    const anio = p && anioDe(p.PUBLICACION_FECHA);
    if (!anio) continue;
    if (!porAnio.has(anio)) porAnio.set(anio, { anio, ley: 0, otros: 0 });
    porAnio.get(anio)[esLey(p.TIPO) ? 'ley' : 'otros']++;
  }
  const historia = [...porAnio.values()].sort((a, b) => a.anio - b.anio);

  // --- destacados: últimos 5 proyectos de ley con sanción o media sanción ---
  const destacados = [...idsHistoricos]
    .map((id) => porId.get(id))
    .filter((p) => p && esLey(p.TIPO) && (tiene(p.PROYECTO_ID, 'SANCIONADO') || tiene(p.PROYECTO_ID, 'MEDIA SANCION')))
    .sort((a, b) => (fechaMs(b.PUBLICACION_FECHA) ?? 0) - (fechaMs(a.PUBLICACION_FECHA) ?? 0)
      || b.PROYECTO_ID.localeCompare(a.PROYECTO_ID))
    .slice(0, 5)
    .map((p) => ({
      expediente: p.EXP_DIPUTADOS || p.EXP_SENADO,
      anio: anioDe(p.PUBLICACION_FECHA),
      fecha: isoDia(p.PUBLICACION_FECHA),
      titulo: p.TITULO,
      resultado: tiene(p.PROYECTO_ID, 'SANCIONADO') ? 'SANCIONADO' : 'MEDIA SANCION',
    }));

  return {
    recorrido: { desde: ANIO_DESDE, ley, otros, total_girados: ley.girados + otros.girados },
    destacados,
    historia,
  };
}
