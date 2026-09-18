# SCEDULAR Stage 11 — Canonical Persistence + API Contract Integration

## Implemented
- Fixed the canonical generation persistence boundary: generated assignments no longer require a legacy `courses` row.
- Added canonical `subject_id`, `section_subject_id`, and `batch` columns to generated assignments.
- Made legacy `course_id` nullable for migrated rows.
- Made `unscheduled` faculty/course references nullable and added canonical subject/offering identity.
- Added canonical CRUD-style routes for subjects, section-subject requirements, and teaching assignments.
- Added section-aware lab mapping API and lab capacity input while retaining legacy endpoints for compatibility.
- Updated frontend API types to understand canonical Subject/SectionSubject/TeachingAssignment and canonical assignment metadata.
- Combined the Stage 9 backend with the Stage 5 frontend into one Stage 11 project package.

## Key production fix
The previous schema still required `assignments.course_id` to reference the legacy `courses` table. The canonical importer populates `subjects`, not legacy `courses`, so a real `/timetable/generate` followed by persistence could fail at the database boundary even though the in-memory solver succeeded. Stage 11 removes that mismatch by persisting canonical subject identity directly.

## Verification
- Canonical parser/normalizer/validator fixture remains available under the backend test files.
- Full DB-backed API verification still requires a configured PostgreSQL/Neon `DATABASE_URL`; this environment has no live project database.
- A static API/schema contract check is included as `SCEDULAR-BACKEND/scripts/stage11_contract_check.mjs`.
