-- SCEDULAR backend data model (Section 15 of the project report).
-- Configuration-driven: sections, faculty, requirements, labs and rules
-- are all rows, not source-code constants.
-- Postgres dialect (Neon-compatible).

CREATE TABLE IF NOT EXISTS faculty (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  designation TEXT,
  max_daily_periods INTEGER NOT NULL DEFAULT 6,
  max_weekly_periods INTEGER NOT NULL DEFAULT 24
);

CREATE TABLE IF NOT EXISTS faculty_unavailability (
  id SERIAL PRIMARY KEY,
  faculty_id TEXT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  period INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year TEXT,
  semester TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN ('INTEGRATED','NON_INTEGRATED','MANDATORY','LAB_ONLY')),
  lab_block_length INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS labs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_course_mapping (
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (lab_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_requirements (
  id SERIAL PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  weekly_theory_periods INTEGER NOT NULL DEFAULT 0,
  weekly_lab_periods INTEGER NOT NULL DEFAULT 0,
  UNIQUE (course_id, section_id)
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id SERIAL PRIMARY KEY,
  faculty_id TEXT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  UNIQUE (course_id, section_id)
);

CREATE TABLE IF NOT EXISTS schedule_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  working_days TEXT NOT NULL,
  periods TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_runs (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('GREEN','YELLOW','RED')),
  generated_at TEXT NOT NULL,
  warnings TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  start_period INTEGER NOT NULL,
  end_period INTEGER NOT NULL,
  section_id TEXT NOT NULL REFERENCES sections(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  faculty_id TEXT NOT NULL REFERENCES faculty(id),
  block_type TEXT NOT NULL CHECK (block_type IN ('THEORY','LAB')),
  lab_id TEXT REFERENCES labs(id)
);

CREATE TABLE IF NOT EXISTS conflicts (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  section_id TEXT,
  course_id TEXT,
  faculty_id TEXT,
  day TEXT,
  period INTEGER
);

CREATE TABLE IF NOT EXISTS unscheduled (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  faculty_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  length INTEGER NOT NULL
);
