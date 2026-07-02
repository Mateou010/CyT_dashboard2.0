# Seguimiento automático de proyectos de ley — Ciencia y Tecnología

Automatiza tu proceso manual: **entra solo a la Comisión de Ciencia y Tecnología
de Diputados, detecta proyectos de LEY nuevos, descarga el PDF, lo resume y avisa
por email a los suscriptores.** También hace **seguimiento** (avisa si un proyecto
cambia de trámite) y permite **mandar mensajes libres a todos** cuando quieras.

**Sin base de datos.** Los suscriptores viven en *Resend Audiences* y el estado de
los proyectos en un JSON dentro de tu repo.

## Cómo guarda los datos (sin Supabase)

- **Suscriptores → Resend Audiences.** El formulario (en Vercel) manda un mail de
  confirmación; al confirmar, la persona se agrega al Audience. La baja también la
  maneja Resend. La confirmación usa un **token firmado (HMAC)**, así que no hace
  falta guardar tokens en ningún lado.
- **Proyectos y su estado → `data/proyectos-seguimiento.json`.** El scraper corre
  en GitHub Actions, actualiza ese archivo y lo **commitea al repo**. Ese archivo
  también puede alimentar tu página.

## Archivos

```
run.js                     Orquestador (scrapea, resume, envía, guarda estado)
broadcast.js               Manda un mensaje libre a todos los suscriptores
lib/
  scraper.js               Listado + detalle + resolución del PDF
  summarize.js             Extrae texto del PDF y lo resume con IA
  subscribers.js           Resend Audiences + tokens firmados (opt-in / baja)
  mailer.js                Plantillas de email (UTF-8) + envío
api/
  subscribe.js             POST /api/subscribe  (manda confirmación)
  confirm.js               GET  /api/confirm    (agrega al Audience)
  unsubscribe.js           GET  /api/unsubscribe
frontend/
  formulario-suscripcion.html
data/
  proyectos-seguimiento.json   Estado (arranca vacío [])
.github/workflows/seguimiento.yml
package.json
```

## Setup (una sola vez)

Esta documentación fue integrada al repo principal. No se versiona `seguimiento-app/`; los archivos operativos viven en la raíz (`api/`, `lib/`, `data/`, `run.js`, `.github/workflows/seguimiento.yml`).

### 1. Resend
1. Cuenta en https://resend.com y verificá tu dominio de envío.
2. Copiá tu **API Key**.
3. Creá un **Audience** (Audiences → New) y copiá su **Audience ID**.

### 2. OpenAI (opcional, para el resumen)
API Key de https://platform.openai.com. Sin esta key, el email igual sale usando
el sumario oficial como resumen.

### 3. Un secreto para firmar los tokens
Inventá una cadena larga y aleatoria para `SUBSCRIBE_SECRET` (por ejemplo, la
salida de `openssl rand -hex 32`).

### 4. Variables de entorno
```
RESEND_API_KEY=...
RESEND_AUDIENCE_ID=...             (opcional; si no está, usa Contacts globales)
EMAIL_FROM=Seguimiento <seguimiento@tu-dominio.com>
SITE_URL=https://tu-sitio.vercel.app
SUBSCRIBE_SECRET=...            (cadena larga y secreta)
OPENAI_API_KEY=...             (opcional)
OPENAI_MODEL=gpt-4o-mini       (opcional)
```
- En **Vercel** (para el formulario): Settings → Environment Variables.
  Alcanza con: RESEND_API_KEY, RESEND_AUDIENCE_ID (opcional), EMAIL_FROM, SITE_URL, SUBSCRIBE_SECRET.
- En **GitHub** (para el cron): Settings → Secrets and variables → Actions.
  Todas las de arriba (el scraper usa RESEND_* , EMAIL_FROM, SITE_URL, SUBSCRIBE_SECRET, OPENAI_*).

### 5. Copiar los archivos a tu repo
- `api/`, `lib/`, `run.js`, `broadcast.js`, `data/`, `package.json`, `.github/` en la raíz.
- El formulario de `frontend/` en la página donde quieras la suscripción.

## Ejecución

### Automática (GitHub Actions)
`.github/workflows/seguimiento.yml` corre **cada 2 horas, de 10 a 18 hs de
Argentina, de lunes a viernes**. También lo podés disparar a mano desde la
pestaña **Actions**. Al terminar, commitea el estado actualizado.

| Argentina | 10 | 12 | 14 | 16 | 18 |
|-----------|----|----|----|----|----|
| UTC (cron)| 13 | 15 | 17 | 19 | 21 |

### Manual / local
```bash
npm install
node run.js                 # detecta nuevos + revisa cambios de trámite
node run.js --solo-nuevos   # solo carga nuevos
```

### Mensaje libre a todos (broadcast)
```bash
node broadcast.js "Título del aviso" "Texto del mensaje que quieras."
```
Ejemplo:
```bash
node broadcast.js "El proyecto 3060 fue dictaminado" \
  "El proyecto 3060-D-2026 obtuvo dictamen y pasa a tratarse en la comisión de Legislación Penal."
```

## IMPORTANTE — primera corrida (evitar aluvión de mails)

La base arranca vacía, así que la primera corrida consideraría "nuevos" a TODOS
los proyectos de ley del listado. Para no mandar decenas de mails:

1. Corré una vez **sin suscriptores todavía** (antes de publicar el formulario), o
2. Usá `node run.js --solo-nuevos` la primera vez: llena `data/proyectos-seguimiento.json`
   con todo lo actual **sin enviar nada relevante** si aún no hay confirmados.

De ahí en más, solo avisa lo realmente nuevo.

## Agregar más alertas después

No hace falta configurar todo ahora. Se suman después:
- **Alertas automáticas nuevas** (distinguir "giro a comisión X" de "dictamen"
  con fecha): se mejora el parseo del trámite en `lib/scraper.js`. Requiere ver un
  proyecto que ya tenga dictamen cargado para hacerlo con precisión.
- **Avisos manuales**: ya está resuelto con `broadcast.js` — escribís el texto y
  se manda a todos.

## Notas

- **Filtro de LEY**: en `lib/scraper.js`, se descartan RESOLUCION y DECLARACION.
  Para excluir también los "MENSAJE … Y PROYECTO DE LEY" del Ejecutivo, cambiá el
  filtro por `f.tipo === 'LEY'`.
- **Selectores**: si algún día Diputados cambia el HTML, se ajustan en
  `lib/scraper.js`. Conviene mirar los logs de la primera corrida real.
- **Costos**: entra todo en los planes gratuitos de Resend, GitHub Actions y Vercel.
