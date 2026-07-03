// Utilidades puras del seguimiento (sin red ni I/O) — testeables de forma aislada.

// Parsea una fecha "DD/MM/YYYY" (formato del listado de Diputados) a Date.
// Devuelve null si el formato es inválido o la fecha no existe (ej. 31/02/2024).
export function parseFechaAR(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || '').trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const dia = Number(dd), mes = Number(mm), anio = Number(yyyy);
  const d = new Date(anio, mes - 1, dia);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d;
}

// Ordena una copia de `items` por fecha descendente (más nuevos primero).
// Los items sin fecha válida quedan al final. Orden estable ante empates.
export function ordenarPorFechaDesc(items) {
  return items
    .map((it, i) => ({ it, i, t: parseFechaAR(it.fecha)?.getTime() ?? null }))
    .sort((a, b) => {
      if (a.t === b.t) return a.i - b.i;
      if (a.t === null) return 1;
      if (b.t === null) return -1;
      return b.t - a.t;
    })
    .map((x) => x.it);
}

// Selecciona la ventana de proyectos a revisar. Con cantidadRecientes > 0
// devuelve los N MÁS NUEVOS (ordenados por fecha), no las primeras N filas del
// scrape. Con 0/undefined devuelve todo el listado sin reordenar.
export function seleccionarVentana(listado, cantidadRecientes) {
  if (!cantidadRecientes || cantidadRecientes <= 0) return listado;
  return ordenarPorFechaDesc(listado).slice(0, cantidadRecientes);
}

// ¿El nuevo hash de trámite representa un cambio no visto antes?
export function tramiteCambio(nuevoHash, guardado) {
  if (!guardado) return false;
  return nuevoHash !== guardado.tramite_hash && !(guardado.updates || []).includes(nuevoHash);
}
