// Envío de emails con Resend. Plantillas livianas y compatibles con Vercel Functions.
import { Resend } from 'resend';
import { generarToken, assertSubscribeConfig } from './subscribers.js';

let _resend;
const getResend = () => (_resend ??= new Resend(process.env.RESEND_API_KEY));
const fromAddress = () => process.env.EMAIL_FROM || 'Seguimiento CyT <onboarding@resend.dev>';
const siteUrl = () => (process.env.SITE_URL || 'https://cytdashboard.vercel.app').replace(/\/$/, '');

async function enviarEmail(payload) {
  const result = await getResend().emails.send(payload);
  if (result?.error) {
    throw new Error(result.error.message || 'Resend rechazó el envío');
  }
  return result;
}

function documento(cuerpo) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#132744;line-height:1.55;max-width:680px;margin:auto;padding:28px;background:#f0f5fa">
  <div style="background:#fff;border:1px solid #dce8f2;border-radius:18px;padding:28px">
    ${cuerpo}
  </div>
</body></html>`;
}

function pie(email) {
  const token = generarToken(email, 'unsub');
  const url = `${siteUrl()}/api/unsubscribe?email=${encodeURIComponent(email)}&t=${token}`;
  return `<hr style="border:0;border-top:1px solid #dce8f2;margin:24px 0 14px"><p style="color:#6b7280;font-size:12px;margin:0">Recibís este aviso porque te suscribiste al seguimiento de proyectos de ley. <a href="${url}">Darme de baja</a></p>`;
}

export async function mailConfirmacion(email) {
  assertSubscribeConfig();
  const token = generarToken(email, 'confirm');
  const url = `${siteUrl()}/api/confirm?email=${encodeURIComponent(email)}&t=${token}`;
  const html = documento(`
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b8910f;margin:0 0 10px">Comisión de Ciencia y Tecnología</p>
    <h2 style="font-family:Georgia,serif;font-size:28px;margin:0 0 12px;color:#0c1b33">Confirmá tu suscripción</h2>
    <p>Recibimos tu pedido para seguir novedades de proyectos de ley vinculados a Ciencia, Tecnología e Innovación Productiva.</p>
    <p><a href="${url}" style="display:inline-block;background:#d4a91a;color:#0c1b33;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Confirmar suscripción</a></p>
    <p style="color:#6b7280;font-size:13px">Si no fuiste vos, podés ignorar este mensaje.</p>`);
  return enviarEmail({ from: fromAddress(), to: email, subject: 'Confirmá tu suscripción al seguimiento CyT', html });
}

export function htmlNuevoProyecto(p, email) {
  const autores = (p.autores || []).map((a) => `${a.nombre} (${a.bloque})`).join('; ');
  const giro = (p.giro || []).join(' · ');
  return documento(`
    <h2 style="font-family:Georgia,serif;color:#0c1b33">Nuevo proyecto de ley: ${p.expediente}</h2>
    <p><b>${p.sumario || ''}</b></p>
    <p><b>Fecha de presentación:</b> ${p.fecha || 's/d'}</p>
    ${autores ? `<p><b>Autores:</b> ${autores}</p>` : ''}
    ${giro ? `<p><b>Giro a comisiones:</b> ${giro}</p>` : ''}
    ${p.resumen ? `<p><b>De qué trata:</b><br>${p.resumen.replace(/\n/g, '<br>')}</p>` : ''}
    ${p.pdf_url ? `<p><a href="${p.pdf_url}">Descargar el PDF del proyecto</a></p>` : ''}
    ${pie(email)}`);
}

export function htmlActualizacion(p, detalle, email) {
  return documento(`
    <h2 style="font-family:Georgia,serif;color:#0c1b33">Novedad en el proyecto ${p.expediente}</h2>
    <p><b>${p.sumario || ''}</b></p>
    ${p.resumen ? `<p><b>De qué trata:</b><br>${p.resumen.replace(/\n/g, '<br>')}</p>` : ''}
    <p><b>Novedad:</b> ${detalle}</p>
    <p><a href="${p.url || siteUrl()}">Ver el proyecto en Diputados</a></p>
    ${pie(email)}`);
}

export function htmlLibre(titulo, mensaje, email) {
  return documento(`<h2 style="font-family:Georgia,serif;color:#0c1b33">${titulo}</h2><div>${mensaje.replace(/\n/g, '<br>')}</div>${pie(email)}`);
}

export async function enviarATodos(contactos, subject, htmlFn) {
  assertSubscribeConfig();
  let ok = 0;
  for (const contact of contactos) {
    try {
      await enviarEmail({ from: fromAddress(), to: contact.email, subject, html: htmlFn(contact.email) });
      ok++;
    } catch (error) {
      console.error('Fallo enviando a', contact.email, error.message);
    }
  }
  return ok;
}
