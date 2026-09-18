# Stage 13 — Local Live Integration Harness

Added a reproducible PostgreSQL-backed smoke test path so the final SCEDULAR implementation can be verified against the reconstructed real II-Year / III-Semester dataset through the same HTTP APIs used by the application.

Files added/changed:
- docker-compose.yml — local PostgreSQL 16 service
- SCEDULAR-BACKEND/scripts/live_smoke.mjs — health → preview → commit → DB status → generate → final-run verification
- SCEDULAR-BACKEND/package.json — `npm run test:live`
- LOCAL_LIVE_TEST.md — end-to-end local instructions

This stage intentionally does not claim a live DB run inside the isolated environment because no PostgreSQL service is configured there. The harness is designed for the user's machine / deployment environment.
