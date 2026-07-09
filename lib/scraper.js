// ============================================================
// Scraper de la Comisión de Ciencia y Tecnología (Diputados).
//   1) listarProyectosLey()  -> lee el listado y devuelve SOLO los de tipo LEY
//   2) getDetalle(exp)       -> sumario, firmantes, giro, link al PDF, trámite
//   3) getPdfUrl(link)       -> URL REST directa del PDF
//   4) descargarPdf(url)     -> baja el PDF como Buffer
// No necesita navegador: las páginas vienen renderizadas en el HTML.
// ============================================================
import * as cheerio from 'cheerio';

const BASE = 'https://www.diputados.gov.ar/comisiones/permanentes/ccytecnologia';
const LISTADO_URL = `${BASE}/listado-proyectos.html`;
const UA = 'Mozilla/5.0 (compatible; SeguimientoProyectosBot/1.0)';

// Allowlist de hosts: solo se hace fetch a Diputados / HCDN. Defiende de SSRF si
// alguna vez el HTML de origen trajera un href a otro dominio.
const HOSTS_PERMITIDOS = ['diputados.gov.ar', 'hcdn.gob.ar'];
export function hostPermitido(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return HOSTS_PERMITIDOS.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function esErrorTransitorio(error) {
  const code = error?.cause?.code || error?.code || '';
  return ['EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)
    || /HTTP (429|5\d\d)/.test(error?.message || '');
}

async function getHtml(url, intentos = 4) {
  if (!hostPermitido(url)) throw new Error(`Host no permitido: ${url}`);
  let ultimoError;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!hostPermitido(r.url)) throw new Error(`Redirect a host no permitido: ${r.url}`);
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
      return await r.text();
    } catch (error) {
      ultimoError = error;
      if (!esErrorTransitorio(error) || intento === intentos) break;
      const espera = 1200 * intento;
      console.warn(`Consulta temporalmente fallida (${error?.cause?.code || error.message}). Reintento ${intento + 1}/${intentos} en ${espera}ms...`);
      await sleep(espera);
    }
  }
  throw ultimoError;
}

export async function listarProyectosLey() {
  const $ = cheerio.load(await getHtml(LISTADO_URL));
  const filas = [];
  $('table tr').each((_, tr) => {
    const celdas = $(tr).find('td');
    if (celdas.length < 4) return;
    const link = $(tr).find('a[href*="proyecto.html?exp="]').attr('href');
    if (!link) return;
    const expediente = (link.match(/exp=([^&"]+)/) || [])[1];
    if (!expediente) return;
    const txt = celdas.map((__, td) => $(td).text().trim()).get();
    const tipo = (txt.find(t => /^(LEY|RESOLUCION|DECLARACION|MENSAJE)/i.test(t)) || '').toUpperCase();
    const fecha = txt.find(t => /^\d{2}\/\d{2}\/\d{4}$/.test(t)) || '';
    const sumario = txt.reduce((a, b) => (b.length > a.length ? b : a), '');
    filas.push({ expediente, tipo, sumario, fecha });
  });
  // Solo LEY (descarta RESOLUCION y DECLARACION). Para excluir también los
  // "MENSAJE ... Y PROYECTO DE LEY" del Ejecutivo, usá: f.tipo === 'LEY'.
  return filas.filter(f => /LEY/.test(f.tipo) && !/RESOLUCION|DECLARACION/.test(f.tipo));
}

export async function getDetalle(expediente) {
  const url = `${BASE}/proyecto.html?exp=${encodeURIComponent(expediente)}`;
  const $ = cheerio.load(await getHtml(url));
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  const sumario = (bodyText.match(/Sumario:\s*([^]*?)(?=Ver documento|Firmantes|$)/i) || [''])[1]?.trim() || '';

  const autores = [];
  $('table').each((_, t) => {
    const h = $(t).find('th').map((__, th) => $(th).text().trim().toLowerCase()).get();
    if (h.some(x => x.includes('firmante')) && h.some(x => x.includes('bloque'))) {
      $(t).find('tr').each((__, tr) => {
        const c = $(tr).find('td').map((___, td) => $(td).text().trim()).get();
        if (c.length >= 3) autores.push({ nombre: c[0], distrito: c[1], bloque: c[2] });
      });
    }
  });

  const giro = [];
  $('table').each((_, t) => {
    const h = $(t).find('th').map((__, th) => $(th).text().trim().toLowerCase()).get();
    if (h.some(x => x.includes('comisi')) && !h.some(x => x.includes('bloque'))) {
      $(t).find('td').each((__, td) => {
        const s = $(td).text().replace(/\s+/g, ' ').trim();
        if (s) giro.push(s);
      });
    }
  });

  const adjuntoLink = $('a[href*="detalle_tp_adjunto"]').attr('href') || '';
  const tramite = (bodyText.match(/Tr[aá]mite\s+(?:Parlamentario)?[^]*?(?=SEGUINOS EN|$)/i) || [''])[0]
    .replace(/Firmantes[^]*?(?=Giro|$)/i, '').trim().slice(0, 4000);

  return { expediente, url, sumario, autores, giro, adjuntoLink, tramite };
}

export async function getPdfUrl(adjuntoLink) {
  if (!adjuntoLink) return '';
  const html = await getHtml(adjuntoLink);
  const $ = cheerio.load(html);
  return $('a[href*="rest.hcdn.gob.ar"]').attr('href')
    || (html.match(/https?:\/\/rest\.hcdn\.gob\.ar\/[^\s"'<]+/) || [''])[0];
}

export async function descargarPdf(pdfUrl) {
  if (!hostPermitido(pdfUrl)) throw new Error(`Host no permitido: ${pdfUrl}`);
  let ultimoError;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(pdfUrl, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!hostPermitido(r.url)) throw new Error(`Redirect a host no permitido: ${r.url}`);
      if (!r.ok) throw new Error(`No se pudo bajar el PDF (HTTP ${r.status})`);
      return Buffer.from(await r.arrayBuffer());
    } catch (error) {
      ultimoError = error;
      if (!esErrorTransitorio(error) || intento === 3) break;
      await sleep(1000 * intento);
    }
  }
  throw ultimoError;
}
