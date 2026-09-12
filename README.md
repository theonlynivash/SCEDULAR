<div align="center">

# SCEDULAR

### Deterministic, constraint-based timetable scheduler

Generates a complete, hard-constraint-free weekly timetable from real faculty, section, course, and lab data — or reports exactly why one isn't possible.

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-black?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](#license)
![Status](https://img.shields.io/badge/status-active--development-brightgreen?style=flat-square)

</div>

<br/>

## Core Principle

> A timetable is accepted only after an independent validator confirms every hard constraint holds. If no valid arrangement exists, SCEDULAR reports structured conflicts instead of faking success.

The solver is a deterministic CSP (constraint satisfaction problem) engine using dynamic most-constrained-variable (MRV) backtracking, followed by an independent post-validator that replays every rule from scratch against whatever the solver produced.

---

## Table of Contents

- [Architecture](#architecture)
- [Solver Pipeline](#solver-pipeline)
- [Constraints](#constraints)
- [Data Model](#data-model)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Known Scope](#known-scope--not-yet-implemented)
- [Tech Stack](#tech-stack)
- [Author](#author)
- [License](#license)

---

## Architecture

```
SCEDULAR/
├── SCEDULAR-BACKEND/     Node.js + Express + TypeScript + SQLite
│   ├── src/solver/       CSP engine, pre-validation, post-validation
│   ├── src/routes/       REST API (faculty, sections, courses, labs, timetable, import)
│   ├── src/db/           SQLite schema + repository layer
│   └── src/seed/         Seed scripts (demo + real department data)
│
└── SCEDULAR-FRONTEND/    React 19 + Vite + Tailwind v4
    └── src/components/   Dashboard, Faculty/Subject Management, Data & Import Hub,
                           Generate/View/Edit Timetable, Reports, About
```

The frontend is a thin client — all scheduling logic lives server-side. The API base defaults to `http://localhost:8090/api` (override with `VITE_API_URL`).

---

## Solver Pipeline

```
Structured input (workload spreadsheet)
        │
        ▼
Pre-validation ─────────► reject malformed/unknown rows before generation
        │
        ▼
Requirement expansion ──► weekly demand → individual schedulable units
        │
        ▼
CSP solver ──────────────► dynamic MRV backtracking search
        │
        ▼
Independent post-validator ► replays every hard constraint against the result
        │
        ▼
Master timetable (valid) or structured conflict map (invalid)
        │
        ▼
Class / Faculty / Lab / Conflict views
```

## Constraints

<details>
<summary><strong>Hard constraints (never violated)</strong></summary>

1. A section cannot have two courses in the same period
2. A teacher cannot teach two sections at the same time
3. A physical lab cannot host two sections at the same time
4. Exact weekly theory/lab period counts must be satisfied for every course and section
5. A teacher must be eligible for the subject/component assigned
6. Explicit teacher constraints (unavailable periods, max daily/weekly load) are respected
7. BREAK and LUNCH never contain a teaching assignment
8. A normal lab occupies 3 contiguous periods as one block
9. A lab block cannot cross BREAK or LUNCH
10. The lab teacher is occupied for the entire lab block
11. No duplicate or partial assignment is accepted as complete
12. Malformed or unknown input is rejected before generation
13. An infeasible instance is reported explicitly, never silently violated

</details>

<details>
<summary><strong>Soft constraints (optimized, never at the cost of a hard one)</strong></summary>

- Balance faculty workload
- Avoid gaps in a teacher's day
- Avoid excessive consecutive periods
- Spread each subject across the week
- Balance a section's daily load
- Prefer compact lab placement
- Respect configured teacher preferences

</details>

---

## Data Model

One workload spreadsheet (or the equivalent API calls) provides everything the generator needs:

| # | Data | Fields |
|---|------|--------|
| 1 | Sections | Year, Semester, Section ID (e.g. `II-K`) |
| 2 | Courses / Syllabus | Code, name, component type (`INTEGRATED` / `NON_INTEGRATED` / `MANDATORY` / `LAB_ONLY`), weekly theory & lab periods, lab block length |
| 3 | Faculty | ID, name, designation, true max periods/day and /week (across every year they teach) |
| 4 | Assignments | Faculty × Course × Section rows — a teacher spanning two years is two rows with the same Faculty ID |
| 5 | Labs & rooms | Physical rooms and which courses each can host |

A teacher assignment row can include `Year`, `Semester`, `CourseName`, `ComponentType` the first time a section/course appears — it's created automatically. Full column reference and a downloadable template live in the app's Data & Import Hub.

---

## Getting Started

**Prerequisites:** Node.js 18+

### Backend

```bash
cd SCEDULAR-BACKEND
npm install

# seed a small demo dataset, or a full real department dataset
npm run seed                        # small demo (4 sections)
npx tsx src/seed/seed_full.ts       # full real dataset (12 sections, real staffing)

npm run dev                         # http://localhost:8090
```

Other backend scripts:

```bash
npm run build     # compile TypeScript to dist/
npm start         # run the compiled build
```

### Frontend

```bash
cd SCEDULAR-FRONTEND
npm install
npm run dev        # http://localhost:5173
```

Sign in with:

```
Username: Malathi.S
Password: SCEDULAR_AIDS
```

---

## API Reference

| Method | Path | Purpose |
|---|---|---|
| GET/POST/DELETE | `/api/faculty` | Faculty CRUD |
| GET/POST/DELETE | `/api/sections` | Section CRUD |
| GET/POST/DELETE | `/api/courses` | Course/syllabus CRUD |
| GET/POST/DELETE | `/api/labs` | Lab room CRUD + course mapping |
| GET/PUT | `/api/config` | Working days & period grid |
| GET/POST | `/api/workload/requirements` | Weekly theory/lab demand per course + section |
| GET/POST | `/api/workload/teacher-assignments` | Faculty ↔ course ↔ section links |
| POST | `/api/import/faculty-workload` | Bulk spreadsheet import (creates faculty/sections/courses as needed) |
| POST | `/api/timetable/generate` | Run the solver pipeline |
| GET | `/api/timetable/master` | Latest validated timetable |
| GET | `/api/timetable/section/:id`, `/faculty/:id`, `/lab/:id` | Filtered views of the master timetable |
| GET | `/api/timetable/runs/:id`, `/conflicts/:id` | A specific run's assignments/conflicts |

---

## Known Scope / Not Yet Implemented

- Faculty subject-preference submission (teachers opting into subjects) is not implemented — there is no backend workflow for it, and no UI pretends otherwise.
- Curriculum/PDF parsing uses the same structured spreadsheet importer as workload data; free-form PDF text extraction is not supported.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Backend | Express · better-sqlite3 · Zod (validation) · xlsx (spreadsheet import) · TypeScript |
| Frontend | React 19 · Vite · Tailwind CSS v4 · TypeScript |

---

## Author

Independent personal project — not an official Panimalar Engineering College production — built by a student for real use in the AI & Data Science department.

**Srinivash Karthikeyan**
B.Tech AI & Data Science, Panimalar Engineering College
[theonlynivash@gmail.com](mailto:theonlynivash@gmail.com) · GitHub: [@theonlynivash](https://github.com/theonlynivash)

With input from Suganya Devi J (M.Tech, Faculty, PEC) on department requirements.

---

## License

Distributed under the MIT License. See `LICENSE` for details.
