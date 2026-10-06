import fs from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse';

const root = process.cwd();
const cytPath = path.join(root, 'cyt_bills_data.json');
const iaPath = path.join(root, 'bills_data.json');
const cytDashboardPath = path.join(root, 'dashboard-cyt.html');
const chatDatasetPath = path.join(root, 'api', 'leyes.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const percent = (count, total) => total ? Math.round((count / total) * 100) : 0;
const sortCounts = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es');
const billSort = (a, b) => {
  const yearDiff = Number(a.año) - Number(b.año);
  if (yearDiff) return yearDiff;
  return Number.parseInt(a.id, 10) - Number.parseInt(b.id, 10) || a.id.localeCompare(b.id);
};

function counts(items, valueOf) {
  const result = new Map();
  for (const item of items) {
    const value = valueOf(item);
    if (!value) continue;
    result.set(value, (result.get(value) || 0) + 1);
  }
  return [...result.entries()].sort(sortCounts);
}

function syncCytStats(data, now) {
  const bills = data.bills.sort(billSort);
  const total = bills.length;
  const years = bills.map((bill) => Number(bill.año)).filter(Number.isFinite);
  const yearMin = Math.min(...years);
  const yearMax = Math.max(...years);

  data.metadata = {
    ...data.metadata,
    generado: now,
    total,
    periodo: yearMin === yearMax ? String(yearMin) : `${yearMin}–${yearMax}`,
    con_autor: bills.filter((bill) => bill.autor_principal && !/desconocido|no disponible/i.test(bill.autor_principal)).length,
    con_bloque: bills.filter((bill) => bill.bloque && !/sin datos/i.test(bill.bloque)).length,
    generated_at: now,
    source: 'manual_update_verified_against_hcdn',
  };
  data.eje_stats = counts(bills, (bill) => bill.eje)
    .map(([eje, cantidad]) => ({ eje, cantidad, porcentaje: percent(cantidad, total) }));
  data.year_stats = counts(bills, (bill) => String(bill.año))
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([year, cantidad]) => ({ año: Number(year), cantidad, porcentaje: percent(cantidad, total) }));
  data.bloque_stats = counts(bills, (bill) => bill.bloque)
    .map(([bloque, cantidad]) => ({ bloque, cantidad, porcentaje: percent(cantidad, total) }));
  data.top_autores = counts(bills, (bill) => bill.autor_principal)
    .slice(0, 10)
    .map(([autor, cantidad]) => ({ autor, cantidad }));
  data.tipo_stats = counts(bills, (bill) => bill.tipo)
    .map(([tipo, cantidad]) => ({ tipo, cantidad, porcentaje: percent(cantidad, total) }));
  data.subtema_stats = counts(bills, (bill) => bill.subtematica)
    .map(([subtema, cantidad]) => ({ subtema, cantidad, porcentaje: percent(cantidad, total) }));

  data.year_tematica_matrix = {};
  for (const bill of bills) {
    const year = String(bill.año);
    data.year_tematica_matrix[year] ||= {};
    data.year_tematica_matrix[year][bill.tematica] = (data.year_tematica_matrix[year][bill.tematica] || 0) + 1;
  }
}

function syncIaStats(data, cytBills, now) {
  const bills = data.bills.sort(billSort);
  const cytById = new Map(cytBills.map((bill) => [bill.id, bill]));
  for (const bill of bills) {
    const cytBill = cytById.get(bill.id);
    if (!cytBill) continue;
    bill.grupo = cytBill.tematica;
    bill.subtematica = cytBill.subtematica;
  }
  data.metadata = { ...data.metadata, generado: now, total: bills.length };

  data.bloque_stats = counts(bills, (bill) => bill.bloque).map(([bloque, proyectos]) => {
    const delBloque = bills.filter((bill) => bill.bloque === bloque);
    const promedio = delBloque.reduce((sum, bill) => sum + Number(bill.total_autores || bill.autores?.length || 1), 0) / proyectos;
    return { bloque, proyectos, promedio_autores: Number(promedio.toFixed(1)) };
  });
  data.top_destinatarios = counts(
    bills.flatMap((bill) => bill.destinatarios || []),
    (destinatario) => destinatario,
  ).map(([destinatario, total]) => ({ destinatario, total }));
  data.top_topics = counts(bills, (bill) => bill.tema)
    .map(([tema, total]) => ({ tema, total }));
}

async function syncChatDataset(cyt, ia, now) {
  const existing = readJson(chatDatasetPath);
  const previousById = new Map((existing.proyectos || []).map((project) => [project.id, project]));
  const cytById = new Map(cyt.bills.map((bill) => [bill.id, bill]));
  const iaById = new Map(ia.bills.map((bill) => [bill.id, bill]));
  const ids = [...new Set([...cytById.keys(), ...iaById.keys()])]
    .sort((a, b) => billSort(
      cytById.get(a) || iaById.get(a),
      cytById.get(b) || iaById.get(b),
    ));

  const proyectos = [];
  for (const id of ids) {
    const cytBill = cytById.get(id);
    const iaBill = iaById.get(id);
    const source = cytBill || iaBill;
    const pdfPath = source.pdf_path?.replace(/^\.\//, '') || iaBill?.pdf_path?.replace(/^\.\//, '');
    let textoCompleto = previousById.get(id)?.texto_completo || '';
    if (pdfPath && fs.existsSync(path.join(root, pdfPath))) {
      try {
        textoCompleto = (await pdfParse(fs.readFileSync(path.join(root, pdfPath)))).text.trim();
      } catch (error) {
        console.warn(`No se pudo extraer texto de ${id}: ${error.message}`);
      }
    }
    proyectos.push({
      id,
      titulo: source.titulo,
      autor_principal: source.autor_principal,
      bloque: source.bloque,
      tipo: iaBill?.tipo || source.tipo,
      dashboard: iaBill?.dashboard || 'CYT',
      anio: source.año,
      resumen: source.resumen,
      grupo: cytBill?.tematica || iaBill?.grupo || iaBill?.tema || '',
      subtematica: cytBill?.subtematica || iaBill?.subtematica || iaBill?.tipo || '',
      texto_completo: textoCompleto,
      fuente_pdf: pdfPath || '',
    });
  }

  const output = {
    metadata: {
      generado: now,
      total_proyectos: proyectos.length,
      proyectos_con_texto_completo: proyectos.filter((project) => project.texto_completo).length,
      fuente: 'cyt_bills_data.json + bills_data.json + PDFs oficiales locales',
    },
    proyectos,
  };
  fs.writeFileSync(chatDatasetPath, `${JSON.stringify(output, null, 2)}\n`);
}

function syncCytEmbeddedData(data) {
  const html = fs.readFileSync(cytDashboardPath, 'utf8');
  const match = html.match(/const CYT_DATA = (\[[\s\S]*?\]);\n\nconst COLORS/);
  if (!match) throw new Error('No se encontró CYT_DATA en dashboard-cyt.html');

  const previous = JSON.parse(match[1]);
  const previousGroups = new Map(previous.map((group, index) => [group.name, { group, index }]));
  const previousProjects = new Map(
    previous.flatMap((group) => group.subs.flatMap((sub) => sub.projects)).map((project) => [project.exp, project]),
  );
  const refreshDescription = new Set(['3032-D-2026', '3060-D-2026']);

  const grouped = new Map();
  for (const bill of data.bills) {
    if (!grouped.has(bill.tematica)) grouped.set(bill.tematica, new Map());
    const subs = grouped.get(bill.tematica);
    if (!subs.has(bill.subtematica)) subs.set(bill.subtematica, []);
    const previousProject = previousProjects.get(bill.id);
    subs.get(bill.subtematica).push({
      exp: bill.id,
      desc: previousProject && !refreshDescription.has(bill.id)
        ? previousProject.desc
        : bill.titulo.toUpperCase(),
      autor: bill.autor_principal,
      bloque: bill.bloque,
      año: bill.año,
      pdf: bill.pdf_path,
    });
  }

  const groupNames = [...grouped.keys()].sort((a, b) => {
    const ai = previousGroups.get(a)?.index ?? Number.MAX_SAFE_INTEGER;
    const bi = previousGroups.get(b)?.index ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.localeCompare(b, 'es');
  });
  const embedded = groupNames.map((name) => {
    const subs = grouped.get(name);
    const previousSubOrder = new Map(
      (previousGroups.get(name)?.group.subs || []).map((sub, index) => [sub.name, index]),
    );
    const subNames = [...subs.keys()].sort((a, b) => {
      const ai = previousSubOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
      const bi = previousSubOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi || a.localeCompare(b, 'es');
    });
    const embeddedSubs = subNames.map((subName) => ({
      name: subName,
      count: subs.get(subName).length,
      projects: subs.get(subName).sort((a, b) => billSort({ id: a.exp, año: a.año }, { id: b.exp, año: b.año })),
    }));
    return {
      name,
      count: embeddedSubs.reduce((sum, sub) => sum + sub.count, 0),
      subs: embeddedSubs,
    };
  });

  const replacement = `const CYT_DATA = ${JSON.stringify(embedded)};\n\nconst COLORS`;
  fs.writeFileSync(cytDashboardPath, html.replace(match[0], replacement));
}

const now = new Date().toISOString();
const cyt = readJson(cytPath);
const ia = readJson(iaPath);
syncCytStats(cyt, now);
syncIaStats(ia, cyt.bills, now);
fs.writeFileSync(cytPath, `${JSON.stringify(cyt, null, 2)}\n`);
fs.writeFileSync(iaPath, `${JSON.stringify(ia, null, 2)}\n`);
syncCytEmbeddedData(cyt);
await syncChatDataset(cyt, ia, now);

console.log(`Datos sincronizados: CyT ${cyt.bills.length}, IA ${ia.bills.length}, chat ${new Set([...cyt.bills, ...ia.bills].map((bill) => bill.id)).size}.`);
