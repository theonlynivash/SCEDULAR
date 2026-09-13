import { pool } from './client.js'
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

export async function listFaculty(): Promise<Faculty[]> {
  const { rows } = await pool.query('SELECT * FROM faculty ORDER BY name')
  return rows.map(toFaculty)
}

export async function getFaculty(id: string): Promise<Faculty | undefined> {
  const { rows } = await pool.query('SELECT * FROM faculty WHERE id = $1', [id])
  return rows[0] ? toFaculty(rows[0]) : undefined
}

export async function upsertFaculty(f: Faculty): Promise<void> {
  await pool.query(
    `INSERT INTO faculty (id, name, designation, max_daily_periods, max_weekly_periods)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, designation = EXCLUDED.designation,
       max_daily_periods = EXCLUDED.max_daily_periods, max_weekly_periods = EXCLUDED.max_weekly_periods`,
    [f.id, f.name, f.designation, f.maxDailyPeriods, f.maxWeeklyPeriods]
  )
}

export async function deleteFaculty(id: string): Promise<void> {
  await pool.query('DELETE FROM faculty WHERE id = $1', [id])
}

export async function listFacultyUnavailability(facultyId?: string): Promise<FacultyUnavailability[]> {
  const { rows } = facultyId
    ? await pool.query('SELECT * FROM faculty_unavailability WHERE faculty_id = $1', [facultyId])
    : await pool.query('SELECT * FROM faculty_unavailability')
  return rows.map(r => ({ facultyId: r.faculty_id, day: r.day, period: r.period }))
}

export async function addFacultyUnavailability(u: FacultyUnavailability): Promise<void> {
  await pool.query('INSERT INTO faculty_unavailability (faculty_id, day, period) VALUES ($1, $2, $3)', [
    u.facultyId,
    u.day,
    u.period,
  ])
}

export async function clearFacultyUnavailability(facultyId: string): Promise<void> {
  await pool.query('DELETE FROM faculty_unavailability WHERE faculty_id = $1', [facultyId])
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

export async function listSections(): Promise<Section[]> {
  const { rows } = await pool.query('SELECT * FROM sections ORDER BY name')
  return rows.map(r => ({ id: r.id, name: r.name, year: r.year, semester: r.semester }))
}

export async function upsertSection(s: Section): Promise<void> {
  await pool.query(
    `INSERT INTO sections (id, name, year, semester) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, year = EXCLUDED.year, semester = EXCLUDED.semester`,
    [s.id, s.name, s.year, s.semester]
  )
}

export async function deleteSection(id: string): Promise<void> {
  await pool.query('DELETE FROM sections WHERE id = $1', [id])
}

// ---------- Courses ----------

export async function listCourses(): Promise<Course[]> {
  const { rows } = await pool.query('SELECT * FROM courses ORDER BY name')
  return rows.map(toCourse)
}

export async function getCourse(id: string): Promise<Course | undefined> {
  const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1', [id])
  return rows[0] ? toCourse(rows[0]) : undefined
}

export async function upsertCourse(c: Course): Promise<void> {
  await pool.query(
    `INSERT INTO courses (id, code, name, component_type, lab_block_length)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name,
       component_type = EXCLUDED.component_type, lab_block_length = EXCLUDED.lab_block_length`,
    [c.id, c.code, c.name, c.componentType, c.labBlockLength]
  )
}

export async function deleteCourse(id: string): Promise<void> {
  await pool.query('DELETE FROM courses WHERE id = $1', [id])
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

export async function listLabs(): Promise<Lab[]> {
  const { rows } = await pool.query('SELECT * FROM labs ORDER BY name')
  return rows.map(r => ({ id: r.id, name: r.name }))
}

export async function upsertLab(l: Lab): Promise<void> {
  await pool.query(
    `INSERT INTO labs (id, name) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [l.id, l.name]
  )
}

export async function deleteLab(id: string): Promise<void> {
  await pool.query('DELETE FROM labs WHERE id = $1', [id])
}

export async function listLabCourseMappings(): Promise<LabCourseMapping[]> {
  const { rows } = await pool.query('SELECT * FROM lab_course_mapping')
  return rows.map(r => ({ labId: r.lab_id, courseId: r.course_id }))
}

export async function setLabCourseMapping(labId: string, courseId: string): Promise<void> {
  await pool.query(
    'INSERT INTO lab_course_mapping (lab_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [labId, courseId]
  )
}

export async function deleteLabCourseMapping(labId: string, courseId: string): Promise<void> {
  await pool.query('DELETE FROM lab_course_mapping WHERE lab_id = $1 AND course_id = $2', [labId, courseId])
}

export async function labsForCourse(courseId: string): Promise<string[]> {
  const { rows } = await pool.query('SELECT lab_id FROM lab_course_mapping WHERE course_id = $1', [courseId])
  return rows.map(r => r.lab_id)
}

// One query for every course's lab options -- used by the solver so its
// hot backtracking loop never touches the database (see solver/csp.ts).
export async function getAllLabsByCourse(): Promise<Map<string, string[]>> {
  const { rows } = await pool.query('SELECT course_id, lab_id FROM lab_course_mapping')
  const map = new Map<string, string[]>()
  for (const r of rows) {
    if (!map.has(r.course_id)) map.set(r.course_id, [])
    map.get(r.course_id)!.push(r.lab_id)
  }
  return map
}

// ---------- Course requirements ----------

export async function listCourseRequirements(): Promise<CourseRequirement[]> {
  const { rows } = await pool.query('SELECT * FROM course_requirements')
  return rows.map(toRequirement)
}

export async function upsertCourseRequirement(r: Omit<CourseRequirement, 'id'>): Promise<void> {
  await pool.query(
    `INSERT INTO course_requirements (course_id, section_id, weekly_theory_periods, weekly_lab_periods)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (course_id, section_id) DO UPDATE SET
       weekly_theory_periods = EXCLUDED.weekly_theory_periods,
       weekly_lab_periods = EXCLUDED.weekly_lab_periods`,
    [r.courseId, r.sectionId, r.weeklyTheoryPeriods, r.weeklyLabPeriods]
  )
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

export async function listTeacherAssignments(): Promise<TeacherAssignment[]> {
  const { rows } = await pool.query('SELECT * FROM teacher_assignments')
  return rows.map(toTeacherAssignment)
}

export async function upsertTeacherAssignment(a: Omit<TeacherAssignment, 'id'>): Promise<void> {
  await pool.query(
    `INSERT INTO teacher_assignments (faculty_id, course_id, section_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (course_id, section_id) DO UPDATE SET faculty_id = EXCLUDED.faculty_id`,
    [a.facultyId, a.courseId, a.sectionId]
  )
}

function toTeacherAssignment(row: any): TeacherAssignment {
  return { id: row.id, facultyId: row.faculty_id, courseId: row.course_id, sectionId: row.section_id }
}

// ---------- Schedule config ----------

export async function getScheduleConfig(): Promise<ScheduleConfig> {
  const { rows } = await pool.query('SELECT * FROM schedule_config WHERE id = 1')
  const row = rows[0]
  return { workingDays: JSON.parse(row.working_days), periods: JSON.parse(row.periods) }
}

export async function setScheduleConfig(cfg: ScheduleConfig): Promise<void> {
  await pool.query(
    `INSERT INTO schedule_config (id, working_days, periods) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET working_days = EXCLUDED.working_days, periods = EXCLUDED.periods`,
    [JSON.stringify(cfg.workingDays), JSON.stringify(cfg.periods)]
  )
}

// ---------- Generation runs / assignments / conflicts ----------

export async function createRun(status: TimetableStatus, warnings: string[]): Promise<number> {
  const { rows } = await pool.query(
    'INSERT INTO generation_runs (status, generated_at, warnings) VALUES ($1, $2, $3) RETURNING id',
    [status, new Date().toISOString(), JSON.stringify(warnings)]
  )
  return rows[0].id as number
}

export async function saveAssignments(runId: number, assignments: Assignment[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const a of assignments) {
      await client.query(
        `INSERT INTO assignments (run_id, day, start_period, end_period, section_id, course_id, faculty_id, block_type, lab_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [runId, a.day, a.startPeriod, a.endPeriod, a.sectionId, a.courseId, a.facultyId, a.blockType, a.labId ?? null]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function saveConflicts(runId: number, conflicts: Conflict[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const c of conflicts) {
      await client.query(
        `INSERT INTO conflicts (run_id, type, message, section_id, course_id, faculty_id, day, period)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [runId, c.type, c.message, c.sectionId ?? null, c.courseId ?? null, c.facultyId ?? null, c.day ?? null, c.period ?? null]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function saveUnscheduled(runId: number, units: SchedulableUnit[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const u of units) {
      await client.query(
        `INSERT INTO unscheduled (run_id, section_id, course_id, faculty_id, block_type, length)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [runId, u.sectionId, u.courseId, u.facultyId, u.blockType, u.length]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function getLatestValidRun(): Promise<{ id: number; status: TimetableStatus; generatedAt: string } | undefined> {
  const { rows } = await pool.query(
    `SELECT id, status, generated_at as "generatedAt" FROM generation_runs
     WHERE status IN ('GREEN','YELLOW') ORDER BY id DESC LIMIT 1`
  )
  return rows[0]
}

export async function getRun(runId: number): Promise<any> {
  const { rows } = await pool.query('SELECT * FROM generation_runs WHERE id = $1', [runId])
  return rows[0]
}

export async function getAssignmentsForRun(runId: number): Promise<Assignment[]> {
  const { rows } = await pool.query('SELECT * FROM assignments WHERE run_id = $1', [runId])
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

export async function getConflictsForRun(runId: number): Promise<Conflict[]> {
  const { rows } = await pool.query('SELECT * FROM conflicts WHERE run_id = $1', [runId])
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

export async function getUnscheduledForRun(runId: number): Promise<SchedulableUnit[]> {
  const { rows } = await pool.query('SELECT * FROM unscheduled WHERE run_id = $1', [runId])
  return rows.map(r => ({
    unitId: `${r.section_id}:${r.course_id}:${r.id}`,
    sectionId: r.section_id,
    courseId: r.course_id,
    facultyId: r.faculty_id,
    blockType: r.block_type,
    length: r.length,
  }))
}
