# HOSTING_PROMPT.md — how to move SCEDULAR to Panimalar's own server or the panimalar.in website

This file is written as a **prompt**. Give the whole file to an AI coding assistant (or a developer) together with the repository,
and say which scenario you want (A, B or C below). It lists what the program is, exactly which files and settings decide where it
runs, the changes each scenario needs, and how to check that it works. Everything here was checked against the code in this repository.

> **Rules for whoever follows this prompt**
> 1. Change **settings first** (environment variables, build variables, server config). Change **code** only where a section below says so.
> 2. Never commit `.env`, `SCEDULAR-BACKEND/data/*.json` or backups: they hold real emails, password hashes and messages (the repository is public).
> 3. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`.
> 4. After every scenario run the checks in section 9. Do not say "done" until they pass.
> 5. Do not weaken the timetable rules, the login rules or the HOD password rules to "make it work".

---

## 1. What SCEDULAR is (so you know what you are moving)

* **Two programs in one repository**
  * `SCEDULAR-BACKEND/` — Node.js (18 or newer) + Express + TypeScript. It is the **API** (`/api/...`). It also builds the PDFs, sends the email and runs the timetable solver.
  * `SCEDULAR-FRONTEND/` — React + Vite + Tailwind. It is the **website**: after `npm run build` it is only static files (`dist/`). It uses `#` addresses (for example `/#/reports`), so a plain static server works with no special rewrite rules.
* **All the department's data is ONE JSON document** held in memory by the backend and saved either
  * to a **local file** `SCEDULAR-BACKEND/data/scedular_local_db.json` (file mode), or
  * to **PostgreSQL** in a table `app_state` (one row, with a version number) plus `faculty_photos` (profile pictures) (postgres mode).
  There are no other tables to design or migrate. The tables are created automatically on the first request.
* **Which mode is used** is decided by `SCEDULAR-BACKEND/src/db/storage.ts` → `resolveStorage()`:

  | `STORAGE` | Result |
  |---|---|
  | `file` | always the local file |
  | `postgres` | always PostgreSQL (`DATABASE_URL` required, otherwise the API answers `503 NOT_CONFIGURED` with a clear message) |
  | `auto` (default) | on Vercel (`VERCEL` is set) → PostgreSQL; on any other computer → the local file, even if `DATABASE_URL` is present |

  `SCEDULAR_SITE=true` makes `auto` behave like Vercel (use this on a server where you want PostgreSQL without setting `STORAGE`).
  `/api/health` returns `{"ok":true,"service":"scedular-backend","storage":"file"|"postgres"}` so you can always see the active mode.
* **Login**: every API call except health, sign-in and "forgot password" needs a session token (`Authorization: Bearer …`, kept in the browser's `localStorage`). The HOD is `FAC-001`; accounts without a personal password sign in with `SCEDULAR_MASTER_PASSWORD` (default `SCEDULAR_AIDS`). Sessions last 30 days and are stored with the data.
* **Timetable generation** is CPU-heavy (seconds to minutes) and happens about once per semester cycle. On a normal server it runs in a worker thread (`src/solver/runner.ts`). On Vercel it runs inside the request and is stopped by `SOLVER_TIME_LIMIT_MS` (default 45 s on Vercel, 3 minutes elsewhere).

### Files that matter for hosting

| File | What it controls |
|---|---|
| `SCEDULAR-BACKEND/.env` (from `.env.example`) | every backend setting (below) |
| `SCEDULAR-BACKEND/src/index.ts` | local/server entry: `app.listen(PORT)` (`PORT`, default 8090) |
| `SCEDULAR-BACKEND/api/index.ts` + `SCEDULAR-BACKEND/vercel.json` | Vercel entry for the **API project** |
| `SCEDULAR-BACKEND/src/app.ts` | CORS list (`FRONTEND_ORIGIN`, `CORS_ORIGINS`), proxy trust (`TRUST_PROXY`), routes |
| `SCEDULAR-BACKEND/src/db/storage.ts`, `sync.ts` | storage mode, PostgreSQL access, conflict-safe saving |
| `SCEDULAR-BACKEND/src/scripts/dbCopy.ts` | `npm run db:check / db:push / db:pull` (copy data between file and PostgreSQL) |
| `SCEDULAR-BACKEND/assets/fonts/` | URW Bookman fonts for the PDFs (must be deployed with the backend) |
| `SCEDULAR-FRONTEND/.env` / build variables | `VITE_API_URL` (where the API is), `VITE_BASE_PATH` (sub-address) |
| `SCEDULAR-FRONTEND/src/api.ts` | how the website finds the API (`resolveApiBase()`) |
| `SCEDULAR-FRONTEND/vercel.json` | Vercel settings of the **web project** |
| `SCEDULAR-FRONTEND/public/` | logos and the Excel template (served from the site's base path) |
| `VERCEL_DEPLOY.md` | the step-by-step Vercel guide |

### All backend environment variables

| Name | Meaning | Default |
|---|---|---|
| `STORAGE` | `auto`, `file`, `postgres` | `auto` |
| `DATABASE_URL` | PostgreSQL connection string (Neon, or the college's own server) | empty |
| `SCEDULAR_SITE` | `true` = treat this machine like a website for `STORAGE=auto` | unset |
| `PORT` | server port | 8090 |
| `FRONTEND_ORIGIN` / `CORS_ORIGINS` | websites allowed to call the API (comma separated, exact addresses). On a live site (`NODE_ENV=production` or Vercel) once either is set, **any other website is refused**; if neither is set the API accepts all websites | localhost + `*.vercel.app` |
| `TRUST_PROXY` | `true` when the API sits behind nginx/another proxy | unset |
| `SCEDULAR_MASTER_PASSWORD` | first-login password | `SCEDULAR_AIDS` |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | email (leave letters, password notices, HOD mail). Empty = mail off | Gmail host/465 |
| `GROQ_API_KEY`, `GROQ_MODEL`, `LLM_PROVIDER`, `GROQ_API_BASE` | the AI assistant and AI-drafted mail. Empty = off | — |
| `SOLVER_TIME_LIMIT_MS` | longest a generation may search | 180000 (45000 on Vercel) |
| `SCEDULAR_START_BLANK` | `true` = a new install starts empty instead of with the sample department | unset |
| `SCEDULAR_DB_FILE` | path of the local data file | `data/scedular_local_db.json` |
| `PG_POOL_MAX` | database connections per instance | 3 |

Frontend build variables: `VITE_API_URL` (API address **including `/api`**, no trailing slash) and `VITE_BASE_PATH` (for example `/scedular/`, must start and end with `/`; default `/`). Vite writes them into the site **when it is built**, so changing them means rebuilding.

---

## 2. Scenario A — Vercel with Neon (two projects: Web + API)

Follow `VERCEL_DEPLOY.md` exactly. In short:

1. Neon database → copy the connection string.
2. Vercel project **scedular-api**: Root Directory `SCEDULAR-BACKEND`, variables `DATABASE_URL`, `SCEDULAR_MASTER_PASSWORD`, `FRONTEND_ORIGIN`, `SMTP_USER`, `SMTP_PASS`, `GROQ_API_KEY`. Check `/api/health` shows `"storage":"postgres"`.
3. Vercel project **scedular-web**: Root Directory `SCEDULAR-FRONTEND`, variable `VITE_API_URL=https://<api-address>/api`.
4. Copy existing data once: `cd SCEDULAR-BACKEND && npm run db:push -- --yes`.
5. Generate the timetable **on a computer** against Neon (`STORAGE=postgres`, `DATABASE_URL=…`, `npm run dev`) because a Vercel function cannot search for minutes.

No code change is needed for scenario A.

---

## 3. Scenario B — the college's own server (Ubuntu), one machine, nginx in front

Goal: `https://scedular.panimalar.in` (or an internal address such as `http://10.0.0.20/scedular`) served from a college machine.

### B1. Install
```bash
sudo apt update && sudo apt install -y nginx git
# Node 20 LTS (any 18+ works)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
git clone <the repository> /opt/scedular && cd /opt/scedular
```

### B2. Choose the database
* **Simplest — the local file** (fine for one department, one server): leave `STORAGE=auto` or set `STORAGE=file`. Back up `SCEDULAR-BACKEND/data/` every night (`cp` or `rsync`).
* **PostgreSQL on the same machine** (recommended if the college has an IT team): `sudo apt install postgresql`, then
  ```bash
  sudo -u postgres psql -c "CREATE USER scedular WITH PASSWORD 'choose-a-password';"
  sudo -u postgres psql -c "CREATE DATABASE scedular OWNER scedular;"
  ```
  and in `SCEDULAR-BACKEND/.env`:
  ```
  STORAGE=postgres
  DATABASE_URL=postgresql://scedular:choose-a-password@localhost:5432/scedular
  ```
  (No `sslmode` is needed on the same machine. `src/db/storage.ts` turns SSL on only for `sslmode=require` or `neon.tech` links.) The repository's `docker-compose.yml` also starts a ready PostgreSQL if Docker is preferred.
  Move existing data in with `npm run db:push -- --yes`. Back up with `pg_dump scedular > backup.sql` nightly.

### B3. Backend (API)
```bash
cd /opt/scedular/SCEDULAR-BACKEND
cp .env.example .env     # then edit: SCEDULAR_MASTER_PASSWORD, FRONTEND_ORIGIN, SMTP_*, GROQ_*, TRUST_PROXY=true, PORT=8090
npm ci && npm run build  # produces dist/
```
Run it forever with systemd — `/etc/systemd/system/scedular-api.service`:
```ini
[Unit]
Description=SCEDULAR API
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/scedular/SCEDULAR-BACKEND
ExecStart=/usr/bin/node dist/index.js
Restart=always
User=scedular
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now scedular-api` → `curl http://localhost:8090/api/health` must answer.
(`dist/` finds the fonts in `SCEDULAR-BACKEND/assets/fonts` because it is built inside the same folder — do not move `dist/` elsewhere without `assets/`.)

### B4. Website
```bash
cd /opt/scedular/SCEDULAR-FRONTEND
echo "VITE_API_URL=/api" > .env.production      # same address as the site, nginx forwards /api to the backend
npm ci && npm run build                         # produces dist/
sudo mkdir -p /var/www/scedular && sudo cp -r dist/* /var/www/scedular/
```

### B5. nginx (site at the root of its own address, e.g. scedular.panimalar.in)
`/etc/nginx/sites-available/scedular`:
```nginx
server {
    listen 80;
    server_name scedular.panimalar.in;
    client_max_body_size 5m;                       # profile pictures and Excel imports

    root /var/www/scedular;
    index index.html;
    location / { try_files $uri /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;                   # a timetable generation can take minutes
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/scedular /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d scedular.panimalar.in   # HTTPS
```
Because the website and the API share one address, CORS is not involved. If they are on different addresses set `FRONTEND_ORIGIN` on the API to the website's address.

### B6. First start
Open the address, sign in as `FAC-001` with `SCEDULAR_MASTER_PASSWORD`. For a department that should start empty, set `SCEDULAR_START_BLANK=true` **before** the first request.

### B7. Updating later
```bash
cd /opt/scedular && git pull
cd SCEDULAR-BACKEND && npm ci && npm run build && sudo systemctl restart scedular-api
cd ../SCEDULAR-FRONTEND && npm ci && npm run build && sudo cp -r dist/* /var/www/scedular/
```

---

## 4. Scenario C — under the college website `panimalar.in`

Ask the web team which of these they can give you, in this order of preference:

1. **A subdomain** such as `scedular.panimalar.in` (best). Point its DNS record at the server (scenario B, an `A` record) or at Vercel (scenario A, a `CNAME` to `cname.vercel-dns.com`, shown in the Vercel project → Settings → Domains). Then scenario A or B applies unchanged. Add the address to `FRONTEND_ORIGIN` on the API.
2. **A path** such as `https://www.panimalar.in/scedular/` on the main site's server. Then:
   * Build the website with a base path: `VITE_BASE_PATH=/scedular/ VITE_API_URL=/scedular/api npm run build` (Vite then writes every link under `/scedular/`; the logos and the Excel template already use `import.meta.env.BASE_URL`).
   * In the main site's nginx add inside its `server { … }`:
     ```nginx
     location /scedular/ { alias /var/www/scedular/; try_files $uri /scedular/index.html; }
     location /scedular/api/ {
         rewrite ^/scedular/api/(.*)$ /api/$1 break;
         proxy_pass http://127.0.0.1:8090;
         proxy_set_header Host $host;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;
         proxy_read_timeout 600s;
     }
     ```
   * Set `TRUST_PROXY=true` and `FRONTEND_ORIGIN=https://www.panimalar.in` in the API `.env`.
3. **Only a link or an iframe** on the college page: not recommended (login storage and downloads are unreliable inside frames; the app also sends `X-Frame-Options: DENY` from the Vercel web project). Use a normal link to the subdomain instead.

---

## 5. If the college server or website has no internet (intranet only)

* The SCEDULAR AI assistant and AI-drafted mail need to reach `api.groq.com`; without internet leave `GROQ_API_KEY` empty (those two features switch off, everything else works).
* Email needs an SMTP server reachable from the machine. For the college's own mail server set `SMTP_HOST`, `SMTP_PORT` (465 = SSL, 587 = STARTTLS), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Leave all empty to switch mail off (the forgot-password flow then cannot send codes; the HOD can issue passwords by hand).
* The website itself loads fonts from Google Fonts (`index.html`/`index.css`); offline it falls back to system fonts. To make it fully offline, download the font files into `SCEDULAR-FRONTEND/public/fonts/` and replace the `@import`/`<link>` for Google Fonts with `@font-face` rules.

---

## 6. Changing the college or department name, logos and wording

For another department or college, search the code for these and change them (all plain text):

| What | Where |
|---|---|
| Browser title, icon, description | `SCEDULAR-FRONTEND/.figma/make/site.json` and `index.html` |
| Logos | replace the files in `SCEDULAR-FRONTEND/public/` (`PEC_LOGO.png`, `PEC_ICON.jpeg`, `SCEDULAR_LOGO.png`, `SCEDULAR_LOGO_1.png`) keeping the same file names |
| "Panimalar AI & DS", college name on pages | `src/components/Dashboard.tsx`, `LoginPage.tsx`, `About.tsx`, `Sidebar.tsx`, `MobileDrawer.tsx` |
| PDF headings ("PANIMALAR ENGINEERING COLLEGE, CHENNAI", programme name, class-in-charge text) | `SCEDULAR-BACKEND/src/export/classTimetablePdf.ts` and `facultyMasterPdf.ts` |
| Department label saved on new teachers | `SCEDULAR-BACKEND/src/routes/setup.ts` (`department: 'AI & DS'`) |
| Sample data (faculty, curriculum, rooms) | `SCEDULAR-BACKEND/src/seed/*.ts` — **not used** when `SCEDULAR_START_BLANK=true`; a new department then imports its own teachers, syllabus and sections from Excel (Settings → Import) |
| Period timings (8 periods, tea and lunch) | `SCEDULAR-BACKEND/src/utils/grid.ts` (`defaultScheduleConfig`) and the Settings screens |

After renaming, run `npx tsc --noEmit` in both folders and `npm test` in the backend.

---

## 6a. Behaviour a hosting change must not break
* The department's **weekly limit** (22 periods) is stored in the policy setting and on every teacher; defaults live in `SCEDULAR-BACKEND/src/utils/staffing.ts` and `allocationPolicy.ts`, and `src/utils/weeklyLimit.ts` applies it to everyone. The solver enforces it.
* Settings → Import has **Add** and **Reset**; Reset needs the HOD's password again (`POST /api/setup/import/:kind/commit` with `mode: "reset"`). If the HOD password differs on the new server, use that one.
* Lab rooms are managed only in Settings → Lab rooms (the old Lab Management page is gone).

## 7. Moving data between computers and the online database

```bash
cd SCEDULAR-BACKEND                 # .env contains DATABASE_URL
npm run db:check                    # is the database reachable, is there data
npm run db:push -- --yes            # local file  -> database   (replaces the database content)
npm run db:pull -- --yes            # database    -> local file  (old file saved as .backup-<time>)
```
Sessions are never copied (everybody signs in again after a push). Teachers' passwords and profile pictures are copied.
The same commands move data between the Neon database and the college's PostgreSQL: run `db:pull` with one `DATABASE_URL`, change it, then `db:push`.

---

## 8. Things that commonly go wrong (and the fix)

| Symptom | Cause | Fix |
|---|---|---|
| Website shows "Cannot reach the SCEDULAR server" | wrong `VITE_API_URL`, API stopped, or HTTPS website calling an HTTP API | correct the address, rebuild the website; both must be `https` |
| "The website reached a page instead of the SCEDULAR API" | `VITE_API_URL` missing, so the site called itself | set `VITE_API_URL` (ending `/api`) and rebuild |
| API answers `503 NOT_CONFIGURED` | on Vercel (or `STORAGE=postgres`) but `DATABASE_URL` is empty | add the connection string and redeploy |
| API works but nothing is saved after a restart | file mode on a host with a read-only or temporary disk | use PostgreSQL (`STORAGE=postgres`) or a persistent folder via `SCEDULAR_DB_FILE` |
| Browser console: CORS error | `FRONTEND_ORIGIN` is set but does not list this website's address | add it (exact address with `https://`, no trailing slash, comma separated) |
| "Someone else saved changes at the same moment" (409) | two people saved in the same second | repeat the action; nothing was lost |
| Sign-in blocked after wrong passwords | rate limit (8 failures / 15 minutes per address) | wait; behind a proxy make sure `TRUST_PROXY=true` so each visitor is counted separately |
| PDFs use a plain font | `assets/fonts` not deployed | keep `SCEDULAR-BACKEND/assets/` next to `dist/` (Vercel: `includeFiles` in `vercel.json`) |
| Timetable generation stops with "search budget exhausted" | too little time (Vercel) or data that cannot be scheduled | on a server raise `SOLVER_TIME_LIMIT_MS`; on Vercel generate on a computer (section 2, step 5); also read the conflict list: it names the section/subject/teacher/room at fault |
| Excel import or photo upload fails with 413 | proxy body limit | nginx `client_max_body_size 5m;` |
| Mail not sent | SMTP values wrong or the Gmail App Password missing | Teachers → *Check mail setup* shows the exact error |

---

## 9. Checks to run before saying "done" (all must pass)

```bash
# 1. the code is healthy
cd SCEDULAR-BACKEND  && npx tsc --noEmit && npm test
cd ../SCEDULAR-FRONTEND && npx tsc --noEmit && npm run build

# 2. the running API
curl -s https://<api-address>/api/health                    # {"ok":true,...,"storage":"postgres" or "file"}
curl -s -o /dev/null -w "%{http_code}" https://<api-address>/api/faculty   # 401 (needs sign-in): the guard works
```
Then in a browser:
1. Open the website → sign in as `FAC-001` → the Dashboard loads (no red error banner).
2. **Settings → Policy & cycle** loads; **Reports** loads; **Teachers** lists the teachers.
3. Download a class timetable PDF (View Timetable → Download PDF) and check it is not blank.
4. Teachers → envelope → **Check mail setup** → green (if mail is wanted).
5. Open the site on a phone; sign out and in again.
6. Add a **reminder** on the Dashboard, reload the page: it is still there (proves saving works in this storage mode).
7. Restart the API (or redeploy). Reload: the reminder is still there (proves the data is stored, not only in memory).

## 10. What to hand back

When you finish, write down for the department: the website address, the API address, which storage is used, where the backups are
stored and how to restore them, who holds `SCEDULAR_MASTER_PASSWORD` and the SMTP password, and the exact commands used to update the site.
