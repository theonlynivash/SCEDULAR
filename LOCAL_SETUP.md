# SCEDULAR Local Integration Setup

## 1. PostgreSQL

Local development uses the JSON database. Set `USE_LOCAL_DB=true` in `SCEDULAR-BACKEND/.env`.
The local database is stored in `SCEDULAR-BACKEND/data/scedular_local_db.json`.

For the deployed web host, set these environment variables in the host dashboard instead:

```env
USE_LOCAL_DB=false
DATABASE_URL=your-cloud-postgresql-connection-string
```

Never commit the cloud connection string or API keys. Do not change the local `.env` to cloud mode.

Example:

```env
USE_LOCAL_DB=true
PORT=8090
PG_POOL_MAX=5
```

## 2. Backend

```bash
cd SCEDULAR-BACKEND
npm install
npm run build
npm run migrate
npm test
npm start
```

Health check:

```text
GET http://localhost:8090/api/health
```

Expected JSON:

```json
{"ok":true,"service":"scedular-backend"}
```

## 3. Frontend

Create `SCEDULAR-FRONTEND/.env`:

```env
VITE_API_URL=http://localhost:8090/api
```

Then:

```bash
cd SCEDULAR-FRONTEND
npm install
npm run build
npm run dev
```

## 5. Vercel deployment

Deploy the frontend and backend as separate Vercel projects from this repository:

### Frontend project

- Root Directory: `SCEDULAR-FRONTEND`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable: `VITE_API_URL=https://<backend-project>.vercel.app/api`

### Backend project

- Root Directory: `SCEDULAR-BACKEND`
- The `api/index.ts` entry point exposes the Express app as a Vercel function.
- Environment variables:

```env
USE_LOCAL_DB=false
DATABASE_URL=your-cloud-postgresql-connection-string
PG_POOL_MAX=5
```

Run `npm run migrate` once against the cloud database before using the deployed backend. Keep the local `.env` on `USE_LOCAL_DB=true`.

The frontend logos are binary files under `SCEDULAR-FRONTEND/public` and are served at `/SCEDULAR_LOGO.png`, `/PEC_LOGO.png`, and `/PEC_ICON.jpeg` by Vite/Vercel.

## 6. Real dataset

Use `SCEDULAR_REAL_DATA_FROM_PDFS_STAGE8.xlsx` as the reconstructed II-Year / III-Sem dataset.

The workbook is already validated by the import parser/normalizer/validator. A live database commit and HTTP generation request must be run against the target PostgreSQL instance because this package cannot ship a database connection.
