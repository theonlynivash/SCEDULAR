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
  component_type TEXT NOT NULL CHECK (component_type IN ('INTEGRATED_THEORY','INTEGRATED_LAB','LAB_ONLY','THEORY_ONLY','MANDATORY','ADDITIONAL')),
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
  course_id TEXT REFERENCES courses(id),
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
  section_id TEXT NOT NULL REFERENCES sections(id),
  course_id TEXT REFERENCES courses(id),
  faculty_id TEXT REFERENCES faculty(id),
  block_type TEXT NOT NULL CHECK (block_type IN ('THEORY','LAB')),
  length INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Canonical scheduling model (Stage 1)
-- ---------------------------------------------------------------------------
-- These tables are intentionally separate from the legacy workload tables
-- above during the migration window. New import/solver stages will make these
-- canonical tables the single source of truth and retire the legacy tables.

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('THEORY','LAB','INTEGRATED')),
  category TEXT NOT NULL DEFAULT 'OTHER'
    CHECK (category IN ('CORE','ELECTIVE','MANDATORY','ADDITIONAL','OTHER'))
);

-- A section declares its own academic demand here. Weekly counts therefore
-- belong to the section+subject offering, not to the faculty workload row.
CREATE TABLE IF NOT EXISTS section_subjects (
  id SERIAL PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  theory_periods INTEGER NOT NULL DEFAULT 0 CHECK (theory_periods >= 0),
  lab_periods INTEGER NOT NULL DEFAULT 0 CHECK (lab_periods >= 0),
  lab_block_length INTEGER CHECK (lab_block_length IS NULL OR lab_block_length > 0),
  UNIQUE (section_id, subject_id),
  CHECK (theory_periods > 0 OR lab_periods > 0)
);

-- One offering may have multiple faculty assignments. Component and batch are
-- explicit so theory/lab can have different teachers and parallel lab batches
-- can be represented without overwriting another assignment.
CREATE TABLE IF NOT EXISTS teaching_assignments (
  id SERIAL PRIMARY KEY,
  faculty_id TEXT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  section_subject_id INTEGER NOT NULL REFERENCES section_subjects(id) ON DELETE CASCADE,
  component TEXT NOT NULL CHECK (component IN ('THEORY','LAB')),
  batch TEXT NOT NULL DEFAULT '',
  UNIQUE (faculty_id, section_subject_id, component, batch)
);

-- A section's student count is useful for lab-capacity feasibility checks.
ALTER TABLE sections ADD COLUMN IF NOT EXISTS student_count INTEGER;
ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_student_count_nonnegative;
ALTER TABLE sections ADD CONSTRAINT sections_student_count_nonnegative
  CHECK (student_count IS NULL OR student_count >= 0);

-- Physical lab resources are independent from subject offerings. A lab can
-- support many subjects and a subject can have many compatible labs.
ALTER TABLE labs ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE labs DROP CONSTRAINT IF EXISTS labs_capacity_positive;
ALTER TABLE labs ADD CONSTRAINT labs_capacity_positive
  CHECK (capacity IS NULL OR capacity > 0);

CREATE TABLE IF NOT EXISTS lab_mapping (
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES sections(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_mapping_specific
  ON lab_mapping(lab_id, subject_id, section_id)
  WHERE section_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_mapping_global
  ON lab_mapping(lab_id, subject_id)
  WHERE section_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_section_subjects_section ON section_subjects(section_id);
CREATE INDEX IF NOT EXISTS idx_section_subjects_subject ON section_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_teaching_assignments_offering ON teaching_assignments(section_subject_id);
CREATE INDEX IF NOT EXISTS idx_teaching_assignments_faculty ON teaching_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_lab_mapping_subject ON lab_mapping(subject_id);
ALTER TABLE lab_mapping ADD COLUMN IF NOT EXISTS section_id TEXT REFERENCES sections(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS lab_mapping_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_mapping_specific
  ON lab_mapping(lab_id, subject_id, section_id)
  WHERE section_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_mapping_global
  ON lab_mapping(lab_id, subject_id)
  WHERE section_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lab_mapping_section_subject ON lab_mapping(section_id, subject_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_faculty_unavailability_slot
  ON faculty_unavailability(faculty_id, day, period);

-- Canonical generation persistence. Legacy course_id remains nullable so old
-- records can coexist during migration, but new canonical runs persist the
-- subject/section-subject identity directly.
ALTER TABLE assignments ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS section_subject_id INTEGER REFERENCES section_subjects(id) ON DELETE RESTRICT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS batch TEXT NOT NULL DEFAULT '';
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_identity_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_identity_check
  CHECK ((section_subject_id IS NOT NULL AND subject_id IS NOT NULL) OR course_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_assignments_section_subject ON assignments(section_subject_id);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON assignments(subject_id);

ALTER TABLE unscheduled ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE unscheduled ALTER COLUMN faculty_id DROP NOT NULL;
ALTER TABLE unscheduled ADD COLUMN IF NOT EXISTS subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT;
ALTER TABLE unscheduled ADD COLUMN IF NOT EXISTS section_subject_id INTEGER REFERENCES section_subjects(id) ON DELETE RESTRICT;
ALTER TABLE unscheduled ADD COLUMN IF NOT EXISTS batch TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_unscheduled_section_subject ON unscheduled(section_subject_id);

