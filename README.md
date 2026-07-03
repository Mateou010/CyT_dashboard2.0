# CyT Dashboard

Seguimiento y visualización de **proyectos de ley de Ciencia y Tecnología** (y de IA) de la Cámara de Diputados de Argentina: dashboards, un chatbot sobre los proyectos, y un sistema de aviso por email cuando aparecen proyectos nuevos o cambia su trámite.

## Arquitectura (resumen)

Sitio **estático + funciones serverless** desplegado en **Vercel**. No tiene backend propio ni base de datos: el estado vive en servicios externos (Resend) y en JSON versionados.

```
Frontend estático        api/ (serverless, Vercel)     lib/ (lógica)
  index.html               chat.js    → chatbot           scraper.js   (Diputados)
  dashboard-cyt.html       subscribe  → alta (opt-in)     mailer.js    (Resend)
  dashboard.html (IA)      confirm    → confirma alta     summarize.js (OpenAI)
                           unsubscribe→ baja              subscribers.js (Resend)
                                                          seguimiento-utils.js
                                                          rate-limit.js

Pipeline de datos (Python)          Seguimiento automático (GitHub Action)
  extract_bills.py  (PDF→JSON)        run.js  (cron cada 2h): scrapea → resume
  analyze_projects_text.py                    (OpenAI) → mailea → guarda estado
  validate_bills_data.py
```

## Mapa de datos (qué archivo alimenta a qué)

| Archivo | Lo genera | Lo consume |
|---|---|---|
| `bills_data.json` | `extract_bills.py` (desde PDFs) | `dashboard.html` (vista IA) |
| `bridge_analysis.json` | `analyze_projects_text.py` | `dashboard.html` |
| `api/leyes.json` | pipeline IA | `api/chat.js` (contexto del chat) |
| `cyt_bills_data.json` | pipeline CyT | `dashboard-cyt.html` |
| `data/proyectos-seguimiento.json` | `run.js` (GitHub Action) | subsistema de emails |

> Ver `CONTEXTO.md` para deuda técnica conocida (hay datos duplicados que conviene unificar).

## Requisitos

- Node.js 18+ · Python 3.11+ (para el pipeline) · cuenta de Vercel para el deploy.

## Variables de entorno

Copiá `.env.example` a `.env` y completá. Resumen:

- `GEMINI_API_KEY` — chatbot (`api/chat.js`).
- `OPENAI_API_KEY` (+ `OPENAI_MODEL`) — resúmenes del email de seguimiento.
- `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `EMAIL_FROM` — envío de emails y suscriptores.
- `SUBSCRIBE_SECRET` — firma de los tokens de confirmación/baja (≥24 chars).
- `SITE_URL` — URL pública (links de los emails).

## Comandos

```bash
npm run dev          # frontend + /api con Vercel CLI
npm run dev:static   # solo frontend estático
npm test             # tests JS (node:test)
npm run test:py      # tests Python (unittest)

# Seguimiento (lo corre la GitHub Action, pero se puede a mano):
npm run seguimiento             # nuevos + cambios de trámite
npm run seguimiento:recientes   # ventana de los más recientes
```

## Tests y CI

- Tests JS con `node:test` (`tests/*.test.js`) y Python con `unittest` (`tests/test_*.py`).
- `.github/workflows/ci.yml` corre en cada push/PR: sintaxis JS/Python, JSON válidos y **los tests**, antes de que Vercel deploye.
- `.github/workflows/seguimiento.yml` corre el seguimiento por cron.

## Deploy

Automático en **Vercel** en cada push a `main` (si el repo está conectado). Configurar las variables de entorno de arriba en el proyecto de Vercel.
