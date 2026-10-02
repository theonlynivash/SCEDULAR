# Deploying SCEDULAR on Vercel

One Vercel project serves both parts: the Vite app (`SCEDULAR-FRONTEND`) as static files and the Express API
(`SCEDULAR-BACKEND`) as a single serverless function at `/api/*` (see `vercel.json` and `api/index.ts`).
Because the API is on the same domain, no CORS or `VITE_API_URL` setting is needed.

## 1. Create the database
Vercel's file system is read-only, so the local JSON database cannot be used. Create a free Postgres database
(e.g. Neon) and copy its connection string. Tables are created automatically on the first request.

## 2. Import the repository
Vercel -> Add New Project -> import the GitHub repo. Leave **Root Directory** empty (repo root) and **Framework
Preset** as "Other"; `vercel.json` supplies the install/build commands and output folder.

## 3. Environment variables (Project -> Settings -> Environment Variables)

| Name | Required | Value / notes |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres connection string, e.g. `postgresql://user:pass@host/db?sslmode=require` |
| `SCEDULAR_MASTER_PASSWORD` | recommended | First-login password for accounts that have no personal password yet (the HOD, FAC-001). Defaults to `SCEDULAR_AIDS` if unset. Change it after the first sign-in via a personal password. |
| `SMTP_USER` | for email | Gmail address that sends mail (forgot-password codes, password notices, HOD mails) |
| `SMTP_PASS` | for email | Gmail **App Password** (16 letters; needs 2-Step Verification on that account) |
| `MAIL_FROM` | optional | e.g. `SCEDULAR <your.address@gmail.com>` |
| `SMTP_HOST` / `SMTP_PORT` | optional | default `smtp.gmail.com` / `465` |
| `GROQ_API_KEY` | for the AI assistant | Groq key starting with `gsk_` |
| `GROQ_MODEL` | optional | model id, default `qwen/qwen3.8-27b` |
| `LLM_PROVIDER` | optional | `groq` |
| `SCEDULAR_RESET_PASSKEY` | recommended | Second secret for "Reset allocation cycle" (default `SCEDULAR_RESET` - change it) |
| `PG_POOL_MAX` | optional | `3` is plenty for serverless |
| `CORS_ORIGINS` | optional | extra allowed origins, comma separated (only if you also call the API from another domain) |

**Do not set** on Vercel: `USE_LOCAL_DB`, `SCEDULAR_DB_FILE`, `MAIL_TRANSPORT`, `NODE_TLS_REJECT_UNAUTHORIZED`.

## 4. Deploy and check
1. Deploy. Open `https://<your-app>.vercel.app/api/health` -> `{"ok":true,...}`.
2. Sign in as `FAC-001` with `SCEDULAR_MASTER_PASSWORD` (or `SCEDULAR_AIDS`).
3. Settings -> Dataset: choose the sample department or start empty and build it in the app.
4. Teachers page: issue logins; Teachers -> envelope icon -> "Check mail setup" confirms SMTP.

## Notes
- Timetable generation runs inside one request (about 30 s for 28 sections on a laptop). `maxDuration` is 60 s; if
  your plan is slower, generate semester by semester or run the solver locally against the same database.
- Chat messages are deleted after 30 days; forgot-password codes live in server memory (15 min), so a request that
  lands on a different serverless instance may not find the code - ask for a new one.
- PDF fonts (URW Bookman) are bundled from `SCEDULAR-BACKEND/assets/fonts`; without them the PDFs fall back to Times.
