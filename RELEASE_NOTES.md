# SCEDULAR Final Release Candidate

This package is the cleaned release candidate after the staged redesign.

## Included
- Canonical subject / section-subject / teaching-assignment data model
- Multi-sheet master Excel import with preview, normalization and validation
- Section-aware lab mapping
- Canonical CSP solver integration
- Independent timetable validator
- Frontend/API canonical entity support
- Local PostgreSQL Docker compose setup
- Real-data workbook reconstructed from the supplied Panimalar Engineering College PDFs
- Repeatable solver tests and live HTTP smoke test

## Verification performed in this environment
- Stage 11 contract check: 13/13 PASS
- Final preflight: 10 PASS, 2 environment WARNINGS
- Python/Node file-structure and script checks passed

## Remaining environment-dependent verification
A live PostgreSQL/API/browser run requires a machine with PostgreSQL (or Docker) and installed npm dependencies. This environment did not have Docker and `npm install` timed out, so no claim is made that the live database or frontend production build was executed here.

## Start locally
1. Copy `.env.example` to `.env` and set DATABASE_URL.
2. In `SCEDULAR-BACKEND`, run `npm install`, `npm run build`, `npm test`, `npm run migrate`, `npm start`.
3. In `SCEDULAR-FRONTEND`, run `npm install`, `npm run build`, `npm run dev`.
4. For HTTP smoke testing against the running backend, run `npm run test:live` from `SCEDULAR-BACKEND`.
