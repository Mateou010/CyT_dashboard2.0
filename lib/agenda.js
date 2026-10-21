// ============================================================
// Agenda de la Comisión de Ciencia y Tecnología (Diputados).
// Parseo puro del HTML (testeable con fixtures) + fetch de las 3 páginas:
//   - reuniones/            -> reuniones pasadas ("REUNIONES DEL DIA dd/mm/aaaa")
//   - reuniones/videos.html -> videos por fecha (abrirVideo('...'))
//   - /comisiones/agenda/   -> agenda general; nos quedamos con las de CyT
// También arma el aviso de "citación" para los suscriptores.
// ============================================================
import * as cheerio from 'cheerio';
import { getHtml } from './scraper.js';
import { capitalizar } from './hcdn-datos.js';

export const BASE_HCDN = 'https://www.hcdn.gob.ar';
export const REUNIONES_URL = `${BASE_HCDN}/comisiones/permanentes/ccytecnologia/reuniones/`;
export const VIDEOS_URL = `${REUNIONES_URL}videos.html`;
export const AGENDA_URL = `${BASE_HCDN}/comisiones/agenda/`;
export const NOMBRE_COMISION = 'CIENCIA, TECNOLOGIA E INNOVACION PRODUCTIVA';
const SLUG_COMISION = 'ccytecnologia';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const limpiar = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
// Nombre de comisión comparable: en la agenda vienen con coma final ("DEFENSA NACIONAL, ").
export const normalizarComision = (s) => sinTildes(limpiar(s)).replace(/[,\s]+$/, '').toUpperCase();

// --- Fechas --------------------------------------------------

// "30/06/2026" -> "2026-06-30"
export function fechaDdMmAaaa(texto) {
  const m = String(texto || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

// "miércoles 21 de octubre del 2026" -> "2026-10-21"
export function fechaEnPalabras(texto) {
  const m = sinTildes(limpiar(texto)).toLowerCase().match(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de|del)\s+(\d{4})/);
  if (!m) return fechaDdMmAaaa(texto);
  const mes = MESES.indexOf(m[2]) + 1;
  return mes ? `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

// "2026-10-27" -> "martes 27 de octubre"
export function fechaLarga(iso) {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  if (!a || !m || !d) return String(iso || '');
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia} ${d} de ${MESES[m - 1]}`;
}

// Fecha de hoy en Argentina (los workflows corren en UTC).
export function hoyArgentina(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ahora);
}

const hora = (s) => {
  const m = String(s || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : limpiar(s);
};

// --- Clasificación -------------------------------------------

// Separa la sala de los agregados "- Informativa", "-SUSPENDIDA", etc.
export function limpiarSala(texto) {
  let s = limpiar(texto);
  const informativa = /informativa/i.test(s);
  const suspendida = /suspendid/i.test(s);
  s = s
    .replace(/[\s.\-–]*(reuni[oó]n\s+)?informativa\.?/gi, '')
    .replace(/[\s.\-–]*suspendid[ao]\.?/gi, '')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/[\s.\-–]+$/, '')
    .trim();
  return { sala: s, informativa, suspendida };
}

export function clasificar({ rotulo = '', comisiones = [], conjuntaExplicita = false, informativa = false, suspendida = false }) {
  const r = sinTildes(rotulo).toUpperCase();
  const tipos = [];
  if (conjuntaExplicita || comisiones.length > 1) tipos.push('conjunta');
  if (informativa || /INFORMATIVA/.test(r)) tipos.push('informativa');
  if (/INVITAD/.test(r)) tipos.push('invitados');
  if (/CONSTITUTIVA/.test(r)) tipos.push('constitutiva');
  if (/EMPLAZAMIENTO/.test(r)) tipos.push('emplazamiento');
  if (/TEMAS VARIOS/.test(r)) tipos.push('temas-varios');
  if (suspendida || /SUSPENDID/.test(r)) tipos.push('suspendida');
  return tipos;
}

// --- Parseo de una fila de reunión ---------------------------

// Texto con <br> convertidos en saltos de línea (para conservar listas del temario).
function textoConSaltos($, el) {
  const c = $(el).clone();
  c.find('br').replaceWith('\n');
  return c.text().split('\n').map(limpiar).filter(Boolean).join('\n');
}

function parsearFila($, tr, fecha) {
  const celdas = $(tr).children('td');
  if (celdas.length < 2) return null;
  const izq = celdas.eq(0);
  const der = celdas.eq(1);

  // Celda izquierda: <strong>hora</strong><br/>sala<br><span class='leyenda'>…</span>
  const partesIzq = (izq.html() || '').split(/<br\s*\/?>/i).map((h) => limpiar(cheerio.load(`<div>${h}</div>`)('div').text()));
  const horaTxt = limpiar(izq.find('strong').first().text());
  const leyenda = limpiar(izq.find('.leyenda').text());
  const { sala, informativa, suspendida } = limpiarSala(partesIzq[1] || '');

  // Comisiones: links a /comisiones/... con <strong> (no los PDF de la citación).
  const links = der.find('a').filter((_, a) => !/\.pdf(\?|$)/i.test($(a).attr('href') || '') && $(a).find('strong').length);
  const comisiones = links.map((_, a) => ({
    nombre: normalizarComision($(a).text()),
    href: $(a).attr('href') || '',
  })).get();
  const esCyT = (c) => c.nombre === NOMBRE_COMISION || c.href.replace(/\/+$/, '').endsWith(`/${SLUG_COMISION}`);

  // Rótulo ("INVITADOS.", "TEMAS VARIOS.") = <strong> suelto en la celda derecha.
  const strongsSueltos = der.children('strong').map((_, s) => limpiar($(s).text())).get();
  const conjuntaExplicita = [...strongsSueltos, limpiar(izq.text())].some((t) => /REUNI[ÓO]N CONJUNTA/i.test(t));
  const rotulo = strongsSueltos.find((t) => t && !/REUNI[ÓO]N CONJUNTA/i.test(t)) || '';

  // Temario: lo que queda al sacar links, rótulos, títulos y comentarios.
  const cuerpo = der.clone();
  cuerpo.contents().filter((_, n) => n.type === 'comment').remove();
  cuerpo.find('a, h5, script').remove();
  cuerpo.children('strong').remove();
  const temario = textoConSaltos($, cuerpo);

  const pdfs = der.find('a').filter((_, a) => /\.pdf(\?|$)/i.test($(a).attr('href') || ''));
  const citacion = pdfs.filter((_, a) => /citaci/i.test($(a).text())).first();
  const citacion_url = (citacion.length ? citacion : pdfs.first()).attr('href') || null;
  const ampliaciones = pdfs.filter((_, a) => /ampli/i.test($(a).text())).map((_, a) => $(a).attr('href')).get();

  const idEnPdf = (citacion_url || '').match(/\/reuniones\/(\d+)\//);
  const idEnComentario = (der.html() || '').match(/reun=(\d+)/);
  const reunion_id = idEnPdf ? idEnPdf[1] : (idEnComentario ? idEnComentario[1] : null);

  const suspendidaFinal = suspendida || /suspendid/i.test(leyenda);
  return {
    esCyT: comisiones.some(esCyT),
    reunion: {
      fecha,
      hora: hora(horaTxt),
      sala: sala || null,
      tipos: clasificar({
        rotulo, comisiones, conjuntaExplicita,
        informativa: informativa || /informativa/i.test(leyenda),
        suspendida: suspendidaFinal,
      }),
      conjunta_con: comisiones.filter((c) => !esCyT(c)).map((c) => capitalizar(c.nombre)),
      rotulo,
      temario,
      citacion_url,
      ampliaciones,
      video_url: null,
      suspendida: suspendidaFinal,
      reunion_id,
    },
  };
}

// Recorre la(s) tabla(s): las filas con <th> son encabezados de día.
function parsearTabla($, tabla, leerFecha) {
  const salida = [];
  let fecha = null;
  $(tabla).find('tr').each((_, tr) => {
    const th = $(tr).children('th');
    if (th.length) { fecha = leerFecha(th.text()); return; }
    if (!fecha) return;
    const fila = parsearFila($, tr, fecha);
    if (fila) salida.push(fila);
  });
  return salida;
}

// Página de reuniones de la comisión (todas son de CyT).
export function parsearReuniones(html) {
  const $ = cheerio.load(html);
  const tabla = $('table').filter((_, t) => /REUNIONES DEL DIA/i.test($(t).find('th').first().text()));
  return parsearTabla($, tabla, fechaDdMmAaaa).map((f) => f.reunion);
}

// Agenda general de comisiones: solo las reuniones donde participa CyT.
export function parsearAgenda(html) {
  const $ = cheerio.load(html);
  let tabla = $('table#agendaComisiones');
  if (!tabla.length) tabla = $('table').filter((_, t) => $(t).find('th').length > 0);
  return parsearTabla($, tabla, fechaEnPalabras).filter((f) => f.esCyT).map((f) => f.reunion);
}

// videos.html: { 'aaaa-mm-dd': [url, ...] }
export function parsearVideos(html) {
  const $ = cheerio.load(html);
  const porFecha = {};
  $('a[href*="abrirVideo"]').each((_, a) => {
    const url = ($(a).attr('href').match(/abrirVideo\(\s*['"]([^'"]+)['"]/) || [])[1];
    const fecha = fechaDdMmAaaa($(a).find('strong').first().text() || $(a).text());
    if (!url || !fecha || !/^https:\/\/videos\.hcdn\.gob\.ar\//.test(url)) return;
    (porFecha[fecha] ||= []).push(url);
  });
  return porFecha;
}

// Campo "Reuniones:" del encabezado de la comisión ("Martes 15.00hs" -> "Martes 15:00").
export function parsearDiaHabitual(html) {
  const $ = cheerio.load(html);
  const p = $('p').filter((_, el) => /^Reuniones:/i.test(limpiar($(el).find('label').first().text()))).first();
  if (!p.length) return null;
  const texto = limpiar(p.text().replace(/^\s*Reuniones:\s*/i, ''));
  if (!texto) return null;
  const m = texto.match(/^(\p{L}+)\s+(\d{1,2})[.:](\d{2})/u);
  return m ? `${capitalizar(m[1])} ${m[2].padStart(2, '0')}:${m[3]}` : texto;
}

// Asigna video por fecha. Si hay varias reuniones el mismo día, reparte en orden.
export function asignarVideos(reuniones, videosPorFecha) {
  const usados = {};
  return reuniones.map((r) => {
    const lista = videosPorFecha[r.fecha] || [];
    const i = usados[r.fecha] || 0;
    usados[r.fecha] = i + 1;
    return { ...r, video_url: lista[i] || null };
  });
}

// --- Próximas reuniones y avisos ------------------------------

const ordenar = (a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora);

export function proximasDesde(entradas, hoy) {
  const futuras = entradas.filter((r) => r.fecha >= hoy).sort(ordenar);
  const proxima = futuras.find((r) => !r.suspendida) || futuras[0] || null;
  return { proxima, proximas: futuras };
}

// Clave de "ya avisada": id de reunión + fecha (si la reprograman, es otro aviso).
export const claveCitacion = (r) => `${r.reunion_id || 's/id'}|${r.fecha}|${r.hora}`;

export function citacionesPendientes(proximas, avisadas = []) {
  const vistas = new Set(avisadas.map((a) => a.clave));
  return proximas.filter((r) => !r.suspendida && !vistas.has(claveCitacion(r)));
}

export function asuntoCitacion(r) {
  return `Citación: la comisión se reúne el ${fechaLarga(r.fecha)} a las ${r.hora}`;
}

// --- Red -----------------------------------------------------

export async function obtenerAgenda({ hoy = hoyArgentina() } = {}) {
  const htmlReuniones = await getHtml(REUNIONES_URL);
  const htmlAgenda = await getHtml(AGENDA_URL);
  let videos = null;
  try {
    videos = parsearVideos(await getHtml(VIDEOS_URL));
  } catch (e) {
    console.warn('No pude leer la página de videos:', e.message);
  }
  const reuniones = parsearReuniones(htmlReuniones);
  const agenda = parsearAgenda(htmlAgenda);
  return {
    dia_habitual: parsearDiaHabitual(htmlReuniones),
    reuniones: videos ? asignarVideos(reuniones, videos) : reuniones,
    videosOk: Boolean(videos),
    ...proximasDesde(agenda, hoy),
  };
}
