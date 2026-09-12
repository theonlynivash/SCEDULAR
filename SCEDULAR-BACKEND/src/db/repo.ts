import { db } from './client.js'
import type {
  Assignment,
  Conflict,
  Course,
  CourseRequirement,
  Faculty,
  FacultyUnavailability,
  Lab,
  LabCourseMapping,
  ScheduleConfig,
  Section,
  SchedulableUnit,
  TeacherAssignment,
  TimetableStatus,
} from '../types.js'

// ---------- Faculty ----------

export function listFaculty(): Faculty[] {
  const rows = db.prepare('SELECT * FROM faculty ORDER BY name').all() as any[]
  return rows.map(toFaculty)
}

export function getFaculty(id: string): Faculty | undefined {
  const row = db.prepare('SELECT * FROM faculty WHERE id = ?').get(id) as any
  return row ? toFaculty(row) : undefined
}

export function upsertFaculty(f: Faculty): void {
  db.prepare(
    `INSERT INTO faculty (id, name, designation, max_daily_periods, max_weekly_periods)
     VALUES (@id, @name, @designation, @maxDailyPeriods, @maxWeeklyPeriods)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, designation=excluded.designation,
       max_daily_periods=excluded.max_daily_periods, max_weekly_periods=excluded.max_weekly_periods`
  ).run(f)
}

export function deleteFaculty(id: string): void {
  db.prepare('DELETE FROM faculty WHERE id = ?').run(id)
}

export function listFacultyUnavailability(facultyId?: string): FacultyUnavailability[] {
  const rows = facultyId
    ? (db.prepare('SELECT * FROM faculty_unavailability WHERE faculty_id = ?').all(facultyId) as any[])
    : (db.prepare('SELECT * FROM faculty_unavailability').all() as any[])
  return rows.map(r => ({ facultyId: r.faculty_id, day: r.day, period: r.period }))
}

export function addFacultyUnavailability(u: FacultyUnavailability): void {
  db.prepare('INSERT INTO faculty_unavailability (faculty_id, day, period) VALUES (?, ?, ?)').run(
    u.facultyId,
    u.day,
    u.period
  )
}

export function clearFacultyUnavailability(facultyId: string): void {
  db.prepare('DELETE FROM faculty_unavailability WHERE faculty_id = ?').run(facultyId)
}

function toFaculty(row: any): Faculty {
  return {
    id: row.id,
    name: row.name,
    designation: row.designation,
    maxDailyPeriods: row.max_daily_periods,
    maxWeeklyPeriods: row.max_weekly_periods,
  }
}

// ---------- Sections ----------

export function listSections(): Section[] {
  const rows = db.prepare('SELECT * FROM sections ORDER BY name').all() as any[]
  return rows.map(r => ({ id: r.id, name: r.name, year: r.year, semester: r.semester }))
}

export function upsertSection(s: Section): void {
  db.prepare(
    `INSERT INTO sections (id, name, year, semester) VALUES (@id, @name, @year, @semester)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, year=excluded.year, semester=excluded.semester`
  ).run(s)
}

export function deleteSection(id: string): void {
  db.prepare('DELETE FROM sections WHERE id = ?').run(id)
}

// ---------- Courses ----------

export function listCourses(): Course[] {
  const rows = db.prepare('SELECT * FROM courses ORDER BY name').all() as any[]
  return rows.map(toCourse)
}

export function getCourse(id: string): Course | undefined {
  const row = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as any
  return row ? toCourse(row) : undefined
}

export function upsertCourse(c: Course): void {
  db.prepare(
    `INSERT INTO courses (id, code, name, component_type, lab_block_length)
     VALUES (@id, @code, @name, @componentType, @labBlockLength)
     ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name,
       component_type=excluded.component_type, lab_block_length=excluded.lab_block_length`
  ).run(c)
}

export function deleteCourse(id: string): void {
  db.prepare('DELETE FROM courses WHERE id = ?').run(id)
}

function toCourse(row: any): Course {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    componentType: row.component_type,
    labBlockLength: row.lab_block_length,
  }
}

// ---------- Labs ----------

export function listLabs(): Lab[] {
  const rows = db.prepare('SELECT * FROM labs ORDER BY name').all() as any[]
  return rows.map(r => ({ id: r.id, name: r.name }))
}

export function upsertLab(l: Lab): void {
  db.prepare(
    `INSERT INTO labs (id, name) VALUES (@id, @name)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name`
  ).run(l)
}

export function deleteLab(id: string): void {
  db.prepare('DELETE FROM labs WHERE id = ?').run(id)
}

export function listLabCourseMappings(): LabCourseMapping[] {
  const rows = db.prepare('SELECT * FROM lab_course_mapping').all() as any[]
  return rows.map(r => ({ labId: r.lab_id, courseId: r.course_id }))
}

export function setLabCourseMapping(labId: string, courseId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO lab_course_mapping (lab_id, course_id) VALUES (?, ?)'
  ).run(labId, courseId)
}

export function labsForCourse(courseId: string): string[] {
  const rows = db
    .prepare('SELECT lab_id FROM lab_course_mapping WHERE course_id = ?')
    .all(courseId) as any[]
  return rows.map(r => r.lab_id)
}

// ---------- Course requirements ----------

export function listCourseRequirements(): CourseRequirement[] {
  const rows = db.prepare('SELECT * FROM course_requirements').all() as any[]
  return rows.map(toRequirement)
}

export function upsertCourseRequirement(r: Omit<CourseRequirement, 'id'>): void {
  db.prepare(
    `INSERT INTO course_requirements (course_id, section_id, weekly_theory_periods, weekly_lab_periods)
     VALUES (@courseId, @sectionId, @weeklyTheoryPeriods, @weeklyLabPeriods)
     ON CONFLICT(course_id, section_id) DO UPDATE SET
       weekly_theory_periods=excluded.weekly_theory_periods,
       weekly_lab_periods=excluded.weekly_lab_periods`
  ).run(r)
}

function toRequirement(row: any): CourseRequirement {
  return {
    id: row.id,
    courseId: row.course_id,
    sectionId: row.section_id,
    weeklyTheoryPeriods: row.weekly_theory_periods,
    weeklyLabPeriods: row.weekly_lab_periods,
  }
}

// ---------- Teacher assignments (raw input: who teaches what to whom) ----------

export function listTeacherAssignments(): TeacherAssignment[] {
  const rows = db.prepare('SELECT * FROM teacher_assignments').all() as any[]
  return rows.map(toTeacherAssignment)
}

export function upsertTeacherAssignment(a: Omit<TeacherAssignment, 'id'>): void {
  db.prepare(
    `INSERT INTO teacher_assignments (faculty_id, course_id, section_id)
     VALUES (@facultyId, @courseId, @sectionId)
     ON CONFLICT(course_id, section_id) DO UPDATE SET faculty_id=excluded.faculty_id`
  ).run(a)
}

function toTeacherAssignment(row: any): TeacherAssignment {
  return { id: row.id, facultyId: row.faculty_id, courseId: row.course_id, sectionId: row.section_id }
}

// ---------- Schedule config ----------

export function getScheduleConfig(): ScheduleConfig {
  const row = db.prepare('SELECT * FROM schedule_config WHERE id = 1').get() as any
  return { workingDays: JSON.parse(row.working_days), periods: JSON.parse(row.periods) }
}

export function setScheduleConfig(cfg: ScheduleConfig): void {
  db.prepare(
    `INSERT INTO schedule_config (id, working_days, periods) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET working_days=excluded.working_days, periods=excluded.periods`
  ).run(JSON.stringify(cfg.workingDays), JSON.stringify(cfg.periods))
}

// ---------- Generation runs / assignments / conflicts ----------

export function createRun(status: TimetableStatus, warnings: string[]): number {
  const info = db
    .prepare('INSERT INTO generation_runs (status, generated_at, warnings) VALUES (?, ?, ?)')
    .run(status, new Date().toISOString(), JSON.stringify(warnings))
  return info.lastInsertRowid as number
}

export function saveAssignments(runId: number, assignments: Assignment[]): void {
  const stmt = db.prepare(
    `INSERT INTO assignments (run_id, day, start_period, end_period, section_id, course_id, faculty_id, block_type, lab_id)
     VALUES (@runId, @day, @startPeriod, @endPeriod, @sectionId, @courseId, @facultyId, @blockType, @labId)`
  )
  const tx = db.transaction((rows: Assignment[]) => {
    for (const a of rows) stmt.run({ runId, ...a, labId: a.labId ?? null })
  })
  tx(assignments)
}

export function saveConflicts(runId: number, conflicts: Conflict[]): void {
  const stmt = db.prepare(
    `INSERT INTO conflicts (run_id, type, message, section_id, course_id, faculty_id, day, period)
     VALUES (@runId, @type, @message, @sectionId, @courseId, @facultyId, @day, @period)`
  )
  const tx = db.transaction((rows: Conflict[]) => {
    for (const c of rows)
      stmt.run({
        runId,
        type: c.type,
        message: c.message,
        sectionId: c.sectionId ?? null,
        courseId: c.courseId ?? null,
        facultyId: c.facultyId ?? null,
        day: c.day ?? null,
        period: c.period ?? null,
      })
  })
  tx(conflicts)
}

export function saveUnscheduled(runId: number, units: SchedulableUnit[]): void {
  const stmt = db.prepare(
    `INSERT INTO unscheduled (run_id, section_id, course_id, faculty_id, block_type, length)
     VALUES (@runId, @sectionId, @courseId, @facultyId, @blockType, @length)`
  )
  const tx = db.transaction((rows: SchedulableUnit[]) => {
    for (const u of rows) stmt.run({ runId, ...u })
  })
  tx(units)
}

export function getLatestValidRun(): { id: number; status: TimetableStatus; generatedAt: string } | undefined {
  const row = db
    .prepare(
      `SELECT id, status, generated_at as generatedAt FROM generation_runs
       WHERE status IN ('GREEN','YELLOW') ORDER BY id DESC LIMIT 1`
    )
    .get() as any
  return row
}

export function getRun(runId: number) {
  return db.prepare('SELECT * FROM generation_runs WHERE id = ?').get(runId) as any
}

export function getAssignmentsForRun(runId: number): Assignment[] {
  const rows = db.prepare('SELECT * FROM assignments WHERE run_id = ?').all(runId) as any[]
  return rows.map(r => ({
    day: r.day,
    startPeriod: r.start_period,
    endPeriod: r.end_period,
    sectionId: r.section_id,
    courseId: r.course_id,
    facultyId: r.faculty_id,
    blockType: r.block_type,
    labId: r.lab_id ?? undefined,
  }))
}

export function getConflictsForRun(runId: number): Conflict[] {
  const rows = db.prepare('SELECT * FROM conflicts WHERE run_id = ?').all(runId) as any[]
  return rows.map(r => ({
    type: r.type,
    message: r.message,
    sectionId: r.section_id ?? undefined,
    courseId: r.course_id ?? undefined,
    facultyId: r.faculty_id ?? undefined,
    day: r.day ?? undefined,
    period: r.period ?? undefined,
  }))
}

export function getUnscheduledForRun(runId: number): SchedulableUnit[] {
  const rows = db.prepare('SELECT * FROM unscheduled WHERE run_id = ?').all(runId) as any[]
  return rows.map(r => ({
    unitId: `${r.section_id}:${r.course_id}:${r.id}`,
    sectionId: r.section_id,
    courseId: r.course_id,
    facultyId: r.faculty_id,
    blockType: r.block_type,
    length: r.length,
  }))
}
