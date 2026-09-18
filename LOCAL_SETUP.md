# SCEDULAR Local Integration Setup

## 1. PostgreSQL

Create a PostgreSQL database named `scedular` and set `DATABASE_URL` in `SCEDULAR-BACKEND/.env`.

Example:

```env
DATABASE_URL=postgresql://scedular:scedular@localhost:5432/scedular
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

## 4. Real dataset

Use `SCEDULAR_REAL_DATA_FROM_PDFS_STAGE8.xlsx` as the reconstructed II-Year / III-Sem dataset.

The workbook is already validated by the import parser/normalizer/validator. A live database commit and HTTP generation request must be run against the target PostgreSQL instance because this package cannot ship a database connection.
