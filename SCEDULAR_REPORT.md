# SCEDULAR — Complete Project Report

**Timetable & workload management suite · Department of Artificial Intelligence & Data Science · Panimalar Engineering College, Chennai**

| | |
|---|---|
| Document | Full report: purpose, design, internal working, and step-by-step usage |
| Written for | The HOD and department staff who run SCEDULAR, and the developers who maintain it |
| Covers | Semesters II – VIII (Year 1 / Semester I is outside the scope of this build) |
| Status of the build described | Local deployment verified end to end; cloud mode (Vercel + PostgreSQL) verified against an in-memory PostgreSQL in the automated tests, not yet on a real hosted database (see §21, §26) |
| Last updated | 7 October 2026 (Import has Add and Reset, one weekly limit of 22 periods, Lab rooms merged into Settings, staffing dropdown, liquid-glass dashboard, substitution-sheet PDF, mobile bottom bar) |

> **How to read this report.** Part A (sections 1–5) explains what the system is. Part B (6–9) explains how it is built.
> Part C (10–13) is the **user manual**: one chapter for the HOD and one for teachers, written as click-by-click steps.
> Part D (14–20) goes deep into how each feature works inside. Part E (21–27) covers deployment, testing,
> troubleshooting, limitations and the maintenance checklist. If you only want to *use* the system, jump to §10.

---

## Table of contents

**Part A — Overview**
1. Executive summary
2. The problem and what SCEDULAR does about it
3. Who uses it: roles and permissions
4. Vocabulary: the terms used everywhere
5. A semester at a glance (the 12-step lifecycle)

**Part B — Design**
6. Architecture and technology
7. Repository layout
8. Data model
9. Where data lives (local file vs Postgres)

**Part C — User manual**
10. HOD manual
11. Teacher manual
12. Using SCEDULAR on a phone
13. Printable outputs: what each PDF contains

**Part D — Inside the features**
14. How a timetable is generated (the solver)
15. How a timetable is verified
16. Teacher preferences and the experience policy
17. Workload templates and auto-fill
18. Email, password changes and "Forgot password"
19. Messaging (bell icon)
20. The AI assistant

**Part E — Operations**
21. Running locally and deploying to Vercel
22. Environment variables
23. Testing
24. Backups, resets and data safety
25. Troubleshooting guide (FAQ)
26. Known limitations and risks
27. Maintenance checklist and roadmap

**Appendices**
A. API reference
B. Default policy values
C. Daily period grid
D. Worked example: one section, start to finish
E. Glossary of status words and messages

---

# PART A — OVERVIEW

## 1. Executive summary

SCEDULAR is a web application that builds the **weekly class timetable of an entire department** and keeps every
related activity in one place: who teaches what, how many periods each teacher carries, which lab is used when,
what the printed timetables look like, and how teachers and the HOD talk to each other.

What it does, in one paragraph: the HOD describes the semester (sections, subjects, teachers) inside the app;
teachers log in and pick the subjects they would like to handle; the HOD approves those choices and assigns teachers to
sections using reusable workload templates; a constraint solver then places every class of every section into the
weekly grid so that **no teacher, lab or section is ever double-booked**; an independent checker re-verifies the
result; and the timetables are exported as PDFs that look like the department's existing printed sheets. Reports show
workload, subject coverage and teacher results. Everything is available on phones too.

Key facts about the current build:

* **Independent of any source documents.** Everything — sections, syllabus, teachers, logins — is created and edited inside the
  app. The department's original PDF timetables were used once to seed realistic sample data; the system does not read them at run time.
* **One combined generation.** All ready semesters are scheduled *together* in one run, because teachers and
  labs are shared across years and per-semester runs would double-book them.
* **Verified output.** On the department's sample data the generator places **984 class periods for 28 sections** with no
  teacher, lab or section clash, in roughly half a minute on a laptop. A separate validator recomputes every rule from scratch.
* **Honest failure.** If a valid timetable does not exist the system says so and lists the exact clashes; it never fabricates a "success".
* **Printable.** Class timetable sheets (per section, per semester), a personal timetable for each teacher, and a
  department **master timetable** are produced as PDFs in the department's own layout and typeface.
* **Communication.** Password-reset by emailed code, email notices on every password change, an HOD mail composer with AI
  drafting, and a small chat between the HOD and each teacher (messages removed after 30 days).
* **Assistant.** A built-in AI assistant answers questions about any teacher, subject, section, timetable or report, and drafts emails for the HOD to approve.
* **Role-aware and responsive.** The HOD and teachers see different pages; the whole portal works on a phone.

## 2. The problem and what SCEDULAR does about it

### 2.1 The manual process it replaces

Before SCEDULAR the department prepared timetables by hand in documents:

1. The HOD collects the subjects of every semester and the list of teachers.
2. Teachers tell the HOD which subjects they want; the HOD balances this with seniority and workload.
3. The HOD decides who teaches which subject in which section (the "subject handling" tables).
4. Someone arranges the periods on a grid for every section, trying not to put one teacher in two rooms at once and
   not to use a lab twice.
5. The grids are typed into the printed format (three year-wise documents, each with one sheet per section).
6. Any change — a new section, a teacher on leave, a new elective — means redoing parts of this.

Typical failure points are clashes discovered late, unequal workloads, copying errors between documents, and the
sheer time taken every semester.

### 2.2 What SCEDULAR changes

| Manual step | In SCEDULAR |
|---|---|
| Collect subjects & teachers | HOD enters them once in **Settings** (sections, syllabus, teachers); they persist from semester to semester |
| Teachers state preferences | Teachers log in and submit **ranked, policy-limited preferences**; the HOD sees them grouped by subject |
| Decide who teaches what | HOD **approves** choices, assigns sections with **workload templates**, or uses **auto-fill** |
| Arrange the periods | One button: the **solver** builds every section's week at once |
| Check for clashes | An **independent validator** re-checks the finished result |
| Type the printed sheets | **PDF export** in the department's format, plus teacher and master timetables |
| Keep teachers informed | Email, password notices, and in-app messages |

### 2.3 Design goals

* **Correctness first.** Hard rules are never relaxed to make a timetable "fit".
* **Simplicity for the HOD.** The common path is: set up → approve → assign → generate → print. Each step is one screen.
* **Data lives in the app.** No hidden dependency on spreadsheets or PDFs at run time.
* **Recoverable.** Every change is saved; resets require passwords; local backups are easy.
* **Readable output.** What is printed matches what staff are used to reading.

## 3. Who uses it: roles and permissions

SCEDULAR has two roles. The role is stored on the teacher record in the database and is re-read on every request,
so it cannot be spoofed from the browser.

### 3.1 HOD

The Head of Department (account `FAC-001` in the sample data). The HOD can use everything.

### 3.2 Faculty (teacher)

Every other teacher. Teachers can see and change only their own data, plus general department information that is
already visible to all (for example class timetables).

### 3.3 Permission matrix

| Capability | HOD | Teacher |
|---|:-:|:-:|
| Sign in with ID + password | ✔ | ✔ |
| Forgot password (emailed code) | ✔ | ✔ |
| View dashboard | ✔ | ✔ (own view) |
| Submit subject preferences | — | ✔ |
| Review / approve / change / remove preferences | ✔ | — |
| Assign teachers to sections (manual, templates, auto-fill) | ✔ | — |
| Create / edit / delete sections, subjects, teachers | ✔ | — |
| Issue or reset another teacher's login | ✔ | — |
| Set class in-charge per section | ✔ | — |
| Change academic cycle, allocation policy, AI switch | ✔ | — |
| Generate a timetable | ✔ | — |
| View faculty / class / lab timetables | ✔ | ✔ |
| Download class timetable PDFs | ✔ | ✔ |
| Download **own** timetable PDF | ✔ (any teacher's) | ✔ (own only) |
| Download **master** timetable PDF | ✔ | — |
| See Reports (workload, needs, results, analysis) | ✔ | — |
| Record own past pass percentages | — | ✔ |
| See all teachers' pass percentages | ✔ | — |
| Edit own contact email / phone | ✔ | ✔ |
| Send email to teachers (with or without login details) | ✔ | — |
| Chat via the bell | ✔ (any teacher) | ✔ (HOD only) |
| See other teachers' email and phone | ✔ | — (names and designations only) |
| AI assistant | ✔ always | ✔ unless the HOD turns it off |
| Erase submitted preferences / erase allocation (password-gated) | ✔ | — |
| Erase teachers, sections or the syllabus in bulk | not possible for anyone | not possible |

## 4. Vocabulary: the terms used everywhere

**Department** — AI & DS only. All data is for this department.

**Year / Semester** — Year 1 = semesters I–II, Year 2 = III–IV, Year 3 = V–VI, Year 4 = VII–VIII. This build manages
semesters **II–VIII**; Year 1 is not used.

**Academic cycle** — `ODD` (semesters I, III, V, VII), `EVEN` (II, IV, VI, VIII) or `BOTH`. The cycle decides which
semesters teachers see when choosing subjects, and which semesters a generation run covers.

**Section** — one class group, such as Year 3 section A. Identifiers: odd semesters use `Y<year>-<letter>` (for example
`Y3-A`); even semesters use `Y<year>S<sem>-<letter>` (for example `Y2S4-A`). The letter is also what is printed on the timetable sheet.

**Subject** — a course with a code (for example `23AD1701`), a name, a short name used on the grid (for example `ARVR`), the number of weekly
theory periods and lab periods, credits, and a delivery type:

* **Theory** — classroom periods only.
* **Integrated** — theory periods plus a lab block (printed in both the theory and practical tables).
* **Lab** — practical only.
* **Project** — project/seminar style periods.

**Offering** (`sectionSubject`) — a subject being taught to one section, with its own theory and lab period counts.
"Subject X in Section Y3-A" is one offering. The same subject offered to eight sections is eight offerings.

**Teaching assignment** — the link *teacher ↔ offering ↔ component* (theory or lab). A teacher normally handles both
components of an offering; the same teacher is used for theory and lab unless the HOD assigns otherwise.

**Preference** — a subject a teacher asks to handle, with a status: Draft, Submitted, Approved, Rejected, Changes requested.

**Allocation experience** — years of experience used by the preference policy (see §16).

**Workload template** — a reusable recipe that says *how many sections* of a subject a teacher takes. The HOD builds
workloads from templates instead of clicking one section at a time (see §17).

**Period** — one teaching slot. The department has eight periods a day, five days a week = **40 periods per week
per section** (Appendix C lists the times).

**Block** — a run of consecutive periods used by one class. A theory class is a one-period block; a lab session is a
multi-period block (usually three).

**Lab** — a physical practical room. Two sections can never use the same lab at the same time.

**Run** — one execution of the generator. Each run is stored with a number, a timestamp and a status.

**Status** — `GREEN` (all constraints satisfied), `YELLOW` (placed, with warnings), `RED` (no valid timetable; conflicts listed).

**Floating subject** — a subject that fills the remaining empty periods after everything else is placed. The only one is **Library**.

**Class in-charge** — the teacher printed as "CLASS INCHARGE" at the foot of each section's sheet.

## 5. A semester at a glance (the 12-step lifecycle)

The following sequence is what the department does every semester. Chapter references show where each step is explained in detail.

1. **Choose the academic cycle** (Settings → Policy & cycle). ODD or EVEN. (§10.4)
2. **Set up sections** (Settings → Syllabus & sections). Add the new classes for the semester; existing ones can stay. (§10.3)
3. **Set up the syllabus** (same tab). Add/edit/delete subjects with their periods and lab rooms; each subject is automatically offered to sections. (§10.3)
4. **Add or update teachers** (Teachers page). Each new teacher gets an ID and a one-time password; set emails. (§10.5)
5. **Issue logins** and hand them out (Teachers page → CSV or mail). (§10.5, §18)
6. **Teachers submit preferences** (My Subjects). (§11.3)
7. **HOD reviews preferences** (Assign Teachers → Preferences): approve, change, or remove. (§10.6)
8. **HOD assigns sections** (Assign Teachers → Assign / Templates & Auto-fill) until every offering has a teacher. (§10.6, §17)
9. **Set class in-charges** (Settings → Class in-charge). (§10.3)
10. **Generate the timetable** (Dashboard → Generate Timetable). (§10.7, §14)
11. **Review and publish**: view faculty/class/lab timetables; download class PDFs, teacher PDFs and the master; check Reports. (§10.8–10.10, §13)
12. **Communicate**: tell teachers by mail or message; keep the dataset for next semester. (§10.11, §10.12)

Steps 2–5 are needed only when something changed since last semester. A typical semester after the first
is: confirm the cycle → add new sections → approve preferences → assign → generate → print.

---

# PART B — DESIGN

## 6. Architecture and technology

### 6.1 Overview diagram

```
                       ┌─────────────────────────────────────────────┐
                       │                 Web browser                 │
                       │  React 19 + Vite + Tailwind CSS v4 (SPA)    │
                       │  HOD pages · Teacher pages · Mobile layout  │
                       └──────────────────────┬──────────────────────┘
                                              │  HTTPS / JSON  (Bearer session token)
                                              ▼
                       ┌─────────────────────────────────────────────┐
                       │      Express API  (Node 18+, TypeScript)    │
                       │  routes/  auth/  solver/  export/  mail/    │
                       │  ai/  import/  utils/                       │
                       └───────┬───────────────┬───────────┬─────────┘
                               │               │           │
                               ▼               ▼           ▼
                   ┌──────────────────┐  ┌───────────┐  ┌───────────────┐
                   │  Data layer      │  │   SMTP    │  │  Groq LLM API │
                   │  one document:   │  │ (Gmail)   │  │ (assistant,   │
                   │  JSON file  OR   │  │ via       │  │  mail drafts) │
                   │  1 row in Postgres│ │ nodemailer│  │               │
                   └──────────────────┘  └───────────┘  └───────────────┘
```

### 6.2 Technology choices

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, lucide-react icons | Fast development, component reuse, small bundle |
| Backend | Node.js 18+, Express, TypeScript (ES modules), zod validation | One language end to end; strict request validation |
| Database | Local JSON file (`scedular_local_db.json`) **or** PostgreSQL (Neon) | Zero-setup local mode; durable cloud mode |
| Solver | Custom constraint-satisfaction engine (MRV backtracking + neighbourhood repair) | Deterministic, explainable, verifiable |
| PDF | pdfkit with bundled URW Bookman fonts | Matches the printed sheets |
| Email | nodemailer over Gmail SMTP | Simple, works with an App Password |
| AI | Groq chat-completions API (tool calling) | Fast, inexpensive; every fact comes from live tools |
| Passwords | bcryptjs | Salted one-way hashes |
| Tests | vitest | Fast integration tests on a private DB copy |
| Hosting (prepared) | Vercel (static + one serverless function) + Neon Postgres | Free tiers suffice for a department |

### 6.3 How a request flows

1. The browser calls `API_BASE/<path>` with `Authorization: Bearer <token>`.
2. The server first makes sure its copy of the data is current (in cloud mode it reloads the stored document if another instance saved a newer version). Sign-in attempts are rate-limited here.
3. Every route except sign-in, "forgot password" and the health check goes through the sign-in check: `requireAuth` looks the token up in the stored sessions, loads that teacher from the database and attaches
   `{ facultyId, role }` to the request. `requireRole('HOD')` additionally refuses non-HODs with HTTP 403.
4. The route validates its input (zod), calls repository functions, and returns JSON (or a PDF stream).
5. The repository functions work on the in-memory copy of the department's data. In file mode the file is written back after the change; in cloud mode the document is saved to PostgreSQL **before the response is sent** (compare-and-swap on a version number). The same code serves both modes.

### 6.4 Frontend structure

* `App.tsx` decides which page to show from a `page` state (no URL router): login → dashboard etc.
* `navItems.ts` defines the sidebar / bottom-bar entries for each role.
* `api.ts` is the only place that talks to the backend; it wraps `fetch`, attaches the token, and exposes typed functions.
* `session.ts` stores the signed-in user and token in the browser.
* Pages are in `src/components/`; shared UI pieces (`PillTabs`, `GlassPanel`, buttons) are in `ui.tsx`.
* Visual style: a **purple (orchid) and sandalwood** palette on warm paper, with nine ready-made themes, one per colour family (purple, green, blue, red, grey, pink, orange, yellow, magenta), chosen from **Settings → Appearance** (which shows a preview of each) (the choice is remembered in that browser; all colours come from variables in `index.css`, so a new theme is one block of values), translucent "liquid glass" panels, rounded corners and light type weights. Report cards each use their own muted hue (purple, sandal, coral, teal, indigo, rose in the default theme). Motion is small and purposeful: cards rise in one after another, bars and columns grow, rings draw in, numbers count up, the tab highlight slides, panels have a soft sheen on hover, and loading shows shimmering placeholders. All motion is switched off for people whose system asks for reduced motion.

## 7. Repository layout

```
SCEDULAR/
├── README.md                    Short project introduction
├── SCEDULAR_REPORT.md           This report
├── VERCEL_DEPLOY.md             Step-by-step deployment: two Vercel projects (Web + API) and Neon PostgreSQL
├── HOSTING_PROMPT.md            A prompt/guide for moving SCEDULAR to the college server or panimalar.in
├── docker-compose.yml           Optional local Postgres
│
├── SCEDULAR-BACKEND/
│   ├── package.json             scripts: dev, build, start, test, db:check, db:push, db:pull
│   ├── api/index.ts + vercel.json   Vercel entry and settings of the API project (Root Directory = SCEDULAR-BACKEND)
│   ├── vitest.config.ts         Test runner config (isolates the database per test file)
│   ├── .env / .env.example      Configuration (never commit .env)
│   ├── assets/fonts/            URW Bookman Light & Demi (used by the PDFs) + licence note
│   ├── data/
│   │   ├── scedular_local_db.json   The local database (git-ignored)
│   │   └── pdf_source/              Source material used once for seeding (git-ignored)
│   ├── scripts/                 One-off Python helpers used to build the sample data from the printed timetables
│   ├── src/
│   │   ├── index.ts             Local server start (port 8090 by default)
│   │   ├── app.ts               Express app: CORS, JSON parsing, lazy DB init, router mounting
│   │   ├── types.ts             Shared TypeScript types
│   │   ├── auth/                passwords.ts · session.ts · middleware.ts
│   │   ├── db/                  client.ts (Postgres pool / local stub) · localDb.ts · repo.ts · schema.sql · migrate.ts
│   │   ├── routes/              One file per feature area (see Appendix A)
│   │   ├── solver/              expand.ts · csp.ts · pipeline.ts · preValidate.ts · validator.ts
│   │   ├── export/              classTimetablePdf.ts · facultyMasterPdf.ts
│   │   ├── mail/                mailer.ts · notify.ts
│   │   ├── ai/                  llm.ts · assistant.ts
│   │   ├── import/              Excel workbook import (legacy path, still available in Data Hub)
│   │   ├── seed/                Sample department data used on first install
│   │   └── utils/               academicCycle · allocationPolicy · readinessPolicy · grid · dataValidator
│   └── tests/                   16 test files (+ setup/isolate-db.ts)
│
└── SCEDULAR-FRONTEND/
    ├── index.html · vite.config.ts · package.json
    ├── public/                  Logos
    └── src/
        ├── App.tsx · main.tsx · api.ts · session.ts · navItems.ts · types.ts · index.css
        ├── components/          All pages and widgets
        └── utils/               subjectLabel.ts (grid acronyms) · time12.ts (12-hour times)
```

## 8. Data model

The local JSON file and the Postgres schema hold the same entities. This section describes them in business terms.

### 8.1 Master data (rarely changes)

| Entity | Key fields | Notes |
|---|---|---|
| **Faculty** | `id` (FAC-001…), `name`, `designation`, `email`, `phone`, `role` (HOD/FACULTY), `allocationExperience`, `previousExperience`, `currentExperience`, `maxWeeklyPeriods`, `maxDailyPeriods` | Weekly limit defaults to 24, daily to 6 |
| **Section** | `id` (Y3-A…), `name`, `year`, `semester`, `studentCount`, `active`, `classIncharge` | `classIncharge` is a faculty id |
| **Subject** | `id`, `code`, `name`, `shortName`, `deliveryType`, `category`, `credits`, `theoryPeriods`, `labPeriods`, `semester`, `ltp`, `printAs` | `ltp` = printed L-T-P; `printAs` forces a row into the theory or practical table |
| **Lab** | `id`, `name`, `capacity` | Physical rooms |
| **Lab ↔ subject mapping** | `labId`, `subjectId`, optional `sectionId` | Which rooms may host a subject's lab block |
| **Schedule config** | working days, period list with start/end times | Eight periods Monday–Friday |
| **Faculty unavailability** | faculty, day, period | Times a teacher cannot be scheduled |

### 8.2 Workflow data (changes every semester)

| Entity | Purpose |
|---|---|
| **Section offerings** (`sectionSubjects`) | Which subjects each section takes, with period counts |
| **Teaching assignments** | Which teacher handles which offering (theory/lab) |
| **Faculty preferences** | What teachers asked for and the HOD's decision |
| **Workload templates** and **faculty workload allocations** | The template/ workload layer used by the HOD (see §17) |
| **Allocation settings** | Experience bands, preference limits, AI-for-faculty switch |
| **Academic cycle** | ODD / EVEN / BOTH |

### 8.3 Output data

| Entity | Purpose |
|---|---|
| **Generation runs** | Number, time, status of each generation |
| **Assignments** | The placed classes: day, start period, end period, section, subject, teacher, block type (theory/lab), lab |
| **Conflicts / unscheduled** | What could not be placed in a run, with reasons |

### 8.4 Supporting data

| Entity | Purpose |
|---|---|
| **Sessions** | Login tokens (which teacher is signed in) — persisted, so restarts do not sign everyone out |
| **Faculty passwords** | bcrypt hash per teacher |
| **Faculty results** | Past pass percentages recorded by teachers (year, semester, subject, percent, students) |
| **Mail log** | Who was emailed what subject by whom (bodies and passwords are never stored) |
| **Chat messages** | HOD ↔ teacher messages (deleted after 30 days) |

### 8.5 Relationships

```
Faculty 1───* TeachingAssignment *───1 SectionSubject *───1 Section
                                        │
                                        └───1 Subject ───* LabMapping *───1 Lab

Faculty 1───* Preference *───1 Subject
Faculty 1───* FacultyResult
Faculty 1───* ChatMessage (as sender or receiver)
Faculty 1───* LeaveRequest 1───* Substitution *───1 Faculty (the substitute)

GenerationRun 1───* Assignment (day, periods, section, subject, faculty, lab)
```

## 9. Where data lives

The department's data (teachers, sections, subjects, assignments, preferences, generated timetables, sessions, messages ...) is
**one document**. The program works on an in-memory copy of it, which is why everything that is tested locally behaves the
same in the cloud. Only *where the document is stored* differs.

### 9.1 File mode (default for one computer)

* The document is the file `SCEDULAR-BACKEND/data/scedular_local_db.json`, written after every change (via a temporary file
  and a rename, so a crash cannot leave half a file).
* It is **app-owned**: the start-up routine never re-imports seed data over your edits.
* If the file does not exist, a sample department is created (an empty one when `SCEDULAR_START_BLANK=true`).
* If the file exists but cannot be read, the program **refuses to start**, keeps a copy named `...unreadable-<time>` next to it
  and tells you so. It never silently starts from the sample data (which would later overwrite your real file).
* `SCEDULAR_DB_FILE` points to a different file (the tests use their own copy).
* **Which store is used (`STORAGE`, default `auto`):** on a computer the local file, **even if `DATABASE_URL` is in `.env`**; on Vercel PostgreSQL.
  `STORAGE=file` and `STORAGE=postgres` force one; `USE_LOCAL_DB=true` still forces the file. `/api/health` shows the active store.
  This lets one `.env` hold the Neon link while a laptop keeps using the local file.

### 9.2 PostgreSQL mode (cloud)

* Set `DATABASE_URL` (used automatically on Vercel; on another server also set `STORAGE=postgres`). If it is missing where PostgreSQL is required the API answers **503 NOT_CONFIGURED** with an instruction. `npm run db:push -- --yes` copies the local file to the database, `npm run db:pull -- --yes` the other way (sessions are never copied). The program creates two tables on the first request: `app_state` (the document, with a version
  number) and `faculty_photos` (profile pictures, kept out of the document because they are large).
* **Saved before answering.** A request that changes anything writes the document to PostgreSQL before its response is sent. If
  the save fails the user gets an error, never a false "done".
* **Several server instances.** Cloud hosts may run several copies of the server. Before each request an instance checks the
  version and reloads if another instance saved newer data. A save only succeeds if nobody saved in between; if two people
  save at the same moment the second gets a **409 "Someone else saved changes at the same moment, please try again"** and the
  first person's data is never overwritten.
* Database errors are reported (HTTP 500, "Your change could not be saved"), never hidden.
* The older per-table SQL code in `repo.ts` is switched off (`db/client.ts`); it was only partly used and could not even
  install on an empty database. The versioned-document design replaces it.

### 9.3 Practical consequences

* In file mode, do not run two backends against the same file (each keeps its own copy and the last writer wins).
* The data contains personal information (emails, phone numbers, password hashes, messages). It is git-ignored; do not share it.
* On Vercel the file system is read-only, so PostgreSQL mode is mandatory there.
* Multi-step changes (an Excel import, "Combine theory + lab", replace-all teachers) are all-or-nothing: if a step fails, every
  change made so far is undone.

---

# PART C — USER MANUAL

## 10. HOD manual

### 10.1 Signing in

1. Open the application address (locally `http://localhost:8443`).
2. Enter **Faculty ID** (`FAC-001` for the HOD) or the **registered email address**.
3. Enter the password. For an account that has no personal password yet, the shared bootstrap password applies
   (`SCEDULAR_AIDS` unless `SCEDULAR_MASTER_PASSWORD` is set). Once an account has a personal password, only that password works.
4. Press **Sign In**. You land on the Dashboard.

**Forgot your password?** Press *Forgot Password?*, enter your ID or email, press *Email me a code*, then type the
6-digit code from your inbox with a new password (at least 8 characters). Details in §18.3.

**Log out** with the button in the top bar (or from the menu drawer on a phone).

### 10.2 The screen layout

* **Left sidebar** (computer) — Dashboard, Assign Teachers, Teachers, View Timetable, Leave, Reports, My Profile, About.
* **Top bar** — menu button, SCEDULAR name, **gear** (Settings, HOD only), **bell** (messages with unread count), **Logout**.
* **Bottom-right button "SCEDULAR AI"** — opens the assistant.
* **Phone**: a bottom bar (Home, Assign, Teachers, Timetable, More) and a slide-in menu; see §12.

**Dashboard (liquid glass).** The page sits on a soft coloured mesh and every card is frosted glass. A header gives the greeting and cycle, a status bar shows readiness for the current cycle (its four semesters), and a collapsible **Today** row shows the day period by period (what is on now, what is next, classes that still need a substitute); the HOD can download **today's substitution sheet** from it (below). Older, more detailed description: A slim header (greeting, cycle, one line of inspiration, *Generate timetable* and *View*),
one strip with the live counts (sections, subjects, teachers, labs), then two columns. Left: **Substitutions · today** (who is on
leave today and every substitution assigned for today, in full), **Leave requests** (the letters waiting for you, with a link),
and the **Department briefing** (staffing, readiness, waiting leave letters, timetable). Right: a **month calendar** with a rose
dot on days with leave and an amber dot on days with a substitution; click a day to see exactly who and which classes. **Reminders** (like events in Google Calendar) sit below everything else: press *Add* (or *+ Reminder* on a calendar day), give a date, an optional time, a title and a note; they are listed soonest first (today on top, then later dates) and the calendar shows a blue dot on those days. Tick one off, delete it, and (HOD only) tick *Show to all teachers* to post a notice for everyone. *Generate timetable* appears here only while no timetable exists (it is a once-per-cycle task); afterwards it is under View Timetable. Each card is a white, 70%-see-through glass panel with its own coloured top edge. A quiet row
of shortcuts sits at the bottom. Counts come from the real data.

### 10.3 Settings (gear icon)

Settings has eight tabs: Semester setup, Sections, Syllabus, Lab rooms, Import, Class in-charge, Policy & cycle and Dataset. All changes are saved immediately and a green or red banner confirms the result.

#### Tab 1 — Semester setup
A read-out of each semester that has data: how many sections, subjects, offerings, how many offerings already have a
teacher and how many teacher choices exist. Use it as a checklist: a semester is ready when every offering has a teacher.

#### Tabs 2 and 3 — Sections and Syllabus
These were one tab and are now two: **Sections** (add / delete sections, class in-charge list) and **Syllabus** (the subjects of one semester at a time, with search, code, short name, type, theory/lab periods, credits, category, lab rooms, sections, staffing, and **Edit / Delete / Add subject / Import from Excel**). Choose a semester with the pills at the top (Sem I … VIII).

*Sections*
* **Add sections** — enter how many and press the button. New sections are named with the next free letters and are
  automatically offered every subject of that semester.
* **Delete a section** — the small ✕ on a section chip. This also removes the section's offerings and the teacher
  assignments attached to them; a confirmation dialog states this.
* A collapsible **Class in-charge** list is also here (the dedicated tab is easier; see below).

*Subjects*
* **Add subject** — fill code, name, delivery type (Theory / Theory + Lab / Lab), theory periods per week, lab periods
  per week, credits, category, and the lab rooms for the lab block. Leave "sections" empty to offer it to every active section.
* **Edit subject** — change any field; offerings update to match.
* **Delete subject** — removes it from all sections, the teacher assignments for it, and any preferences for it (the dialog tells you how many).
* The **short name** is what appears in the timetable grid (for example ARVR). If empty, the initials of the main words are used.

#### Tab — Lab rooms
The rooms themselves (add with an optional capacity, remove) and, for every subject that has lab periods, which room(s) can host it: click a room to switch it on or off for **all sections** of that subject. "A different room for a section" fixes another room for one section. Only subjects that are offered to a **running section** are listed, so semesters outside the current cycle (or with no sections, such as Year 1 here) never appear and never count as "missing". A subject with lab periods and no room for some section is marked "No room set" (and its semester !); the timetable cannot be generated until each has one. This tab is the only place for lab rooms: the older separate *Lab Management* page was removed (it used a course-level mapping that always said "no lab mapped"), and the Dashboard tile, Semester setup and Data Hub now open this tab. The *Lab rooms in use* figure in Reports counts lab periods in the generated timetable, so it reads 0 until a timetable exists. In the Syllabus tab a subject without a room shows a **set rooms →** link that opens this tab.

#### Tab 4 — Import (set a department up from Excel)
**Download template** is on top (one all-in-one workbook: sheets *Sections*, *Syllabus*, *Teachers*, plus a README and a Lists sheet of allowed values and your lab rooms). Below it are two tabs, each with the same three steps, **1 Sections → 2 Syllabus → 3 Teachers**:

* **Add** — keeps everything you have and adds your file. A row with an existing ID (teacher) or code (subject) updates that record.
* **Reset** — removes the current data of that type, then loads your file. The review screen says exactly what will go (for example "all 28 sections, with their teaching assignments and generated timetables"), and **your password must be entered again** before it runs. Resetting *Teachers* keeps the HOD account and removes the others with their logins, choices, assignments, results and messages; *Sections* removes every section with its offerings and assignments; *Syllabus* removes every subject with its offerings, assignments, teachers' choices and lab-room settings. Lab rooms themselves are never removed. Generated timetables are removed in all three cases (they would be stale); generate again.

How an import works (stage → fix → commit):
1. Upload the file. **Nothing is saved yet.** Every row is checked against your live data and the rules the rest of SCEDULAR needs.
2. The review window lists **exactly what is missing or wrong** ("Row 3 · Experience (years): Experience (years) is missing. A teacher cannot submit subject preferences without it.") in red (blocks the import) or amber (a warning), and each problem has a **Fix** button that jumps to the cell. Cells are edited right there (drop-downs for semester, type, category; a lab-room list); every edit is re-checked immediately. Rows can be removed or added.
3. **Import** is enabled when no row has an error (or tick "skip the rows that still have errors"). New teachers receive generated IDs and one-time passwords (shown once, CSV download).
4. A **readiness panel** then says whether the data is ready for teacher preferences and for timetable generation, and lists anything still missing (teachers without experience, lab subjects without a room, offerings still without a teacher). The same problem on many rows is one line ("67 teachers: experience is not set…"). Only what will really be scheduled counts: sections that are running and the subjects offered to them.

What is checked: *Sections* — semester I–VIII, one letter per row, duplicates, student count, class in-charge (warning if that teacher does not exist yet). *Syllabus* — semester, unique code (an existing code in the same semester is **updated**), type, periods that fit the type, lab rooms exist and are present when there are lab periods, sections exist, category, credits; a lab-only row that looks like the lab of a theory subject gets a warning to make it one integrated subject. *Teachers* — name, experience (required, because it decides the preference limits), email format and uniqueness (also inside the file), designation default; a Faculty ID in the file updates that teacher.

New teachers get the department's weekly limit (22 by default). Semester I is supported everywhere, so a department can be built from scratch for Semester I with Reset and its timetable generated.

#### Theory + lab are one subject (xT + yL)
A course such as AIES is one subject with theory and lab periods, and the teacher of a class handles **both** for that class. If a syllabus lists it twice ("AIES" and "AIES Laboratory"), the Syllabus tab shows a banner with each pair and **Combine** / **Combine all**. Combining turns the theory subject into one INTEGRATED subject (T + L), gives it **exactly the lab rooms that were set for the lab subject** (the rooms for every section and any room fixed for one section), makes the class's theory teacher take the lab too (or the lab teacher both, if only the lab had one), keeps teachers' choices of the lab as choices of the combined subject, deletes the separate lab subject and clears the old timetables (generate again). Integrated subjects are always assigned as one unit: the Assign screen, Auto-fill and the plan editor give theory and lab of a section to the same teacher.

#### Tab 5 — Class in-charge
Every section of every year in one place, grouped by year and semester. Pick the teacher from the drop-down next to
each section. It saves at once and is printed on that section's timetable PDF.

#### Tab 6 — Policy & cycle
* **Academic cycle (ODD / EVEN / BOTH)** — decides which semesters teachers see for preferences. Changing it asks for your password
  because it changes what every teacher sees.
* **Experience bands** — the preference policy (see §16). Edit the minimum/maximum experience, which years the band may
  pick from, and how many preferences are allowed in total and per year. Add or remove bands. Press **Save** to store.
* **Staffing weightage** — two numbers: *sections one teacher takes (average)*, default 3, which sets how many preferences each subject accepts (§16.4a); and *weekly limit per teacher*, default **22** periods, which is the cap used by assigning, auto-fill, the "need more teachers" check (§17.3a) and by the timetable solver. Saving a changed limit applies it to **every teacher**; one teacher can still be changed afterwards on the Teachers page.
* **SCEDULAR AI for Faculty** switch — turn the assistant on or off for teachers. When off, the SCEDULAR AI button disappears for
  teachers and the server refuses their questions. The HOD is never affected. (A fixed bug: the switch used to save only in memory and the knob was drawn out of place.)
* **Show other teachers' timetables to teachers** switch — when **on** (default) a teacher can open any teacher's timetable and
  download class and lab sheets. When **off**, each teacher still sees every class and lab timetable, but under *Faculty Timetable*
  only her own name, and downloads only her own timetable; the class and lab download buttons disappear and the server refuses those
  downloads. The HOD is never limited.
* **Department snapshot** — counts of faculty, bands and the current cycle.

#### Tab 7 — Dataset
The only two erase actions in SCEDULAR. Each card shows what it would remove *right now* (for example "131 preferences" or
"332 assignments · 2 timetable runs"), says what is kept, and asks for **your HOD password** before it does anything.

1. **Erase submitted preferences** — removes every subject choice teachers saved or submitted so the next round starts clean.
   *Kept:* teachers, logins, sections, syllabus, assignments and timetables.
2. **Erase allocation** — removes who teaches which section, the workload allocations and the timetables generated from them.
   *Kept:* teachers, logins, sections, syllabus and **all teacher preferences**.

Teachers, sections and the syllabus cannot be erased from here or from the Data Hub. The one bulk route is **Settings → Import → Reset**, which replaces them with a new file and asks for your password again. Otherwise they are changed
one at a time (Teachers page; Settings → Sections and Syllabus). The older "Delete all data", "Start a new dataset" and "Reset
allocation cycle" buttons and their server routes were removed for this reason.

### 10.4 Choosing the academic cycle
1. Settings → Policy & cycle.
2. Pick **ODD** (semesters III, V, VII) or **EVEN** (IV, VI, VIII), then confirm with your password.
3. Teachers immediately see only the chosen cycle's subjects in My Subjects.

### 10.5 Teachers page

The Teachers page lists everyone in the department with: name, designation, **current weekly load**, **average pass
percentage** (from results teachers recorded), **email** (editable inline), **login status** and actions.

* **Add teacher** — name, designation, experience, weekly limit, optional email. The system creates the next ID
  (`FAC-0nn`) and a **one-time password** shown once on screen (and emailed as a notice if an email is set).
* **Weekly limit for all teachers** — a bar above the table sets the same limit (default **22** periods a week) for everyone with *Apply to all*; the message names any teacher who already carries more than the new limit (move a section off them in Assign Teachers, or generation will fail). It also updates the policy setting, so the two never differ.
* **Weekly limit** and **email** are edited directly in the teacher's row. Experience can be corrected by the teacher (My Profile → Update experience).
* **Email column** — click the address to edit; the **envelope icon** opens the mail composer for that teacher. A teacher
  without an email shows "+ add email".
* **Key icon** — reissues a login: generates a new one-time password (or lets you type one). The teacher is notified
  by email if an address exists; the password itself is **not** in the notice, so hand it over yourself.
* **Create missing logins** — one press creates logins for everyone who has none; a panel lists them with a **CSV** download and copy buttons. The panel shows passwords only once — save the CSV before closing it.
* **Delete** — removes the teacher with their assignments, preferences, history, login and messages.

A load above the weekly limit is shown as over the limit. The timetable solver enforces each teacher's weekly limit, so such a teacher must be relieved before generating (see §14.6).

### 10.6 Assign Teachers (the core workflow)

Open **Assign Teachers**. Choose the semester with the pills at the top. Three tabs:

#### Tab "Preferences"
Shows every teacher choice for the semester, grouped by year and subject.
* **Approve** — accepts the choice. (If a teacher's choices were pre-approved, they are shown as approved already.)
* **Change** — you replace the teacher's choice with a different subject (the teacher is not asked to change it).
* **Remove** — deletes the choice.
* Status chips show Submitted / Approved / Rejected / Changes requested.

#### Tab "Assign"
(Picking teachers: the list is split into **Free teachers** — nothing assigned yet, with the preferences they submitted and the semester of each — and **Assigned teachers** — with how much room is left of their weekly cap and the subjects (with semester) they already carry. Those who chose the subject are listed first. Under "Teaching it", **Change teacher** moves a teacher's sections of the subject to another teacher in one step, with the same lists.)
A two-sided board: subjects on the left with a ring/percentage showing how much of the subject's demand is covered;
teachers on the right.
1. Click a subject. The right side lists teachers who chose it first, then others (open "other teachers" to assign anyone).
2. For a teacher, set **how many sections** to give (the counter limits to what is still open) and press **Assign**.
   The row previews the load: *current → after / limit*.
3. Assigned teachers appear under the subject with a **Remove** button.
4. The same teacher takes theory and lab of an offering unless you change that.
5. Use the filter to show *All / Open / Done* subjects.

The goal is every subject at 100%. Subjects nobody has chosen can still be assigned to anyone.

#### Tab "Templates & Auto-fill" — editable plan
**Build plan** proposes who takes how many sections of every open subject from the preferences. Then the HOD edits it: each teacher's share has a **− n +** stepper (workload = sections × periods per section, shown against the weekly cap across everything planned), teachers can be added from the free/assigned lists or removed, and the subject's remaining need moves with every change ("+2 still needed", "1 too many", "balanced"). **Fill the rest automatically** hands the uncovered sections to the teachers with the most room. **Assign** for a subject is enabled only when its sections add up exactly; after it the next subject opens. **Assign all balanced subjects** applies several at once. The staffing card above shows when more teachers are needed.

(Older description of this tab:)
* **Subject templates** — a dropdown (closed until opened) listing, per subject, the teachers' section counts; **Workload** per teacher; **Auto-fill from
  preferences** distributes sections to teachers according to approved choices and their remaining capacity.
* Run Auto-fill first, then fix the remainder on the Assign tab. (Details in §17.)

When all offerings are staffed, the semester shows as ready on the Dashboard / Semester setup.

### 10.7 Generating the timetable

1. Dashboard → **Generate Timetable**.
2. The page shows the **readiness** of each semester: curriculum, sections, faculty, labs, schedule config and
   allocation. Anything missing is listed under *missing items*; fix it first.
3. Press **Generate**. All *ready* semesters are scheduled together in one run. This usually takes under a minute on a laptop.
4. The result page shows status:
   * **GREEN** — every constraint satisfied; publish with confidence.
   * **YELLOW** — placed with warnings; read them.
   * **RED** — not possible; the conflict list says exactly which teacher / lab / section and what to change.
5. If something changes later (a new assignment), run Generate again. The latest valid run is what views and PDFs use.

### 10.8 Viewing timetables

**View Timetable** has three tabs: *Faculty Timetable*, *Class Timetable*, *Lab Timetable*. Pick the teacher, section or lab.
* Grid cells show the **subject acronym** (for example NLP, DBMS LAB), the section (or teacher) and the lab.
* A lab session spans its consecutive periods in one merged cell; tea and lunch are shown as break columns.
* Hover a cell for the full subject name.
* On a phone the grid becomes **one card per day** (§12).

### 10.9 Downloading PDFs

On the View Timetable page the **Download PDF** menu offers:

* **Class timetables** — Semester by semester, or *All semesters in one file*. One A4 page per section in the department's printed format.
* **Lab timetables** — one landscape page per lab room: when it is used, by which section, subject and teacher.
* **Teacher timetables** (HOD) — every teacher of a semester (or all teachers) in one file, one page each.
* **Master timetable (all sections)** — for each semester or all; landscape (HOD only).
* On the *Class Timetable* and *Lab Timetable* tabs a button downloads the selected semester's class sheets or the selected lab room.
* For a selected teacher on the *Faculty Timetable* tab, **Download PDF** gives that teacher's personal timetable.

What each PDF contains is described in §13.

**Substitution sheet (PDF).** On the Dashboard's Today row (and on the Leave pages) the HOD can download a PDF of every substitution for a day: one table with the absent teacher, period, section, subject, and who covers it, plus any class still uncovered.

### 10.10 Reports

**Reports** has five tabs:

1. **Overview** — key figures (staffing, teachers teaching, average load, timetable status with number of placements, lab rooms in use), staffing by semester, how loaded teachers are, the experience mix, teachers' choices per semester and the busiest teachers.
2. **Subject needs** — for each subject how many sections need a teacher, how many are covered, and how many teachers chose it. Notes such as "Nobody chose it" or "Assigned directly".
3. **Teacher workload** — weekly teaching load per teacher as bars. **Click a teacher to open everything about their work:** periods used and free (of the weekly limit, 22 by default), theory and lab periods, number of subjects and sections, experience, past pass average, the sections they are class in-charge of, a table of every subject they teach (semester, the section letters, periods per section, total periods), their load per day in the generated timetable (busiest day, lab periods), their subject choices with status, and warnings (above the limit, experience not set, timetable out of date). Teachers who are not teaching yet are in a collapsible list with the same details. A distribution of teachers by weekly periods and the capacity summary sit beside it.
4. **Absence** — how many periods each teacher did not attend because of approved leave: periods not attended up to today, periods still to come, periods that had no substitute, and the number of teachers on leave. Click a teacher for each leave (dates, days, periods, reason). A period here is a class from the timetable that fell on a leave day. *Export CSV* saves the table.
5. **Teacher results** — department average pass percentage, number of teachers with results, highest and lowest averages, and per-teacher detail by semester.
6. **Timetable analysis** — *When the department teaches* (a period-by-day heat grid), *Classes per day* and *Lab room use*.

Charts follow the department's navy/gold palette. Rings/bars are used instead of raw numbers wherever a proportion matters.

### 10.11 Email (HOD mail composer)

From the Teachers page, press the envelope next to a teacher.
1. **Write manually**, or type a short instruction (for example "remind to enter last semester's pass percentage") and press **Draft with AI** — the assistant produces a subject and body; you can edit both.
2. Choose login details: *None*, *Include login ID*, or *Include a NEW password*. A new password is generated and set **only after** the mail has actually been sent, so a failed send never locks a teacher out. Existing passwords cannot be emailed (they are stored as hashes).
3. Press **Send**. The mail log keeps who/what/when (not the body or password).
4. **Check mail setup** tests the SMTP login and tells you in plain words what is wrong (§18.5).

### 10.12 Messages (bell icon)

The bell shows a red badge with unread messages. Open it to see all teachers (search box at the top), with the last message
and an unread count. Tap a teacher to open the conversation; type and press Enter or the send arrow. Messages are plain
text up to 1000 characters, show the time and "seen", refresh every few seconds, and are **deleted after 30 days**. They are
**not encrypted** — do not use them for confidential matters. (More in §19.)

### 10.12a Leave and substitution (Leave in the menu)

When a teacher is away, the HOD needs a substitute for every class she would have taken. SCEDULAR does this in three steps.

1. **The teacher sends a leave letter** (*Leave → Request leave*). She picks the dates and a reason and presses *Show my classes*. The app reads her classes of those dates from the timetable and lists them **grouped by day and section**. Under each class are the teachers who are **completely free in that exact period** (no class of their own, not marked unavailable, not on leave, not already substituting). A teacher who has agreed in person can be ticked; the HOD will see the name. The standard formal letter is written for her and she may edit it. *Send to HOD* delivers it as a **message and as an email** to the HOD.
2. **The HOD assigns** (*Leave → Leave requests*). The request opens with the letter and every class under its section. Below each class the free teachers are shown in this order: those the teacher named, then those who teach that section, then (a click away) all other free teachers. One click assigns a substitute. Assigning approves the leave; the HOD can also approve or reject it, with a note. A teacher who is not free in that period cannot be assigned: the app refuses.
3. **The substitute is told.** Their dashboard shows *"You have a substitution class in place of Mr A: Mon 13 Oct, P2, section Y2-C · Subject"*, and they get a message and an email. If the HOD changes or removes the substitute, the old one is told.

**Scores.** The *Score & duties* tab shows leave days taken, periods covered for others, and two lists: *You worked for* and *Who covered for you*. When a teacher who once covered for A later asks for leave, A is marked in their list (the handshake icon: "you covered N periods for them"), so they can ask A in return. The HOD still makes every assignment. *Leave & cover record* gives the whole department's figures. The HOD can also record a leave on behalf of a teacher.

**The HOD takes her own leave** (*Leave → Take leave*): she picks the dates and a reason; no letter or approval is needed. Her classes appear grouped by section with the free teachers under each, and she assigns them herself. The HOD has no "request leave" tab.

Rules: dates cannot be in the past; a request covers up to 31 days; two open requests cannot overlap; a cancelled or rejected leave frees all its substitutes.

### 10.13 Using the AI assistant

Press **SCEDULAR AI** (bottom right). Use a **preset chat** (grouped buttons: Status, Teachers, Sections & timetable, Write & help) or ask in your own words, for example:

* "Which teachers are over their weekly limit?"
* "Show the timetable of Y4-A as a table."
* "Who teaches Natural Language Processing and how loaded are they?"
* "Draft an email to Mrs. Anitha thanking her for the NLP results."
* "Explain the workflow in six steps."

If you ask it to email someone it prepares an **editable draft card** with a Send button; nothing is sent until you press it. The
sparkle button next to the message box brings the presets back. (§20)

### 10.14a Profile pictures
Every teacher (and the HOD) can add a photo on **My Profile** ("Add a photo" / the camera button). The picture is cropped to a square and shrunk to 256 × 256 in the browser (about 20 KB), then stored with the teacher's record (a small JPEG/PNG/WebP, at most 300 KB). It shows in the sidebar and menu, in the Teachers list, and everywhere in the **chat**: the conversation list, the conversation header and next to each message. Teachers without a photo show their initials. The HOD can set or replace anyone's photo by clicking their round picture on the Teachers page. Any signed-in user can see a teacher's picture (that is what makes it appear in chat); only the owner or the HOD can change or remove it. API: `GET/PUT/DELETE /api/faculty/:id/photo`; the teacher lists carry only `photoAt`, never the image.

### 10.14 My Profile

Shows your details, an **Update experience** form and **Contact details** (email and phone). Your own email is used by Forgot Password.

### 10.15 About

A scrolling story page: how it works (eight steps that slide sideways as you scroll), the rules the solver never breaks, who does what, and the **Legacy** section crediting the developers.

### 10.16 A complete first-time setup, step by step

1. Sign in as `FAC-001`.
2. Review the sample department that comes with the app (teachers, sections, syllabus); edit or delete items one at a time as needed. To clear an old round later use Settings → Dataset (erase preferences / erase allocation).
3. Settings → Policy & cycle: select the cycle, review the experience bands.
4. Settings → Syllabus & sections: for each semester add sections, then add the syllabus.
5. Teachers: add every teacher, set emails, press **Create missing logins**, download the CSV.
6. Distribute IDs/passwords (CSV, mail, or print).
7. Wait for teachers to submit preferences; meanwhile set **Class in-charge** for all sections.
8. Assign Teachers → Preferences: approve; → Templates & Auto-fill: Auto-fill; → Assign: complete the rest.
9. Dashboard → Generate Timetable → GREEN.
10. View Timetable → Download PDF (class, master); teachers download their own.
11. Reports → check workload and subject needs; message teachers with last notes.

## 11. Teacher manual

### 11.1 Getting your login
The HOD gives you a **Faculty ID** (such as `FAC-031`) and a **one-time password** (like `kemu-4827`). You can also sign in
with your registered email instead of the ID. After your first sign-in, change your password using
*Forgot Password?* if you want a password you chose yourself (the HOD may also set one for you).

### 11.2 Signing in and the layout
* Sidebar: **Dashboard, My Subjects, Timetable, Leave, My Profile, About**.
* Top bar: bell (messages with the HOD) and Logout.
* Bottom-right: SCEDULAR AI (if the HOD has enabled it).

**Dashboard.** Greeting, your cycle, your allocation status (Not started / Draft / Submitted / Approved), a **Request leave** button,
**your substitutions today** ("Sangeetha takes it for you" or "you take it in place of …"), your leave requests, and a month calendar
with your leave and substitution days. If the HOD has limited timetable viewing, the Timetable page shows only your own name under
*Faculty Timetable* and offers only *Download my timetable*.

### 11.3 My Subjects (choosing preferred subjects)

1. Open **My Subjects**. The header shows your experience and the **limits that apply to you** (the experience bands, §16): for
   example "Max 2 preferences · 1 per year · Eligible years: Year 3, Year 4".
2. Choose a **semester** card (only the current cycle's semesters are active). The year is derived from the semester.
3. The subject list shows subjects you may pick. Tick up to your limit, in order of priority.
4. Save as **Draft** while thinking; press **Submit** when final.
5. After submission the HOD reviews. Once approved the page shows "Your preferences have been approved by the HOD. The HOD assigns your sections next. Your choices can no longer be edited."
6. You can see your history of past subjects and the demand for each subject.

Why limits exist: seniority decides which years a teacher may handle, and total workload must stay balanced.

### 11.4 Timetable
1. **Timetable** opens your own week automatically (teachers' own name is pre-selected).
2. Switch to *Class Timetable* or *Lab Timetable* to look at others.
3. **Download my timetable** gives a one-page landscape PDF: your weekly grid, a "Subjects handled" table (code, title, sections, periods per week) and your total periods.
4. You can only download your own personal PDF; class PDFs are available for every section.
5. On a phone you see one card per day with times, subject, section and room; today's card is highlighted.

### 11.4a Leave
*Leave* has three tabs: **Request leave** (dates, reason, your classes with the free teachers under each, the letter), **My leaves** (status, who takes each class, cancel) and **Score & duties** (leave taken, classes you covered, substitution classes coming up, who worked for whom). Substitution classes also appear on your Dashboard. See §10.12a for the full flow.

### 11.5 My Profile
* **Update experience** — corrects your years of experience (the HOD can also edit).
* **Contact details** — your **email** and phone. The email is needed for Forgot Password and for mails from the HOD. Each email must be unique.
* **Class results** — record the **pass percentage** of classes you took in earlier semesters: choose the semester and subject, enter the percentage (0–100), optionally students appeared and sections handled. You can delete an entry. The HOD sees the averages in Reports → Teacher results.

### 11.6 Messages
Press the bell. Your conversation is with the HOD only. Type your message and send. New messages from the HOD raise the badge.

### 11.7 Forgot password
1. On the sign-in page press *Forgot Password?*.
2. Enter your Faculty ID or the email on file → *Email me a code*.
3. Check your inbox (and spam) for "SCEDULAR password reset code" — valid 15 minutes, 5 tries.
4. Enter the code and a new password (8+ characters) → *Set new password*.
5. You get a second email saying your password was changed (without the password). If you did not do this, tell the HOD.
If you have no email on file, ask the HOD to add one or to reissue your login.

### 11.8 The AI assistant for teachers
Ask about your timetable, subjects, workload and results, how SCEDULAR works, or ask for help writing a message. Teachers
cannot see other teachers' results or email details, and cannot send email. If the button is missing the HOD has turned the assistant off.

## 12. Using SCEDULAR on a phone

The portal is built to be used on a phone browser (no app to install).

* **Bottom bar**, like a video app's, with four main pages and **More**. Teachers: Home, Subjects, Timetable, Profile. HOD: Home, Assign, Teachers, Timetable.
* **Menu drawer** — press ☰ (top left) or *More*. It lists every page, shows who is signed in and has **Log out**. Tap outside it or press Esc to close.
* **SCEDULAR AI button** floats just above the bottom bar; its chat window fits the screen.
* **Timetables** appear as day cards: for each day, each class with its time range, subject acronym and full name, section, and lab. Days with no class show "Free day".
* **Messages** open as a panel under the top bar.
* Wide tables elsewhere scroll sideways inside their card; the page itself does not scroll sideways.
* Tested at 390 × 844 (typical phone). Very small or very large screens fall back to the same layouts.

## 13. Printable outputs: what each PDF contains

### 13.1 Class timetable sheets (per section)
One portrait A4 page per section. Layout copied from the department's printed sheets for Years II, III and IV:

* Heading: college name, programme, "II YEAR / III SEM – ODD SEM (2026-2027)", "SECTION A" — set in **URW Bookman**.
* **Day × period grid**: Time/Day header, eight period columns with tea and lunch break columns (letters running down the break block), lab sessions merged across periods. Cells use subject acronyms.
* **Subject handling theory** table: code, course title, L, T, P, C, hours allocated, staff name.
* **Practicals** table: lab subjects and integrated-subject lab rows; the *Library* row prints without code/LTPC.
* **Class in-charge** line.
* If a section has many subjects the font/row heights shrink slightly so the sheet stays on one page.
* Year-specific geometry (title position, column boundaries, row heights) reproduces each printed document closely.

### 13.2 Teacher's personal timetable
Landscape A4: title with the teacher's name, designation and ID; the weekly grid showing subject acronym and section for each class; the **Subjects handled** table and the total periods per week.

### 13.2a Lab-room timetable
Landscape A4, one page per lab room: the weekly grid with the subject acronym, section and teacher of every session, and how many of the week's periods the room is used.

### 13.3 Master timetable (HOD)
Landscape A4, in this order:
1. **Cover** — title, academic year, semesters included, number of sections and placed periods, run number and time.
2. For each semester:
   * **Subject & faculty allocation** — rows = subjects, columns = sections, each cell = the teacher(s).
   * **One grid per working day** — rows = every section of the semester; columns = periods (and tea/lunch); each cell = subject acronym + teacher. This is the "master view": one page shows what every class in the semester is doing on that day.
   * **Faculty load** — periods per week for every teacher in that semester.

Teacher names are shown without titles (Mrs., Dr.) to save space in cells.

---

# PART D — INSIDE THE FEATURES

## 14. How a timetable is generated (the solver)

### 14.1 Inputs
For every *ready* semester: its sections, the subjects each section takes with weekly theory and lab periods, the
teacher of each offering, lab rooms for lab blocks, each teacher's weekly/daily limits and unavailable times, and the
period grid (40 periods per week).

### 14.2 Step 1 — pre-validation
Before any search the data is checked. Examples of what is refused: a duplicate or empty offering, an offering that points to an
unknown section/subject/teacher, a lab requirement that is not a multiple of the lab block length, a lab block that cannot fit the
period grid, a lab subject with **no laboratory mapped**, a duplicate teaching assignment, and a subject that needs more periods
than the assigned teacher's capacity. Problems are reported in plain language and generation stops with RED instead of searching blindly.

### 14.3 Step 2 — expansion
Each offering is expanded into **schedulable units**:
* a theory offering with 4 weekly periods becomes four one-period units;
* a lab block becomes one multi-period unit (consecutive periods, never crossing tea or lunch);
* lab teachers stay occupied for the whole block.

### 14.4 Step 3 — search
The engine is a **constraint-satisfaction** solver:
* It picks the **most constrained** unit first (fewest remaining possible slots — the "MRV" heuristic): labs and overloaded teachers go first.
* It tries slots in a deterministic order, places the unit, updates occupancy, and backtracks when a dead end appears (up to a large step budget).
* Because the same teachers and labs serve different years, all semesters are solved **in sequence with the earlier bookings carried forward**, so later semesters cannot collide with earlier ones.

### 14.5 Step 4 — repair and fallback
If sequential solving leaves units unplaced:
1. **Neighbourhood repair (LNS)** — unplace a small region around the problem and re-solve it with different choices.
2. **Joint solve** — a final attempt that solves all semesters in one search.
If all fail the run is RED with the exact unsatisfied requirements.

### 14.6 The rules (hard constraints)
All of these must hold in a GREEN result:

1. A section has at most one class in any period.
2. A teacher teaches at most one class in any period (including across different sections and years).
3. A physical lab hosts at most one section at a time.
4. Every offering gets exactly its weekly theory and lab periods.
5. Lab blocks are consecutive periods and do not cross the tea or lunch break.
6. Lab teachers stay for the entire block.
7. Teachers are only scheduled on subjects they are assigned.
8. A teacher's **daily** limit and declared unavailability are respected.
9. No class is placed in tea or lunch.
10. **Same subject per day cap:** at most 2 theory periods of one subject per day for a section; at most **3** for subjects with 6 or more weekly periods (heavy Year-4 subjects).
11. **Same period column cap:** a subject appears in the same period slot on at most 2 days a week for a section (avoids "always first period" patterns).
12. No partial or duplicate placement counts as complete.
13. Malformed data is rejected before the search.

**Weekly load and the solver.** The weekly limit is 22 periods per teacher by default (one department setting that is also stored on every teacher). The solver enforces it together with the **daily** limit: a teacher assigned more than their weekly limit cannot be placed, and generation reports it as a shortage. Relieve the teacher in Assign Teachers (or raise the limit) first.

### 14.7 Floating subject: Library
Library has no teacher conflict risk and exists only to use leftover free periods. It is **not** put through the main
search (that would make every section's week 100% full and slow the solver dramatically). After the main solve each
section receives its Library periods in empty slots. If no free slot exists the solver may swap a movable class to make room — every such swap is re-checked by the validator.

### 14.8 Output and storage
The result is stored as a **run** with its status, and as **assignments** (day, start/end period, section, subject, teacher,
block type, lab). Views and PDFs always read the latest valid run (GREEN or YELLOW).

### 14.9 Performance and limits
* Sample dataset: 28 sections, 984 placed periods, about 30–35 seconds on a laptop.
* A step budget (up to 2,000,000 backtracking steps per attempt, smaller budgets for the first sequential passes) prevents endless runs; exceeding it triggers the repair stages.
* **The search runs in a background worker thread** on a copy of the data, so the server keeps answering everyone else during the half minute it takes (this is tested: requests during a run were answered in well under 1.5 s). Only one generation runs at a time (a second request gets 409 "already being generated"). If a worker cannot be started the search runs in the main thread instead.
* **Time limit.** Every generation stops after `SOLVER_TIME_LIMIT_MS` (default 3 minutes, 45 seconds on Vercel) and says honestly what it could not place; it never runs for ever and never returns a wrong timetable.
* **Strategy** (when several semesters are generated together): (1) every order of the semesters is tried with a small search budget; (2) restarts with different tie-breaks (seeded, reproducible); (3) repair around the clashes (re-solve only the sections involved); (4) a last joint search. The search takes the first free room of a unit's room list (every second restart tries all rooms).
* **A fixed fault:** the quick placement used to accept a clash with a semester already placed and still report "complete"; clashes are now moved to "unscheduled" so a result can never hide one.
* On Vercel, the function limit is 60 seconds; for a whole department generate on a computer against the online database (VERCEL_DEPLOY.md §5). Generating is done about once per cycle.

## 15. How a timetable is verified

After the solver finishes, `validator.ts` — which shares no search state with the solver — **replays every placement** and re-computes:

* section double-booking, teacher double-booking, lab double-booking;
* weekly requirements per offering (theory and lab counts);
* daily limit per teacher and the per-day / per-period caps per subject and section;
* lab block contiguity and break crossing.

Only if the replay finds nothing is the run labelled GREEN. Conflict kinds the validator can report:
`LAB_CONFLICT`, `WEEKLY_REQUIREMENT_UNSATISFIED`, `DAILY_SUBJECT_LIMIT_EXCEEDED`, `COLUMN_SUBJECT_LIMIT_EXCEEDED`, `FACULTY_SHORTAGE` (daily capacity), plus section/teacher clash types.
The design principle: **the solver may be clever, the validator must be boring and independent.**

## 16. Teacher preferences and the experience policy

### 16.1 Why a policy
Senior teachers are expected to handle senior years; every teacher should get a fair, balanced load. The HOD controls these rules in Settings → Policy & cycle.

### 16.2 Default bands (editable)

| Band | Experience | Years a teacher may choose from | Max preferences | Max per year |
|---|---|---|---|---|
| Junior | 0 – 9 years | Year 1, Year 2 | 1 | 1 |
| Mid-level | 10 – 13 years | Year 2, Year 3, Year 4 | 2 | 1 |
| Senior | 13+ years | Year 3, Year 4 | 2 | 1 |

(Year 1 is not part of this build's timetables, so in practice juniors choose Year 2.) The *senior threshold* is 13 years.
A teacher's band is chosen from their **allocation experience** (years). The settings page shows the exact limits that apply to each teacher.

### 16.3 What the teacher sees
Locked years are greyed out; counters show how many choices remain; submitting beyond the limit is refused with a message.

### 16.4 Subject-specific minimums
The policy can also hold per-subject minimum experience rules (a map subject → years). They are enforced on submission.

### 16.4a Subject quota (the weightage rule)
Each subject accepts only as many teachers as it actually needs:

```
teachers wanted = ceil( sections that offer the subject  /  average sections one teacher takes )      (average = 3 by default)
```

Example: Mathematics is taught in 10 sections at 4 periods each, so the department needs 40 periods of it. At an average of 3 sections per
teacher it wants ceil(10 / 3) = **4 teachers**; a fifth teacher cannot choose it. Twelve sections want 4 teachers, three sections want 1.

* A choice takes a slot when it is **Submitted or Approved** (a draft does not hold a slot).
* When all slots are taken the server refuses further choices with `SUBJECT_QUOTA_FULL` and the teacher's card shows **Full**; until then it shows
  "2 of 4 teachers chosen · 2 slots left".
* The HOD sees "chosen of wanted" per subject in Assign Teachers → Preferences (amber when more teachers chose it than it needs).
* The HOD is not bound by the quota when assigning: any teacher may still be given sections of a subject nobody chose.
* The average is a department setting: Settings → Policy & cycle → **Staffing weightage → Sections one teacher takes (average)**.

### 16.5 Statuses
`DRAFT` → `SUBMITTED` → `APPROVED` (or `REJECTED` / `CHANGES_REQUESTED` by the HOD). Approved choices lock for the teacher.

## 17. Workload templates and auto-fill

### 17.1 The idea
A teacher's workload for a semester is expressed as *how many sections of which subject*. For example: "Natural Language Processing × 3 sections". Each
section of a theory-plus-lab subject adds both its theory and lab periods to the teacher's weekly load.

### 17.2 Subject templates
For each subject the app derives the **template** of the department: total sections that need staffing minus sections already
covered. The HOD fills the remaining demand by choosing teachers and counts so that the sum equals the subject's section count.

### 17.3 Auto-fill
Auto-fill walks through subjects and gives open sections to teachers who **chose** the subject (submitted or approved; approved first, then by the teacher's own ranking), always choosing the least-loaded eligible teacher and tracking a running "virtual load" against the weekly limit. Sections nobody can take are left open for manual assignment.

### 17.3a Staffing check: "Need more teachers"
At the top of Assign Teachers a **staffing card** compares the work with the people. Closed, it is one line: a coloured dot, "Teachers are enough for this cycle" (or "Need N more teachers") and a summary such as "68 teachers · at least 40 needed · 1120 of 1120 periods assigned". Press it to open the details:

* **Figures** — weekly demand, teacher capacity (teachers × weekly limit), minimum teachers, and spare capacity (or the shortfall), with a bar of assigned periods against capacity.
* **Semester by semester** — sections, weekly periods, minimum teachers, assigned, open and a status for each running semester, plus a total row.
* **Who can take more** (loaded when opened) — teachers with free time, teachers with no classes yet, the average load, how many are at or above the limit, the teachers with most free time, and about how many more sections the free time could absorb.
* **Subjects without a teacher** — the open ones (or all subjects), with teachers chosen against teachers wanted.
* **What to do** — suggestions that apply (add teachers or raise the limit, use Auto-fill, move a section off an overloaded teacher).

```
weekly demand  = sections x subjects x periods per section (theory + lab), for the current cycle
a teacher      = at most 22 periods a week (default; Settings -> Policy & cycle, or Teachers -> Weekly limit for all teachers)
teachers needed = ceil( demand / 22 )
```

Worked example: 12 teachers, 3 theory subjects, 12 sections, 4 periods each → demand = 12 × 3 × 4 = **144** periods. At 22 per teacher that needs
ceil(144 / 22) = **7** teachers, so 12 teachers are enough (green). With only 4 teachers the capacity is 88, the
shortfall is 56 periods, and the card says **"Need 3 more teachers"** (amber).

The card also takes **what is already assigned** into account: it adds up the free room left in each teacher's weekly limit and compares it with the
periods still unassigned, so after assigning or auto-fill the message always reflects what is really missing. The same figures are available from `GET /api/hod/staffing`.
The weekly limit is also what the assign board's load bars use; assigning past it needs an explicit override, and auto-fill never goes past it.

### 17.4 Manual assignment preview
Before assigning, each row shows *current load → after / limit*. Because exceeding the limit is permitted by the department,
the preview informs but does not block.

### 17.5 After assigning
Each assignment creates teaching-assignment records (theory and lab) for the chosen sections. The Reports → Teacher workload tab reflects the new loads at once.

## 18. Email, password changes and "Forgot password"

### 18.1 Configuration
Mail uses Gmail SMTP through nodemailer. Set in `SCEDULAR-BACKEND/.env`:

```
SMTP_USER=your.address@gmail.com
SMTP_PASS=<16-letter Google App Password>
SMTP_HOST=smtp.gmail.com     (optional)
SMTP_PORT=465                (optional)
MAIL_FROM="SCEDULAR <your.address@gmail.com>"   (optional)
```

An **App Password** is created in Google Account → Security → 2-Step Verification → App passwords. It only works while 2-Step
Verification is on for that account and the user who created it is the `SMTP_USER`. Spaces in the pasted password are ignored.
If you turn 2-Step Verification off, Google deletes all App Passwords — create a new one.

### 18.2 Modes
| `MAIL_TRANSPORT` | Meaning |
|---|---|
| (unset) | Real sending if `SMTP_USER` and `SMTP_PASS` exist, otherwise "not configured" |
| `json` | Capture mails in memory (tests and demos); nothing is delivered |
| `fail` | Always fail (tests) |
The test suite forces `json`, so tests never send real mail.

### 18.3 Forgot password
* `POST /api/auth/forgot` — body `{ identifier }` (Faculty ID or email). If the account exists *and* has an email on file, a 6-digit code is emailed.
  The reply is always the same generic message, so it cannot be used to discover who has an account. A new code cannot be requested within 60 seconds.
* The code is stored **hashed**, expires after 15 minutes and allows 5 attempts.
* `POST /api/auth/reset` — body `{ identifier, code, newPassword }` (password ≥ 8 characters). On success the password is changed and a notice is emailed.
* Codes live in server memory. A server restart (or, on serverless hosting, a request landing on another instance) invalidates pending codes; just request a new one.

### 18.4 Notices on every password change
A short notice (**never containing the password**) is emailed to the teacher when:
* they reset their password via Forgot password;
* the HOD creates their login, reissues a login, or sets a password;
and the HOD's composer email with a new password naturally contains the new password because that is its purpose.
Notices are best-effort: a mail problem never blocks the change. A teacher without an email address receives nothing.

### 18.5 Checking and diagnosing
`POST /api/hod/mail/check` (button *Check mail setup*) logs in to the mail server and reports in words:
* "Sending works" — all good.
* "Google rejected the login…" — wrong address, wrong or deleted App Password, or 2-Step Verification off. Common causes: a typo in the Gmail address, using the normal password, or an App Password created under a different Google account.
* Network/TLS messages — check the internet connection and never set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## 19. Messaging (bell icon)

### 19.1 Design
A small chat between the HOD and teachers — like a minimal messaging app inside the notification bar.
* Teachers can write **only to the HOD**; the HOD can write to any teacher.
* Plain text, up to 1000 characters. Times are shown in the viewer's clock; your messages show "seen" once read.
* Unread counts appear as a badge on the bell (refreshed every 20 seconds; an open conversation every 8 seconds, so it is near-real-time but not instant).
* **No encryption** (by design for this release). Treat it as department-internal notes.
* **Auto-delete after 30 days:** every read or send first removes messages older than 30 days.
* Deleting a teacher deletes their messages.

### 19.2 Endpoints
`GET /api/messages/threads`, `GET /api/messages/unread`, `GET /api/messages/thread/:otherId` (opening marks incoming as read), `POST /api/messages {toId, text}`.

### 19.3 Storage
Local mode: `messages` in the JSON file. Postgres: table `chat_messages` (indexed by sender/receiver).

## 20. The AI assistant

### 20.1 How it works
The assistant is a **tool-using language model**. It does not memorise project data. For every factual question it calls
**read-only tools** that query the live database *as the signed-in user*:

| Tool | Returns |
|---|---|
| `project_overview` | Counts and the latest run (status, conflicts) |
| `find_faculty`, `faculty_detail` | Teachers, planned load, teaching list, weekly timetable (email/phone for the HOD only) |
| `find_subjects` | Subjects with the sections that offer them and their teachers |
| `list_sections`, `section_timetable` | Sections with in-charge; a section's weekly grid |
| `timetable_problems` | Conflicts and unscheduled items |
| `workload_report` | Teacher load vs limit, offerings without a teacher |
| `teacher_results` | Pass percentages (teachers see only their own) |
| `mail_history` (HOD) | Recent mails (no passwords) |
| `draft_email` (HOD) | Prepares a draft — never sends |

The model is told today's date, who it is talking to, how SCEDULAR works, to show times on a 12-hour clock, that a load above the weekly limit must be relieved before generating, and never to reveal passwords.

### 20.2 Safety
* Teachers cannot read other teachers' results, emails or phones, and cannot create drafts.
* **Emails are drafts only.** The HOD edits and presses Send on a card; that uses the normal `/hod/mail/send` route, so the mail log, new-password rules and permissions all apply.
* The HOD can switch the assistant off for teachers (Settings → Policy & cycle). Then the button disappears for teachers and the server answers 403.

### 20.3 Preset chats
HOD: Status (project summary, timetable problems, subjects without a teacher), Teachers (heaviest/lightest workloads, best pass percentages), Sections & timetable (class in-charges, Y4-A timetable), Write & help (results reminder, thank-you, workflow explanation).
Teachers: My work (timetable, subjects, workload), My results, Help (picking subjects, workflow, message to HOD).

### 20.4 Limits
The language-model API key (Groq) is on the free tier in the sample setup: roughly 7,000 tokens per minute. Heavy questions or several users at once may wait 10–25 seconds (the server retries automatically) or fail with a "not reachable" message. A paid tier removes the limit. If no key is set the assistant reports it is unavailable.

---

# PART E — OPERATIONS

## 21. Running locally and deploying to Vercel

### 21.1 Requirements
* Node.js 18 or newer (the build was developed on Node 24) and npm.
* A modern browser (Chrome, Edge, Firefox, Safari; phones included).
* Optional: Docker (for a local Postgres), a Gmail account with an App Password (mail), a Groq API key (assistant).

### 21.2 First run on one computer

```bash
# 1. backend
cd SCEDULAR-BACKEND
npm install
cp .env.example .env          # then edit .env (see §22)
npm run dev                   # starts on http://localhost:8090  (tsx watch)

# 2. frontend (second terminal)
cd SCEDULAR-FRONTEND
npm install
npm run dev                   # starts on http://localhost:8443  (Vite)
```

Open `http://localhost:8443`. Sign in as `FAC-001`. With no `DATABASE_URL` the app runs in local-JSON mode and creates the
sample department on first start. Health check: `http://localhost:8090/api/health` → `{"ok":true}`.

Starting empty: set `SCEDULAR_START_BLANK=true` in `.env` **before the very first start** (no data file yet). There is no in-app button that wipes teachers or the syllabus.

### 21.3 Production build of the frontend
```bash
cd SCEDULAR-FRONTEND && npm run build     # output in SCEDULAR-FRONTEND/dist
cd SCEDULAR-BACKEND  && npm run build && npm start   # compiled server from dist/
```

### 21.4 Local Postgres (optional)
`docker compose up -d` at the repository root starts Postgres 16 (database/user/password all `scedular`, port 5432). Then set
`DATABASE_URL=postgresql://scedular:scedular@localhost:5432/scedular` and remove `USE_LOCAL_DB`. Tables are created automatically.

### 21.5 Deploying to Vercel
Full instructions: **`VERCEL_DEPLOY.md`**. In short:

1. Create a Postgres database (Neon) and copy its connection string.
2. Import the GitHub repository in Vercel (root directory = repository root, framework preset = Other).
3. Add the environment variables from §22.
4. Deploy; check `/api/health`; sign in as `FAC-001`.

What `vercel.json` does:
* installs both projects, builds only the frontend (the API function is compiled by Vercel itself);
* serves `SCEDULAR-FRONTEND/dist` as the site;
* routes `/api/*` to the single serverless function `api/index.ts` (1 GB memory, 60 s limit) and every other path to `index.html` (single-page app);
* bundles the backend source, the font files and the pdfkit data files into the function;
* adds security headers (no sniffing, no framing, strict transport security, referrer policy), long caching for hashed assets and `no-store` for API responses.

**Status:** cloud mode is covered by automated tests that run the whole application against an in-memory PostgreSQL (first start, saving, a second server instance, conflicts, restart, errors). It has not yet run against a real hosted database such as Neon, so do one rehearsal deploy before real use (§26).

## 22. Environment variables

| Variable | Used for | Default / note |
|---|---|---|
| `PORT` | Backend port (local) | 8090 |
| `STORAGE` | `auto` (computer → file, Vercel → PostgreSQL), `file`, `postgres` | `auto` |
| `SCEDULAR_SITE` | `true` makes `auto` behave like a website (PostgreSQL) on your own server | unset |
| `USE_LOCAL_DB` | Older switch: force the JSON database | unset |
| `DATABASE_URL` | Postgres (Neon) connection string | used on Vercel; ignored on a computer unless `STORAGE=postgres` |
| `FRONTEND_ORIGIN` | Website address(es) allowed to call the API (enforced on a live site once set) | unset |
| `SOLVER_TIME_LIMIT_MS` | Longest a timetable search may run | 180000 (45000 on Vercel) |
| `VITE_BASE_PATH` | Frontend build: site lives under a path such as `/scedular/` | `/` |
| `PG_POOL_MAX` | Postgres pool size | 5 (use 3 on serverless) |
| `SCEDULAR_DB_FILE` | Path of a different JSON database (tests) | `data/scedular_local_db.json` |
| `SCEDULAR_START_BLANK` | First start with an empty dataset | off |
| `SCEDULAR_MASTER_PASSWORD` | Bootstrap password for accounts with no personal password | `SCEDULAR_AIDS` |
| `SMTP_USER`, `SMTP_PASS` | Gmail sender and App Password | mail disabled if empty |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | Mail details | smtp.gmail.com, 465 |
| `MAIL_TRANSPORT` | `json` capture / `fail` (tests, demos only) | unset |
| `GROQ_API_KEY` (or `GROK_API_KEY`, `XAI_API_KEY`, `LLM_API_KEY`) | Language-model access | assistant unavailable if empty |
| `LLM_PROVIDER`, `GROQ_MODEL`, `GROQ_API_BASE` | Model selection | groq, `qwen/qwen3.8-27b`, Groq URL |
| `SOLVER_INLINE` | `true` runs the timetable search in the main thread instead of a worker (debugging only) | off |
| `TRUST_PROXY` | `true` when the server sits behind a proxy, so sign-in limits use the real client address (set automatically on Vercel) | off |
| `CORS_ORIGINS` | Extra allowed browser origins (comma separated; `/regex/` allowed) | localhost and `*.vercel.app` always allowed |
| `VITE_API_URL` | Frontend: API address including `/api` (baked in when the site is built) | local dev uses `http://localhost:8090/api`; set it on the Vercel web project |

**Never** set `NODE_TLS_REJECT_UNAUTHORIZED=0` anywhere real: it silently turns off certificate checking for every outgoing connection (mail, AI, database).
Never commit `.env`; it is git-ignored.

## 23. Testing

### 23.1 What exists
Thirty test files under `SCEDULAR-BACKEND/tests` (plus `setup/isolate-db.ts` and a scrubbed sample database in `tests/fixtures/`). At the time of writing **214 tests pass**, with none skipped or failing. The two script-style files (`stage6.test.ts`, `facultyAllocationPolicy.test.mjs`) are run by `npm test` directly and are excluded from vitest.

| File | What it protects |
|---|---|
| `core_workflow`, `rebuild_e2e`, `phase1_reconciliation` | Core data flow, reconciliation after resets |
| `phase2_auth` | Login, sessions, roles, per-teacher passwords, deleted teachers cannot log in |
| `phase3_faculty_allocation` | Preferences, experience policy, cycle gating |
| `phase4_5_hod_review_allocation` | HOD review, change/remove, section allocation |
| `phase5_workload_templates`, `hod_assign` | Templates, workload, assign board, auto-fill |
| `blank_dataset_e2e` | Whole product from an **empty** dataset: setup → logins → preferences → assignment → generation → PDF → restart survival |
| `teacher_extras` | Results, contact email, HOD mail, new password only after a successful send |
| `password_reset` | Forgot password flow, code checks, change notice never contains the password |
| `messages` | Delivery both ways, unread counts, teacher→teacher refused, 30-day deletion |
| `assistant` | Auth required, input checks, HOD switch disables teacher access |
| `bulk_import` | Template, row-level problems, fixing and committing for sections / syllabus / teachers; teacher replace-all needs password + REPLACE |
| `scratch_sem1_import` | From an empty dataset, Semester I only through Excel imports → preferences → approval → assignment → GREEN timetable → PDF |
| `plan_assign` | The editable plan must cover the open sections exactly; change teacher; picker data |
| `merge_lab` | Theory + lab pairs become one subject, one teacher per class, timetable regenerates |
| `api_security` | Every data route answers 401 without sign-in; teachers can read but not write; teachers cannot see each other's email or phone |
| `postgres_mode` | Cloud mode on an in-memory PostgreSQL: first start, saved-before-answer versions, a second instance, conflict refusal, restart, database errors |
| `solver_worker` | Starts the real server and proves it keeps answering while a timetable is generated off the main thread |
| `rate_limit` | 8 failed sign-ins lock an account for 15 min; forgot-password mail limit; reset codes stored with the data; sessions expire after 30 days |
| `atomic` | A multi-step change that fails half-way leaves no trace |
| `teacher_workload` | The per-teacher workload report adds up (subjects, sections, periods, timetable load) and is HOD only |
| `staffing` | Quota and "need more teachers" arithmetic (12 sections × 3 subjects × 4T example) and the server refusing a choice once a subject is full |
| `data_erase` | The two erase actions are HOD + password only, keep what they must keep, and no bulk-erase routes exist |
| `photos` | Set own picture, others can see it, only HOD changes someone else's, size and type limits, lists never carry image data |
| `exports` | Teacher PDF only for self (HOD any), master PDF HOD only, valid PDF bytes |

### 23.2 Isolation (important)
`vitest.config.ts` runs `tests/setup/isolate-db.ts` first. It copies a **frozen sample database** (`tests/fixtures/sample_db.json`, with emails, phones, passwords and messages removed) to a private temporary file, points
`SCEDULAR_DB_FILE` at it, resets passwords to the defaults, and forces `MAIL_TRANSPORT=json`. Therefore:
* tests never change your real data;
* tests never send real email;
* tests do not depend on the real data, so editing, merging or erasing real data never changes their results.

### 23.3 Running
```bash
cd SCEDULAR-BACKEND
npx vitest run                   # everything
npx vitest run tests/exports.test.ts     # one file
npx tsc --noEmit                 # type-check
```
Frontend: `npx tsc --noEmit` and `npx vite build` in `SCEDULAR-FRONTEND`.

### 23.4 What was verified by looking, not by tests
Layout checks were done in a headless Chrome at desktop and phone sizes (About page, mobile navigation, day cards, message panel, PDF pages compared side by side with the printed originals for Years II, III and IV page 1).

## 24. Backups, resets and data safety

* **Backup (local mode):** copy `SCEDULAR-BACKEND/data/scedular_local_db.json` while the backend is stopped (or at least idle). That one file is the entire database.
* **Restore:** stop the backend, replace the file, start again.
* **Before risky operations** (erasing preferences or allocation, big Excel imports) make a copy.
* **Erase submitted preferences** and **Erase allocation** (Settings → Dataset) each need your HOD password and cannot be undone. They never touch teachers, logins, sections or the syllabus.
* There is no bulk-delete for teachers or the syllabus anywhere in the app or the API.
* **Postgres:** use the provider's snapshots/backups (Neon offers point-in-time restore).
* **Personal data:** the data file contains emails, phone numbers, password hashes and messages. It is excluded from Git. Do not email it or upload it publicly.
* **Dev-server caveat:** `npm run dev` uses `tsx watch`, which restarts the server when files change; scripts that edit the data file while the server is running can be overwritten by the server's in-memory copy. Stop the server before running such scripts.

## 25. Troubleshooting guide (FAQ)

### Sign-in
**"Invalid Faculty ID or password."** Check the ID (`FAC-0nn`) or use the registered email. A teacher with a personal password cannot use the master password. Ask the HOD to reissue (Teachers → key icon) or use Forgot Password.

**The HOD password is not accepted.** The HOD's personal password was set earlier; if it was changed the master password no longer works. Use Forgot Password (needs the HOD's email on file) or have someone with file access reset it.

**Forgot Password says a code was sent but nothing arrives.** The account may have no email on file (the message is deliberately generic). Check spam; ask the HOD to verify the address; confirm mail setup works (*Check mail setup*).

**"That code is wrong or has expired."** Codes last 15 minutes and 5 attempts; the server may also have restarted. Request a new one (wait 60 seconds between requests).

### Mail
**"Google rejected the login."** The Gmail address in `SMTP_USER` must be exactly the account that created the App Password; the App Password must be current (turning 2-Step Verification off deletes it); spaces in it are fine. A typo in the address is the most common cause.

**Mail composer says mail is not configured.** `SMTP_USER`/`SMTP_PASS` are empty. Restart the backend after editing `.env`.

**A teacher shows "no email".** Add it on the Teachers page (click "+ add email"). Emails must be unique.

### Setup and assignment
**A subject does not appear for teachers.** It belongs to a semester outside the current cycle, or is not offered to any section. Check Settings → Policy & cycle and Semester setup.

**I cannot assign more sections.** The counter is limited to the sections still open for that subject. Remove an existing assignment first, or delete a section you no longer run.

**A new section has no subjects.** Subjects are offered to new sections automatically when the subject exists for that semester; if you added the section before the subject, edit the subject and tick the section.

### Generation
**"Semester … is not ready for generation."** The message lists missing items (no curriculum, no sections, no teacher for some offering, no lab mapped, etc.). Fix those and retry.

**RED result.** Read the conflict list: it names the section/teacher/lab. Typical causes: a lab subject with no lab mapped; one teacher assigned far more periods than the week allows; a lab block longer than the free run left in the day.

**It takes very long.** The sample data needs about 30 seconds. If it is far slower, a very tight dataset (a teacher with almost every period) forces extensive search. Reduce that teacher's assignments or split the load.

**Library is missing in some section.** A section with no free period left cannot receive Library (every period is taken by real classes).

**A teacher shows more than the weekly limit.** That happens through an explicit HOD override on the Assign screen, or when the limit is lowered below an existing load. The solver will not place more than the limit, so move a section to a teacher with room (the staffing card shows how much room there is) before generating.

### PDFs
**The PDF looks different from the printed sheet.** Names come from the database ("Mrs.MAHALAKSHMI" vs "MRS.S.MAHALAKSHMI"), and subject titles use the case stored in the syllabus. Edit the teacher/subject text to match. Fonts: if `assets/fonts` is missing the PDF falls back to Times.

**Download fails with 401/403.** Personal and master PDFs need you to be signed in; teachers can only fetch their own; the master is HOD-only.

**"No timetable has been generated yet."** Generate first.

### Messages and assistant
**The bell does not open / shows an error.** Restart the backend (the message routes are new); reload the page. The panel is drawn above the top bar; if it still misbehaves, check the browser console.

**The assistant says it is unavailable.** `GROQ_API_KEY` is missing or the service is unreachable; or, for teachers, the HOD turned it off.

**The assistant is slow or errors during busy times.** Free-tier rate limit. Wait a moment or upgrade the key.

### Phones
**The bottom bar hides content.** Pages leave room for it; if a custom page does not, add bottom padding.
**Timetable looks empty on a phone.** Choose the teacher/section/lab at the top; the day cards appear after selection (teachers' own name is pre-selected).

### Saving, limits and busy messages
**"Someone else saved changes at the same moment" (409).** Cloud mode only. Two people changed data at the same instant; the first save won and yours was refused so nothing was overwritten. Reload the page and repeat your change.

**"Too many failed sign-in attempts" (429).** 8 wrong passwords for one account lock sign-in from that address for 15 minutes. Wait, or ask the HOD to reissue the login. "Forgot password" is limited to 5 mails per 15 minutes per account.

**"A timetable is already being generated" (409).** Only one generation runs at a time. Wait for it to finish (about half a minute).

**"Your change could not be saved" (500).** The database could not be written. Nothing was changed. Try again; if it repeats, check the database service.

**"The database file ... could not be read".** The data file is damaged. The program refused to start and kept a copy named `...unreadable-<time>`. Restore a backup of the data file.

### Servers
**Port already in use.** Another copy is running. Stop it (find the process listening on 8090 / 8443) before starting a new one; two backends on one data file overwrite each other.
**`npm run dev` restarts constantly.** `tsx watch` restarts when files change, including the data file if it lives inside a watched folder.

## 26. Known limitations and risks

Honest list of what to keep in mind before relying on the system in the wild:

1. **Real hosted database not yet tried.** Cloud mode passes its tests on an in-memory PostgreSQL, but a rehearsal deploy (Vercel + Neon) is still the first thing to do before real use.
2. **Whole-document storage.** In cloud mode every change saves the whole department document (about 0.5 MB). That is fine for one department, but it is not meant for hundreds of simultaneous editors; simultaneous saves are protected (409) but the second person has to repeat their change.
3. **Generation on a slow host.** The search runs off the main thread, but on a small cloud function it may exceed the host's time limit (60 s on Vercel). Mitigation: generate locally, or by semester groups.
4. **Sign-in limits are per server instance.** The lock after 8 failed attempts is kept in each server's memory, so with several cloud instances an attacker gets a few more tries; it stops casual guessing, not a determined attack.
5. **Default secret.** `SCEDULAR_AIDS` (bootstrap password) is a default in the code. Set `SCEDULAR_MASTER_PASSWORD` in production.
6. **Messages are not encrypted** and are visible to administrators with database access.
7. **AI service dependence.** The assistant needs an external API key and internet; the free tier is rate-limited, and what you ask it is sent to that service. The core scheduling features do not depend on it.
8. **Not modelled:** elective baskets, lab batches that split a class, classrooms for theory, combined classes, and teachers shared with other departments. There is also no hand-editing of a generated timetable yet (the Edit Timetable page is a placeholder): to change it, change the assignment and generate again.
9. **Sample data.** The built-in roster/curriculum is for one specific department. A different institution should start from a blank install (`SCEDULAR_START_BLANK=true`) and build everything in the app.
10. **Printed layout is approximate to the pixel.** It follows the department's three printed documents very closely but is not a byte-for-byte copy; staff names and title case come from the database.
11. **Personal data in the repository history.** Earlier commits on the public GitHub repository contain earlier copies of the data file. If that is a concern, make the repository private or rewrite its history.
12. **Workload templates** (the older template pages) are stored in the document like everything else; they are not separate database tables.
13. **File mode** supports one backend process only.

## 27. Maintenance checklist and roadmap

### 27.1 Every semester
- [ ] Confirm the academic cycle.
- [ ] Add new sections; check each subject is offered to them.
- [ ] Add/remove teachers; confirm emails; issue logins for new ones.
- [ ] Remind teachers to submit preferences (mail or message).
- [ ] Approve preferences; Auto-fill; complete assignments (every subject at 100%).
- [ ] Set class in-charges.
- [ ] Generate; require GREEN; review Reports.
- [ ] Download class PDFs and the master; share teacher PDFs.
- [ ] Back up the data file.

### 27.2 Occasionally
- [ ] Rotate the Gmail App Password and the Groq key if exposed.
- [ ] Remove old runs if the data file becomes large.
- [ ] Update dependencies (`npm outdated`) and re-run the tests.
- [ ] Review who still has an account; delete leavers.

### 27.3 Suggested improvements
1. Login rate limiting and account lock-out after repeated failures.
2. Store reset codes in the database (so they survive restarts and multiple instances).
3. Run generation as a background job with progress and cancel (long runs).
4. Per-teacher preferred free periods / "avoid first period" soft preferences.
5. Substitute management (leave → automatic replacement suggestions).
6. Export to Excel as well as PDF.
7. Push notifications for new messages.
8. An audit log of HOD actions (who changed which assignment, when).
9. Optional encryption of messages at rest.
10. Support for Year 1 and for sections of different sizes sharing labs by batch.

---

# APPENDICES

## Appendix A — API reference

All routes are under `/api`. "Auth" = needs `Authorization: Bearer <token>`; "HOD" = also needs the HOD role. Errors are JSON `{ error, message }`.

### A.1 Authentication
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | – | `{ facultyId \| username, password }` → `{ token, user }` |
| POST | `/auth/logout` | – | Invalidate the presented token |
| GET | `/auth/me` | Auth | Current user |
| POST | `/auth/forgot` | – | `{ identifier }` → emails a 6-digit code (generic reply) |
| POST | `/auth/reset` | – | `{ identifier, code, newPassword }` |
| POST | `/auth/set-password` | HOD | Set a teacher's password directly |

### A.2 Setup (HOD) — `/setup/*`
| Method | Path | Purpose |
|---|---|---|
| GET | `/setup/overview` | Per-semester counts for the checklist |
| GET/POST/PUT/DELETE | `/setup/subjects`, `/setup/subjects/:id` | Syllabus management |
| POST | `/setup/sections` | `{ semester, count }` add sections |
| PATCH | `/setup/sections/:id` | `{ classIncharge }` |
| DELETE | `/setup/sections/:id` | Remove a section and its offerings |
| POST | `/setup/faculty` | Add a teacher → `{ facultyId, password }` (shown once) |
| PATCH/DELETE | `/setup/faculty/:id` | Edit / remove a teacher |
| POST | `/setup/faculty/:id/credentials` | Reissue a login |
| POST | `/setup/faculty-credentials/missing` | Create all missing logins |
| GET | `/setup/faculty-logins` | Who has a personal password |
| GET | `/hod/erase/summary` | (HOD) what each erase would remove |
| POST | `/hod/erase/preferences` · `/hod/erase/allocation` | (HOD) `{ password }` — the only erase actions |

### A.3 Teacher allocation and HOD review
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/faculty/me`, `/faculty/cycle-context`, `/faculty/allocation-policy`, `/faculty/subjects`, `/faculty/subject-demand`, `/faculty/history`, `/faculty/preferences` | Auth | A teacher's own context |
| POST | `/faculty/preferences/draft`, `/faculty/preferences/submit` | Auth | Save / submit preferences |
| PATCH | `/faculty/me/contact` | Auth | Own email / phone |
| PATCH | `/:id/experience` (faculty router) | Auth | Update experience |
| GET | `/hod/preferences` | HOD | All preferences |
| POST | `/hod/preferences/:id/review` · `/change` | HOD | Approve/reject · replace the subject |
| PATCH/DELETE | `/hod/preferences/:id` | HOD | Edit / remove |
| GET | `/hod/assign-board` | HOD | Assign board data per semester |
| POST | `/hod/assign` · `/hod/unassign` · `/hod/auto-assign` | HOD | Assign, remove, auto-fill |
| GET/POST | `/hod/allocation-settings` | HOD | Experience bands, AI switch, staffing weightage (`avgSectionsPerTeacher`, `maxWeeklyPeriods`) |
| POST | `/hod/apply-plan` · `/hod/reassign` | HOD | Save one subject's edited plan (must cover the open sections exactly) · move a teacher's sections to another teacher |
| GET | `/setup/import/template/:kind` (`sections`, `syllabus`, `teachers`, `all`) | HOD | Excel templates |
| POST | `/setup/import/:kind/preview` · `/validate` · `/commit` | HOD | Stage an upload, re-check edited rows, save (`mode: add` keeps what exists; `mode: reset` removes it first and needs the HOD's password; preview of a reset also returns `willRemove`) |
| POST | `/setup/weekly-limit` `{ limit }` | HOD | Same weekly limit for every teacher and the policy setting; lists teachers already above it |
| GET | `/setup/import/data-check` | HOD | What is still missing for preferences and timetable generation |
| PUT | `/setup/subjects/:id/lab-rooms` | HOD | Replace all lab rooms of a subject (`{ rooms: [{ labId, sectionId? }] }`) |
| GET · POST | `/setup/subjects/merge-candidates` · `/setup/subjects/merge-lab` | HOD | Find / combine theory + lab pairs |
| GET | `/hod/teacher-workload` | HOD | Everything about each teacher's work (subjects, sections, periods, class in-charge, choices, results, timetable load) |
| GET | `/hod/staffing` | HOD | Demand vs capacity, teachers needed, "need N more teachers", per-subject quota |
| GET/POST | `/hod/academic-cycle` | HOD | Read / set the cycle (password) |
| GET | `/hod/workload-summary`, `/hod/confirmed-allocation`, `/section-allocation` | HOD | Summaries |
| POST | `/hod/allocate-workload`, `/hod/approve-workload-allocation`, `/commit-section-allocation` | HOD | Workload allocation steps |
| GET/POST/PUT/DELETE | `/workload-templates…` | HOD | Templates |

### A.4 Timetable
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/timetable/generate` | – | Generate for all ready semesters (or a given year/semester) |
| POST | `/timetable/regenerate` | – | Re-run |
| GET | `/timetable/master` | – | The latest run with all assignments |
| GET | `/timetable/section/:id` · `/faculty/:id` · `/lab/:id` | – | Views |
| GET | `/timetable/runs/:runId` · `/conflicts/:runId` | – | Run details |
| GET | `/timetable/export?semester=VII\|all` | – | Class timetable PDF |
| GET | `/timetable/export/faculty/:facultyId` | Auth | Teacher PDF (own only unless HOD) |
| GET | `/timetable/export/master?semester=…` | HOD | Master PDF |

### A.5 Reports data, results, mail
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/POST/DELETE | `/faculty/results`, `/faculty/results/:id` | Auth | Own pass percentages |
| GET | `/hod/faculty-results`, `/hod/faculty-results/:id`, `/hod/faculty-results-all` | HOD | Everyone's results |
| GET | `/hod/mail/status` · `/log` · `/outbox` | HOD | Mail status, history, demo outbox |
| POST | `/hod/mail/check` · `/draft` · `/send` | HOD | Test SMTP; AI draft; send |

### A.6 Messages and assistant
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/messages/threads` · `/messages/unread` · `/messages/thread/:otherId` | Auth | Conversations |
| POST | `/messages` | Auth | `{ toId, text }` |
| GET | `/assistant/status` | Auth | `{ enabled }` for the current role |
| POST | `/assistant/chat` | Auth | `{ messages:[{role,content}] }` → `{ reply, drafts }` |
| POST | `/ai/chat` | Auth | Older intent-routed assistant (dashboard summary card) |

### A.7 Master data (CRUD)
`/faculty`, `/sections`, `/courses`, `/subjects`, `/section-subjects`, `/teaching-assignments`, `/labs`, `/config`, `/workload/requirements`,
`/import/master/preview|commit|reset` (Excel workbook import, kept in the Data Hub).

### A.8 Health
`GET /api/health` → `{ ok: true, service: "scedular-backend" }`.

## Appendix B — Default policy values

| Setting | Value |
|---|---|
| Weekly periods per teacher | 22 (Settings → Policy & cycle, or Teachers → Weekly limit for all teachers; stored on every teacher and enforced by the solver) |
| Average sections one teacher takes | 3 → a subject accepts ceil(sections / 3) teachers |
| Teacher daily limit | 6 periods |
| Senior threshold | 13 years |
| Band 1 | 0–9 yrs · Year 1–2 · 1 choice |
| Band 2 | 10–13 yrs · Year 2–4 · 2 choices, 1 per year |
| Band 3 | 13+ yrs · Year 3–4 · 2 choices, 1 per year |
| Same subject per day (theory) | 2 (3 when the subject has ≥ 6 weekly periods) |
| Same subject in one period column | max 2 days a week |
| Reset-code lifetime / attempts / resend gap | 15 min / 5 / 60 s |
| New password minimum length | 8 (reset) · 6 (HOD-issued) |
| Message length / retention | 1000 characters / 30 days |
| Generated password format | 4 letters + `-` + 4 digits, no look-alike characters |
| Session | Stored server-side, survives restarts |

## Appendix C — Daily period grid

| Period | Time | Note |
|---|---|---|
| 1 | 8:00 – 8:50 | |
| 2 | 8:50 – 9:40 | |
| 3 | 9:40 – 10:30 | |
| — | 10:30 – 10:45 | Tea break |
| 4 | 10:45 – 11:40 | |
| 5 | 11:40 – 12:40 | |
| — | 12:40 – 1:15 | Lunch |
| 6 | 1:15 – 1:55 | |
| 7 | 1:55 – 2:35 | |
| 8 | 2:35 – 3:15 | |

Monday to Friday → 8 × 5 = **40 periods per week** per section. Times are shown on a 12-hour clock without AM/PM throughout the screens and the PDFs.
Lab blocks never cross the tea or lunch breaks.

## Appendix D — Worked example: one section, start to finish

*Scenario: Year 4, semester VII, section A (`Y4-A`).*

1. **Syllabus** (Settings → Syllabus & sections → Sem VII): Augmented Reality & Virtual Reality with AI (theory + lab), NLP, Big Data Management, Software Testing & Automation, AI & Robotics (integrated), Innovation Practices & Mini Project (practical), plus Library.
2. **Section** `Y4-A` exists; every subject is offered to it automatically, producing offerings with their weekly theory/lab periods.
3. **Teachers** choose preferences: a senior teacher picks *NLP*; the HOD approves.
4. **Assign**: *NLP* needs 8 sections; three teachers who chose it get 3, 3 and 2 sections. Auto-fill finishes the rest; the assign board shows NLP at 100 %.
5. **Class in-charge** for Y4-A is chosen in Settings → Class in-charge.
6. **Generate**: the run covers Years 2–4 together; Y4-A's week fills 40 periods with theory, lab blocks (for example the ARVR lab as three consecutive periods) and Library in leftover slots.
7. **Check**: the validator finds no clash; status GREEN.
8. **View**: Class Timetable → Y4-A shows acronyms (ARVR, NLP, BDM, STA, AIR) with lab cells merged across their periods.
9. **PDF**: Download PDF → Semester VII produces the printed-format sheet for Y4-A with the grid, the theory table, the practicals table and "CLASS INCHARGE : …".
10. **Teacher view**: the NLP teacher opens Timetable, sees their week across the sections they teach, and downloads *My timetable*.
11. **Master**: the HOD's master PDF shows on the Monday page the row "Sec A" with exactly what Y4-A has each period and who teaches it.

## Appendix E — Glossary of status words and messages

| Text you may see | Meaning |
|---|---|
| GREEN | Verified: all hard rules hold |
| YELLOW | Placed, with warnings to read |
| RED | No valid timetable; conflicts listed |
| READINESS_BLOCKED | A semester is missing data (curriculum, sections, teachers, labs…) |
| INVALID_INPUT | The data fails pre-validation (for example no lab mapped) |
| FACULTY_SHORTAGE | A teacher's **daily** capacity would be exceeded |
| LAB_CONFLICT | A lab would host two sections at once |
| WEEKLY_REQUIREMENT_UNSATISFIED | An offering did not get all its periods |
| DAILY_SUBJECT_LIMIT_EXCEEDED | Too many periods of one subject on a day for a section |
| COLUMN_SUBJECT_LIMIT_EXCEEDED | A subject in the same period slot on too many days |
| NO_TIMETABLE | Nothing generated yet (PDF/export refused) |
| AI_DISABLED | The HOD switched the assistant off for teachers |
| MAIL_NOT_CONFIGURED | No SMTP credentials set |
| DUPLICATE_EMAIL | Another teacher already uses that email |
| WEAK_PASSWORD | Password shorter than allowed |
| SUBJECT_QUOTA_FULL | The subject already has all the teachers it needs (sections ÷ average per teacher); choose another |
| FORBIDDEN | You are not allowed (for example a teacher asking for another teacher's PDF) |
| UNAUTHENTICATED | Session missing or expired — sign in again |

---

*End of report.*
