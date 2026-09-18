
## 0) Preflight

From `SCEDULAR-BACKEND`, run:

```bash
npm run preflight
```

A missing `DATABASE_URL` or Docker installation is reported as an environment warning; the live smoke test still requires a real PostgreSQL connection.
# SCEDULAR Live Local Test

This is the final local integration path for a real PostgreSQL-backed run.

## 1. Start PostgreSQL

From the project root:

```bash
docker compose up -d postgres
```

The database is exposed on `localhost:5432` with:

```text
DATABASE_URL=postgresql://scedular:scedular@localhost:5432/scedular
```

## 2. Install backend dependencies

```bash
cd SCEDULAR-BACKEND
npm install
```

## 3. Configure the backend

Copy `.env.example` to `.env` and keep the local PostgreSQL `DATABASE_URL` above.

## 4. Apply the schema

```bash
npm run migrate
```

## 5. Start SCEDULAR

```bash
npm start
```

The default local URL is `http://localhost:8090`.

## 6. Run the real-data smoke test

Open another terminal in `SCEDULAR-BACKEND` and run:

```bash
npm run test:live
```

The script verifies, through the actual HTTP API:

- health endpoint
- Master Excel preview
- transactional Master Excel commit
- canonical DB counts
- 12-section timetable generation
- `VALID` final run status
- 384 generated assignments
- 0 unscheduled units
- 0 stored conflicts
- 12 sections × 32 assignments

## 7. Frontend build

```bash
cd ../SCEDULAR-FRONTEND
npm install
npm run build
```

A successful smoke test and successful frontend build complete the local production-integration verification.
