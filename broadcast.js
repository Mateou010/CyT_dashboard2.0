// ============================================================
// BROADCAST — manda un mensaje libre a TODOS los suscriptores confirmados.
// Escribís vos el título y el texto; no depende del scraper.
//
// Uso:
//   node broadcast.js "Título del aviso" "Texto del mensaje..."
//
// Ejemplo:
//   node broadcast.js "El proyecto 3060 fue dictaminado" \
//     "El proyecto 3060-D-2026 obtuvo dictamen y pasa a tratarse en la comisión de Legislación Penal."
//
// El texto puede tener varias líneas (los saltos se respetan). Se agrega
// automáticamente el pie con el link para darse de baja.
// ============================================================
import { listarConfirmados } from './lib/subscribers.js';
import { enviarATodos, htmlLibre } from './lib/mailer.js';

async function main() {
  const [titulo, mensaje] = process.argv.slice(2);
  if (!titulo || !mensaje) {
    console.error('Uso: node broadcast.js "Título" "Mensaje"');
    process.exit(1);
  }

  const contactos = await listarConfirmados();
  console.log(`Enviando a ${contactos.length} suscriptor(es)...`);
  if (!contactos.length) { console.log('No hay suscriptores confirmados.'); return; }

  const n = await enviarATodos(contactos, titulo, (email) => htmlLibre(titulo, mensaje, email));
  console.log(`Listo. Enviado a ${n} suscriptor(es).`);
}

main().catch(e => { console.error(e); process.exit(1); });
