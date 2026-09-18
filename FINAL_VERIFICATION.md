# SCEDULAR Stage 11 — Final Integration Verification

Static contract verification: PASS (13 checks).

Verified relationships:
- canonical generated assignments persist subject_id + section_subject_id + batch
- legacy course_id is nullable for canonical runs
- canonical unscheduled rows no longer require a legacy course/faculty id
- canonical subject/section-subject/teaching-assignment routes are mounted
- section-aware lab mapping API is present
- frontend API exposes canonical entities

The real reconstructed workbook was previously validated by the import parser/normalizer/validator with 0 errors and 0 warnings.

A live PostgreSQL/Neon end-to-end request was not executed in this environment because no project DATABASE_URL was configured. Frontend dependency build was also not executed here because dependencies are intentionally omitted from the distributable package.

Run on the target machine:

```bash
cd SCEDULAR/SCEDULAR-BACKEND
npm install
npm run build
npm test
npm run migrate
npm start
```

Then in the frontend:

```bash
cd ../SCEDULAR-FRONTEND
npm install
npm run build
npm run dev
```
