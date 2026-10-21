/* Alternate CSV classifications describe the same spending, never additive totals. */
(() => {
  'use strict';
  const base = 'data/ejecucion-organismos-2026/';
  const fields = ['Inicial', 'Vigente', 'Comprometido', 'Devengado', 'Pagado'];
  const labels = { Inicial: 'Crédito inicial', Vigente: 'Crédito vigente', Comprometido: 'Comprometido', Devengado: 'Devengado', Pagado: 'Pagado' };
  const names = {
    'quien-gasta.csv': ['CONICET', 'Investigación científica y técnica'],
    'quien-gasta (1).csv': ['BNDG', 'Banco Nacional de Datos Genéticos'],
    'quien-gasta (2).csv': ['CONAE', 'Actividades espaciales'],
    'quien-gasta (3).csv': ['Agencia I+D+i', 'Promoción de la investigación y la innovación'],
    'quien-gasta (4).csv': ['Ciberseguridad', 'Centro Nacional de Ciberseguridad'],
    'gastos-x-organismos.csv': ['Secretaría de Innovación, CyT', 'Innovación, ciencia y tecnología']
  };
  const types = [
    { prefix: 'para-que', label: 'Programas', key: 'Programa', leaf: 'Actividad/Obra', context: ['Subprograma', 'Proyecto'] },
    { prefix: 'en-que', label: 'Objeto del gasto', key: 'Inciso', leaf: 'Principal', context: ['Parcial', 'Subparcial'] },
    { prefix: 'a-que', label: 'Finalidad', key: 'Finalidad', leaf: 'Funcion', context: [] }
  ];
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  // Integer hundredths preserve the exact decimal amounts in the exports.
  const hundredths = value => {
    const [integer, fraction = ''] = value.split('.');
    const sign = integer.startsWith('-') ? -1 : 1;
    return Number(integer) * 100 + sign * Number(fraction.padEnd(2, '0'));
  };
  const rawAmount = value => hundredths(value.replaceAll('.', '').replace(',', '.'));
  const amount = value => (value / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const percent = value => value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  const ratio = (numerator, denominator) => denominator ? numerator / denominator * 100 : null;
  const track = value => `<span class="track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, value || 0))}%"></i></span>`;
  const href = filename => base + encodeURIComponent(filename);
  let data, current, selectedFile, available;

  function selectOrganization(organization, move = false) {
    current = organization;
    const short = names[current.source][0];
    document.querySelectorAll('.organization').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.source === current.source)));
    $('detail-title').textContent = short;
    $('official-name').textContent = current.name;
    const link = $('summary-download');
    link.href = href(current.source);
    link.download = current.source;
    link.hidden = false;
    const v = Object.fromEntries(fields.map(key => [key, hundredths(current.values[key])]));
    $('agency-metrics').innerHTML = fields.map(key => `<dl class="metric ${key === 'Devengado' ? 'featured' : ''}"><dt>${labels[key]}</dt><dd>${amount(v[key])}</dd></dl>`).join('');
    $('agency-ratios').innerHTML = [[v.Devengado, v.Vigente, 'del crédito vigente devengado'], [v.Pagado, v.Devengado, 'del devengado pagado']].map(([n, d, label]) => `<span><strong>${d ? percent(ratio(n, d)) : '—'}</strong> ${label}</span>`).join('');
    available = data.files.filter(file => !file.duplicateOf && file.organism === current.name && types.some(type => file.file.startsWith(type.prefix)))
      .sort((a, b) => types.findIndex(type => a.file.startsWith(type.prefix)) - types.findIndex(type => b.file.startsWith(type.prefix)));
    selectedFile = available[0];
    $('dimensions').innerHTML = available.map((file, index) => `<button type="button" data-file="${index}" aria-pressed="${index === 0}">${types.find(type => file.file.startsWith(type.prefix)).label}</button>`).join('');
    renderBreakdown();
    if (move) {
      $('detail-title').tabIndex = -1;
      $('detail-title').focus({ preventScroll: true });
      $('detalle').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  }

  function renderBreakdown() {
    const measure = $('measure').value;
    if (!selectedFile) {
      $('breakdown-note').textContent = 'Los archivos aportados contienen el resumen de este organismo.';
      $('breakdown').replaceChildren();
      return;
    }
    const type = types.find(item => selectedFile.file.startsWith(item.prefix));
    const groups = new Map();
    selectedFile.rows.forEach(row => {
      const key = row[type.key];
      if (!groups.has(key)) groups.set(key, { name: key, rows: [], total: 0 });
      groups.get(key).rows.push(row);
      groups.get(key).total += rawAmount(row[measure]);
    });
    const total = [...groups.values()].reduce((sum, group) => sum + group.total, 0);
    const assignment = selectedFile.assignment === 'inferred_from_five_totals' ? ' Organismo asociado por coincidencia de sus cinco totales.' : '';
    $('breakdown-note').innerHTML = `${labels[measure]} por ${type.label.toLowerCase()}. Abrí una fila para consultar las partidas. <a download href="${href(selectedFile.file)}">CSV original ↓</a>${assignment}`;
    $('breakdown').innerHTML = [...groups.values()].sort((a, b) => b.total - a.total).map(group => {
      const share = ratio(group.total, total);
      return `<details class="group"><summary><span class="group-title">${escape(group.name)}</span>${track(share)}<span class="group-total">${amount(group.total)}<small>${share === null ? 'Sin importe en esta etapa' : percent(share) + ' del desglose'}</small></span></summary><div class="group-body">${group.rows.map(row => `<article class="line-item"><h4>${escape(row[type.leaf])}</h4>${type.context.map(key => `<p>${escape(key)}: ${escape(row[key])}</p>`).join('')}<dl class="line-metrics">${fields.map(key => `<div><dt>${labels[key]}</dt><dd>${amount(rawAmount(row[key]))}</dd></div>`).join('')}</dl></article>`).join('')}</div></details>`;
    }).join('');
  }

  async function start() {
    const embedded = document.getElementById('organism-budget-data');
    if (embedded) {
      data = JSON.parse(embedded.textContent);
    } else {
      const response = await fetch(base + 'organismos.json');
      if (!response.ok) throw new Error(`Budget data HTTP ${response.status}`);
      data = await response.json();
    }
    const organizations = [...data.organizations].sort((a, b) => hundredths(b.values.Vigente) - hundredths(a.values.Vigente));
    $('organization-list').innerHTML = organizations.map(organization => {
      const [short, subtitle] = names[organization.source];
      const rate = ratio(hundredths(organization.values.Devengado), hundredths(organization.values.Vigente));
      return `<button type="button" class="organization" data-source="${escape(organization.source)}" aria-pressed="false" aria-controls="detalle" aria-label="Ver detalle de ${escape(organization.name)}"><span class="org-name"><strong>${short}</strong><small>${subtitle}</small></span><span class="org-number"><small>Crédito vigente</small>${amount(hundredths(organization.values.Vigente))}</span><span class="org-number"><small>Devengado</small>${amount(hundredths(organization.values.Devengado))}</span><span class="org-rate">${track(rate)}<span>${rate === null ? '—' : percent(rate)}</span></span></button>`;
    }).join('');
    $('organization-list').addEventListener('click', event => {
      const button = event.target.closest('[data-source]');
      if (button) selectOrganization(organizations.find(organization => organization.source === button.dataset.source), true);
    });
    $('dimensions').addEventListener('click', event => {
      const button = event.target.closest('[data-file]');
      if (!button) return;
      selectedFile = available[Number(button.dataset.file)];
      $('dimensions').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      renderBreakdown();
    });
    $('measure').addEventListener('change', renderBreakdown);
    $('source-list').innerHTML = data.files.map(file => `<div class="source-row"><a download href="${href(file.file)}">${escape(file.file)} ↓</a><span>${file.duplicateOf ? 'Duplicado de ' + escape(file.duplicateOf) : escape(file.organism || 'Sin asociación') + (file.assignment === 'inferred_from_five_totals' ? ' · asociación por totales' : '')}</span></div>`).join('');
    selectOrganization(organizations[0]);
  }
  start().catch(error => {
    console.error('Error al cargar ejecución 2026:', error);
    $('organization-list').innerHTML = '<p role="alert">No se pudo cargar la base. Recargá la página o <a href="data/ejecucion-organismos-2026/organismos.json">descargá el archivo de datos</a>.</p>';
  });
})();
