# Leyes IA

Web con landing + dashboard para visualizar proyectos de ley relacionados con IA en Argentina.

## Que incluye

- `index.html`: landing principal.
- `dashboard.html`: dashboard de proyectos.
- `bills_data.json`: datos principales consumidos por la web.
- `bridge_analysis.json`: analisis de apoyo para el dashboard.
- `api/chat.js`: endpoint serverless para chat (Gemini).
- `api/leyes.json`: base de contexto usada por el chat.

## Requisitos

- Node.js 18+
- (Opcional) Vercel CLI para simular API localmente

## Variables de entorno

Crear un archivo `.env.local` con:

```bash
GEMINI_API_KEY=tu_api_key
```

## Desarrollo local

Modo completo (frontend + `/api`):

```bash
npm run dev
```

Solo frontend estatico:

```bash
npm run dev:static
```

## Deploy recomendado

Este proyecto esta preparado para Vercel:

1. Subir este repo a GitHub.
2. Importar el repo en Vercel.
3. Configurar `GEMINI_API_KEY` en variables de entorno del proyecto.
4. Deploy.

## Preparar y subir a GitHub

Desde esta carpeta:

```bash
git init
git add .
git commit -m "chore: preparar proyecto para GitHub"
git branch -M main
git remote add origin <URL_DE_TU_REPO>
git push -u origin main
```

