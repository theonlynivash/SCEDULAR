# SCEDULAR

**Timetable and workload management for the Department of Artificial Intelligence & Data Science, Panimalar Engineering College, Chennai.**

The HOD sets up sections, syllabus and teachers; teachers choose subjects; the HOD approves and assigns them; SCEDULAR then
builds one clash-free weekly timetable for every semester, checks it independently, and prints it in the department's own
format. Reports, email, chat and an AI assistant are built in. It works on a phone too.

> New here? Read **[SCEDULAR_REPORT.md](SCEDULAR_REPORT.md)**: the complete guide (how it works, a click-by-click manual for
> the HOD and for teachers, and troubleshooting). This README is the short version.

---

## What it does

| For the HOD | For teachers |
|---|---|
| Set up sections, syllabus, lab rooms, teachers (by hand or **Excel import**) | Sign in, change or reset the password (emailed code) |
| Approve teachers' subject choices; assign sections (plan editor, auto-fill, change teacher) | Choose preferred subjects (limits by experience and by how many teachers each subject needs) |
| See "need more teachers" when the work does not fit | See the personal timetable and **download it as PDF** |
| Generate the timetable for all ready semesters in one run | Record past pass percentages, add a profile photo |
| Download class, lab-room and teacher timetables and the **master timetable** (PDF) | Chat with the HOD |
| Reports: staffing, subject needs, **each teacher's full workload**, results, timetable analysis | Ask the AI assistant about their own data |
| **Leave letters**: see the classes under each section with the free teachers beside them, assign substitutes | **Send a leave letter**, name the colleagues who agreed, see substitution classes on the dashboard |
| Email teachers (AI-drafted), reset or issue logins, chat with anyone | |

**Rules the timetable never breaks:** no teacher, lab or section is ever in two places at once; labs run as whole blocks and
never across tea or lunch; a subject is capped per day; a teacher takes theory and lab of a class together. Every result is
re-checked by a separate validator, and if no valid timetable exists SCEDULAR says exactly why instead of faking one.

---

## Quick start (one computer)

You need **Node.js 18 or newer** and a modern browser.

```bash
# 1. backend  (http://localhost:8090)
cd SCEDULAR-BACKEND
npm install
cp .env.example .env        # then edit .env, see "Settings" below
npm run dev

# 2. frontend  (http://localhost:8443)   - in a second terminal
cd SCEDULAR-FRONTEND
npm install
npm run dev
```

Open <http://localhost:8443> and sign in as **`FAC-001`** (the HOD). On the very first start the app creates a sample
department; set `SCEDULAR_START_BLANK=true` in `.env` before the first start for an empty one.

Teachers get their login from the HOD (Teachers page → create logins, or Settings → Import → Teachers).

### Settings (`SCEDULAR-BACKEND/.env`)

| Setting | Needed for |
|---|---|
| `SMTP_USER`, `SMTP_PASS` | Email (a Gmail address and its 16-letter **App Password**). Without them mail is switched off. |
| `GROQ_API_KEY` | The AI assistant and AI-written email drafts. Without it they are switched off. |
| `SCEDULAR_MASTER_PASSWORD` | The first-login password for accounts that have no personal password yet (default `SCEDULAR_AIDS`; **change it in production**). |
| `STORAGE` + `DATABASE_URL` | `STORAGE=auto` (default): on your computer everything is stored in one local file even if `DATABASE_URL` is set; on Vercel the PostgreSQL (Neon) link in `DATABASE_URL` is used. |

All settings are listed in `SCEDULAR-BACKEND/.env.example` and in the report (section 22). Never commit `.env`.

---

## How the data is stored

* **Local mode (default):** one JSON file, `SCEDULAR-BACKEND/data/scedular_local_db.json`. Back it up by copying it.
* **Cloud mode (on Vercel, or `STORAGE=postgres` with `DATABASE_URL`):** the same data as one **versioned JSON document** in PostgreSQL (table `app_state`),
  profile pictures in `faculty_photos`. Each change is saved before the response is sent. If two people save at the same
  moment the second save is refused with a clear message and never overwrites the first.
* The data file holds real names, emails and password hashes. It is **git-ignored**. Never share or upload it.

---

## Project layout

```
SCEDULAR/
├── README.md · SCEDULAR_REPORT.md · VERCEL_DEPLOY.md · HOSTING_PROMPT.md · docker-compose.yml
├── SCEDULAR-BACKEND/            Node + Express + TypeScript
│   ├── api/ + vercel.json       Vercel entry of the API project
│   ├── src/solver/              the timetable engine and its independent validator
│   ├── src/routes/              the API (all of it needs sign-in)
│   ├── src/db/                  storage (file / PostgreSQL) and data access
│   ├── src/export/              PDF timetables (class, teacher, master)
│   ├── src/import/              Excel import (sections, syllabus, teachers)
│   ├── src/mail/ · src/ai/      email and the AI assistant
│   ├── assets/fonts/            URW Bookman, used by the PDFs
│   └── tests/                   automated tests (+ tests/fixtures: a scrubbed sample department)
└── SCEDULAR-FRONTEND/           React + Vite + Tailwind (works on phones)
```

---

## Tests

```bash
cd SCEDULAR-BACKEND
npm test                # 210+ tests, about a minute; they never touch your real data or send real mail
npx tsc --noEmit        # type-check (also in SCEDULAR-FRONTEND)
```

The tests run on a frozen, scrubbed sample database and on an in-memory PostgreSQL (`pg-mem`), so cloud mode is tested too.

---

## Putting it online (Vercel + a free PostgreSQL such as Neon)

Two Vercel projects from the same repository: the API (Root Directory `SCEDULAR-BACKEND`) and the website (Root Directory `SCEDULAR-FRONTEND`, with `VITE_API_URL` pointing to the API). Step by step in **[VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)**. To host on the college's own server or under `panimalar.in`, give **[HOSTING_PROMPT.md](HOSTING_PROMPT.md)** to a developer or an AI assistant.

---

## Security in one paragraph

Every API call except sign-in, "forgot password" and the health check needs a valid session; changing department data is
HOD-only; teachers cannot see each other's email or phone; passwords are stored as bcrypt hashes; sign-in attempts are
rate-limited; the AI assistant never sends email by itself (the HOD presses Send). Chat messages are plain text and are
deleted after 30 days. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` anywhere.

---

## Credits

Developed by **KERNUL TECH** for the Department of AI & DS, Panimalar Engineering College.

* **Srinivash Karthikeyan**: lead system architect and developer, B.Tech AI & DS
* **Prof. Suganya Devi J**: faculty advisor and academic domain expert

© Panimalar Engineering College. All rights reserved.
