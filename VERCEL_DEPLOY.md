# Putting SCEDULAR online with Vercel (two projects: Web + API) and Neon PostgreSQL

SCEDULAR is deployed as **two Vercel projects from the same GitHub repository**:

| Project | Root Directory | What it serves | Address (example) |
|---|---|---|---|
| **scedular-api** | `SCEDULAR-BACKEND` | the Express API as one serverless function | `https://scedular-api.vercel.app` |
| **scedular-web** | `SCEDULAR-FRONTEND` | the React website (static files) | `https://scedular.vercel.app` |

The website calls the API at the address you give it in `VITE_API_URL`. The data lives in a **Neon PostgreSQL** database.
On your own computer nothing changes: the same code uses a **local file** database, so you can work and test without touching the
online data.

> **Which database is used? (`STORAGE=auto`, the default)**
> * on Vercel → the PostgreSQL link in `DATABASE_URL` (if it is missing the API answers `503 NOT_CONFIGURED` and tells you so);
> * on a computer (`npm run dev`) → the local file `SCEDULAR-BACKEND/data/scedular_local_db.json`, even if `DATABASE_URL` is in your `.env`.
> `/api/health` shows which one is active: `{"ok":true,"storage":"postgres"}`.

---

## 1. Create the database (Neon)
1. Go to <https://neon.tech>, create a project, and copy the **connection string** (`postgresql://user:password@ep-….neon.tech/neondb?sslmode=require`).
2. Nothing else is needed: the two tables (`app_state`, `faculty_photos`) are created on the first request.

## 2. Create the API project
1. Vercel → **Add New → Project** → import the GitHub repository.
2. **Project name**: `scedular-api`. **Root Directory**: `SCEDULAR-BACKEND`. **Framework Preset**: *Other*. Leave the build and output settings empty (`vercel.json` there supplies everything).
3. **Environment Variables** (Settings → Environment Variables; add to *Production* and *Preview*):

| Name | Required | Value / notes |
|---|---|---|
| `DATABASE_URL` | **yes** | the Neon connection string |
| `SCEDULAR_MASTER_PASSWORD` | **yes (change it)** | first-login password of accounts without a personal password (the HOD `FAC-001`). Default is `SCEDULAR_AIDS`. |
| `FRONTEND_ORIGIN` | recommended | the website address, e.g. `https://scedular.vercel.app` (add the college address too, comma separated) |
| `SMTP_USER` | for email | Gmail address that sends the mail (forgot-password codes, leave letters, substitution notices) |
| `SMTP_PASS` | for email | the Gmail **App Password** (16 letters; the account needs 2-Step Verification) |
| `MAIL_FROM` | optional | `SCEDULAR <your.address@gmail.com>` |
| `SMTP_HOST` / `SMTP_PORT` | optional | `smtp.gmail.com` / `465` (change for a college mail server) |
| `GROQ_API_KEY` | for the AI assistant | Groq key starting `gsk_` |
| `GROQ_MODEL`, `LLM_PROVIDER` | optional | `qwen/qwen3.8-27b`, `groq` |
| `PG_POOL_MAX` | optional | `3` |
| `SOLVER_TIME_LIMIT_MS` | optional | how long a timetable generation may search; default `45000` on Vercel (see "Timetable generation" below) |
| `SCEDULAR_START_BLANK` | optional | `true` for an empty department instead of the sample one (first request only) |

   **Do not set** on Vercel: `STORAGE=file`, `USE_LOCAL_DB`, `SCEDULAR_DB_FILE`, `MAIL_TRANSPORT`, `NODE_TLS_REJECT_UNAUTHORIZED`.
4. **Deploy**. Open `https://scedular-api.vercel.app/api/health` → `{"ok":true,"service":"scedular-backend","storage":"postgres"}`.

## 3. Create the web project
1. Vercel → **Add New → Project** → the **same** repository again.
2. **Project name**: `scedular-web`. **Root Directory**: `SCEDULAR-FRONTEND`. **Framework Preset**: *Vite* (detected).
3. **Environment Variable**: `VITE_API_URL` = `https://scedular-api.vercel.app/api` (the API address **plus `/api`**, no trailing slash).
4. **Deploy**, open the site, sign in as `FAC-001` with `SCEDULAR_MASTER_PASSWORD`.
5. If you change `VITE_API_URL` later you must **redeploy** the web project (Vite bakes it in when it builds).

If the browser says "Failed to fetch", the usual causes are: `VITE_API_URL` wrong or missing `/api`; the API project is not deployed; or
`DATABASE_URL` is missing (open `/api/health` and `/api/auth/me` to see the message).

## 4. Putting your existing data online (once)
Your department's real data is in the local file. Copy it to Neon from your computer:
```bash
cd SCEDULAR-BACKEND
# .env must contain DATABASE_URL=<the Neon link>
npm run db:check              # shows whether Neon answers and whether it already holds data
npm run db:push -- --yes      # local file -> Neon  (replaces what is online; sessions are not copied)
```
Later, to bring the online data back to your computer: `npm run db:pull -- --yes` (your old local file is saved as a backup first).
Profile pictures travel with it. Teachers' passwords travel too, so everyone keeps their login.

**After updating the code, update the online data too.** Settings you change on your computer (for example the weekly limit of 22 periods, lab rooms, or an Import *Reset*) live in the local file; run `npm run db:push -- --yes` again to copy them to Neon. No new environment variables are needed for these changes; redeploy both Vercel projects.

## 5. Timetable generation on Vercel
Generating a timetable is heavy and happens only once per cycle. A Vercel function has a time limit (60 seconds in `vercel.json`; Pro plans
may raise `maxDuration` up to 300 in `SCEDULAR-BACKEND/vercel.json`). The search therefore stops after `SOLVER_TIME_LIMIT_MS`
(45 s on Vercel) and reports honestly what it could not place; it never returns a wrong timetable. For one or two semesters this is
normally enough. **The reliable way for a full cycle** is to generate on your own computer against the online database:
```bash
cd SCEDULAR-BACKEND
# in .env:   STORAGE=postgres   and   DATABASE_URL=<the Neon link>
npm run dev        # then open the local website (npm run dev in SCEDULAR-FRONTEND) and press Generate
```
The result is saved into Neon and appears on the website immediately. Set `STORAGE=auto` again afterwards.

## 6. Checklist after deploying
- [ ] `/api/health` shows `"storage":"postgres"`.
- [ ] Sign-in works; change the HOD password; set `SCEDULAR_MASTER_PASSWORD` to something private.
- [ ] Teachers → **Check mail setup** (SMTP works) and send one test mail.
- [ ] A PDF downloads (class timetable) and uses the Bookman font (fonts are bundled from `SCEDULAR-BACKEND/assets/fonts`).
- [ ] Open the site on a phone.
- [ ] Reload a page such as `/#/reports` (deep links use `#` so the website needs no special setup).

## Notes
- If two people save at the same instant the second gets a 409 "someone else saved, please try again" and nothing is overwritten.
- Chat messages are deleted after 30 days; forgot-password codes are stored with the data, so every instance can check them.
- Neon free databases sleep when idle; the first request after a pause takes a few seconds.
- Hosting on the college's own server or under `panimalar.in`: see `HOSTING_PROMPT.md`.
