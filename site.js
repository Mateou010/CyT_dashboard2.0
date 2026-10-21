// Utilidades compartidas por las páginas nuevas (portada, comisión y agenda).
(function () {
  const SIGLAS = new Set(['IA', 'CONICET', 'CONAE', 'INTA', 'INTI', 'INVAP', 'ARSAT', 'CNEA', 'SNCTI', 'LESIAF', 'RIGI', 'PE', 'CABA', 'UBA', 'I+D', 'I+D+I', 'TIC', 'STEM', 'BNDG', 'COFECYT', 'SNATIGEP', 'OD']);
  const MENORES = new Set(['a', 'al', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'por', 'para', 'con', 'sin', 'y', 'e', 'o', 'u', 'un', 'una', 'sobre']);
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // "PAGANO, MARCELA MARINA" -> "Marcela Marina Pagano"
  function nombrePersona(raw = '') {
    const [apellido, nombre] = String(raw).split(',').map((s) => s.trim());
    const full = nombre ? `${nombre} ${apellido}` : apellido;
    return titleCase(full);
  }

  function titleCase(text = '') {
    return String(text).toLowerCase().split(/(\s+|-)/).map((w, i) => {
      if (!w.trim() || w === '-') return w;
      if (i > 0 && MENORES.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join('');
  }

  // Sumarios oficiales vienen en mayúsculas: pasarlos a oración sin perder siglas.
  function oracion(text = '') {
    const clean = String(text).trim().replace(/\.$/, '');
    if (clean !== clean.toUpperCase()) return clean;
    let first = true;
    return clean.split(/(\s+)/).map((w) => {
      if (!w.trim()) return w;
      const core = w.replace(/^[("“«]+|[)"”»,.;:]+$/g, '');
      if (SIGLAS.has(core) || /^\(?[A-Z]{2,}\)?[,.]?$/.test(w) && w.startsWith('(')) return w;
      if (/^\d/.test(w)) { first = false; return w; }
      const lower = w.toLowerCase();
      const out = first ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
      first = /[.:]$/.test(w);
      return out;
    }).join('');
  }

  function parseFecha(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return null;
  }

  const fechaCorta = (d) => d ? `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}` : '';
  const fechaLarga = (d) => d ? `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}` : '';
  const medianoche = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diasEntre = (a, b) => Math.round((medianoche(b) - medianoche(a)) / 86400000);

  async function getJson(url) {
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
    return resp.json();
  }

  // Formulario de suscripción (mismo contrato que /api/subscribe: { email }).
  function setupSubscribe(form, msg, idleLabel) {
    if (!form || !msg) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = form.elements.email.value.trim();
      const button = form.querySelector('button[type="submit"]');
      msg.dataset.state = '';
      msg.textContent = 'Guardando tu suscripción...';
      if (button) { button.disabled = true; button.textContent = 'Guardando...'; }
      try {
        const response = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudo completar la suscripción.');
        msg.dataset.state = 'ok';
        msg.textContent = data.message || 'Te enviamos un email para confirmar tu suscripción.';
        form.reset();
      } catch (error) {
        msg.dataset.state = 'error';
        msg.textContent = error.message || 'No se pudo conectar. Probá de nuevo.';
      } finally {
        if (button) { button.disabled = false; button.textContent = idleLabel; }
      }
    });
  }

  window.CyT = { escapeHtml, nombrePersona, titleCase, oracion, parseFecha, fechaCorta, fechaLarga, diasEntre, getJson, setupSubscribe, MESES };
})();
