# Contexto y próximos pasos — CyT Dashboard

Este archivo es un traspaso: qué se revisó, qué se arregló, y qué conviene hacer
después (priorizado). Escrito para que lo puedas seguir sin vueltas.

## TL;DR

El proyecto **está bien**. La arquitectura (sitio estático + funciones serverless
+ una GitHub Action programada, todo en Vercel, sin backend propio) es la correcta
para lo que hace. El backend (`lib/` + `api/`) quedó sólido y con tests. Lo que
queda es **ordenar datos y documentar**, no reescribir código.

## Qué se hizo en esta pasada

Se corrieron auditorías de seguridad, performance y bugs (dos veces, la segunda
para verificar que los arreglos no rompieran nada) y se aplicaron los fixes con
**tests que los cubren** (41 tests: `npm test` + `npm run test:py`).

**Bugs importantes que estaban rotos y ya andan:**
- La suscripción ahora es **doble opt-in**: `subscribe` manda un email de
  confirmación y el alta real la hace `confirm` (antes se podía suscribir a
  terceros). ⚠️ Necesita `RESEND_*` y `SUBSCRIBE_SECRET` bien configurados.
- El seguimiento (`run.js`) **ahora sí detecta cambios de trámite** en la ventana
  `--recientes`, y toma los proyectos **más nuevos por fecha** (antes tomaba las
  primeras filas del scrape, así que podía no ver los nuevos nunca).

**Seguridad/robustez:** tokens con expiración, rate-limit por IP, escape de HTML
en emails y dashboards (había un XSS real en un tooltip de `dashboard.html`),
allowlist de hosts en el scraper, sin fugas de mensajes de error al cliente.

**Performance:** el chat ya no manda el texto completo de todos los proyectos a
Gemini (eran ~175k tokens por pregunta) ni re-lee el JSON grande en cada request.

**Python:** `extract_bills.py` ya no crashea con nombres de PDF raros, ids
normalizados, y se borró código muerto.

## Lo que conviene hacer después (priorizado)

### ✅ Vale la pena (alto valor, poco esfuerzo)

1. **Eliminar `CYT_DATA` hardcodeado en `dashboard-cyt.html`.**
   Ese literal gigante (línea ~544) tiene los **mismos 76 proyectos** que
   `cyt_bills_data.json`, que el dashboard **ya descarga** con `fetch`. Hoy, para
   cambiar un proyecto hay que editar dos lugares. Ojo: no es un swap directo,
   porque `CYT_DATA` está **agrupado por tema/subgrupo** y el JSON probablemente
   es plano — hay que escribir una función chica que reagrupe el JSON en esa misma
   estructura. Probalo en el navegador antes de dar por hecho que quedó igual.

2. **Unificar los JSON de IA que quedaron desincronizados.**
   `bills_data.json` (40), `api/leyes.json` (35) y `bridge_analysis.json` (39)
   describen lo mismo pero con totales distintos (se regeneraron en momentos
   distintos). Corré `./update_all.sh` y confirmá que los tres queden con el mismo
   total. (Requiere acceso a internet: scrapea Diputados.)

### 🕒 Si tenés tiempo

3. Sacar los literales de datos grandes de `dashboard.html`
   (`INSIGHT_DEFS`, `OUTSIDE_CYT_BILLS`, etc.) a un JSON que se descargue, para
   achicar ese archivo (~3700 líneas) sin agregar build step.
4. Agregar **Prettier** (`npm i -D prettier` + un script `format`) para formato
   consistente. No hace falta ESLint pesado.

### 🚫 No te compliques (sería sobre-ingeniería)

- No reescribas a TypeScript ni metas React/Vue. Estático + serverless está bien.
- No unifiques Python y JS: cada uno hace bien su parte (PDFs vs seguimiento).
- No fusiones los dos dashboards en uno configurable: son dos productos distintos.
- No cambies el rate-limit en memoria por una DB/KV salvo que tengas abuso real.
- No refactorices `api/chat.js` (1500 líneas de NLP a mano) de una: anda y tiene
  fallback local. Tocalo solo cuando necesites cambiarlo.

## Decisiones que quedaron a propósito (no son bugs)

- **Rate-limit en memoria**: es best-effort por instancia de Vercel. Para un
  límite global de verdad hay que usar Vercel KV / Upstash. Para la escala actual
  alcanza.
- **`unsubscribe` no revela si el email existía**: es intencional (anti-enumeración
  de emails). No lo "arregles" para que avise.
- **El guardrail de prompt-injection del chat** es best-effort (un regex), no un
  control de seguridad fuerte. El riesgo real es acotado (afecta la sesión del
  propio usuario, no expone secretos).
- **El chat acepta `contexto` del cliente** como fuente de datos: sirve para el
  dashboard, pero un usuario podría inyectar "proyectos" falsos en su propia
  sesión. Si querés endurecerlo, ignorá el `contexto` del cliente y usá siempre
  `loadDataset()`.

## Cómo laburar el proyecto

```bash
cp .env.example .env      # completá las claves
npm install
npm test                  # tests JS
npm run test:py           # tests Python
npm run dev               # levanta frontend + /api (Vercel CLI)
```

Cada push a `main` corre el CI (sintaxis + JSON + tests) y, si el repo está
conectado a Vercel, deploya solo.
