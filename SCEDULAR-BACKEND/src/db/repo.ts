import { pool } from './client.js'
import { defaultScheduleConfig } from '../utils/grid.js'
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
  Subject,
  SectionSubject,
  TeachingAssignment,
  TeachingComponent,
  TimetableStatus,
} from '../types.js'

// In-memory fallback state for offline / database-unreachable development
const mem = {
  faculty: [] as Faculty[],
  sections: [] as Section[],
  subjects: [] as Subject[],
  sectionSubjects: [] as SectionSubject[],
  teachingAssignments: [] as TeachingAssignment[],
  labs: [] as Lab[],
  labMappings: [] as Array<{ labId: string; subjectId: string; sectionId: string | null }>,
  facultyUnavailability: [] as FacultyUnavailability[],
  scheduleConfig: defaultScheduleConfig(),
  generationRuns: [] as Array<{ id: number; status: TimetableStatus; generatedAt: string; warnings: string[] }>,
  assignments: [] as Array<Assignment & { runId: number }>,
  conflicts: [] as Array<Conflict & { runId: number }>,
  unscheduled: [] as Array<SchedulableUnit & { runId: number }>,
  nextRunId: 1,
}

export async function clearAllData(): Promise<void> {
  mem.faculty = []
  mem.sections = []
  mem.subjects = []
  mem.sectionSubjects = []
  mem.teachingAssignments = []
  mem.labs = []
  mem.labMappings = []
  mem.facultyUnavailability = []
  mem.generationRuns = []
  mem.assignments = []
  mem.conflicts = []
  mem.unscheduled = []
  mem.nextRunId = 1

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM unscheduled')
      await client.query('DELETE FROM conflicts')
      await client.query('DELETE FROM assignments')
      await client.query('DELETE FROM generation_runs')
      await client.query('DELETE FROM teaching_assignments')
      await client.query('DELETE FROM section_subjects')
      await client.query('DELETE FROM lab_mapping')
      await client.query('DELETE FROM faculty_unavailability')
      await client.query('DELETE FROM faculty')
      await client.query('DELETE FROM sections')
      await client.query('DELETE FROM subjects')
      await client.query('DELETE FROM labs')
      await client.query('DELETE FROM teacher_assignments')
      await client.query('DELETE FROM course_requirements')
      await client.query('DELETE FROM lab_course_mapping')
      await client.query('DELETE FROM courses')
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch {
    // operating in memory mode or DB offline
  }
}

export async function replaceImportedWorkload(): Promise<void> {
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM generation_runs')
      await client.query('DELETE FROM teacher_assignments')
      await client.query('DELETE FROM course_requirements')
      await client.query('DELETE FROM faculty')
      await client.query('DELETE FROM sections')
      await client.query('DELETE FROM courses')
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    // fallback
  }
}

// ---------- Faculty ----------

export async function listFaculty(): Promise<Faculty[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM faculty ORDER BY name')
    return rows.map(toFaculty)
  } catch {
    return mem.faculty
  }
}

export async function getFaculty(id: string): Promise<Faculty | undefined> {
  try {
    const { rows } = await pool.query('SELECT * FROM faculty WHERE id = $1', [id])
    return rows[0] ? toFaculty(rows[0]) : undefined
  } catch {
    return mem.faculty.find(f => f.id === id)
  }
}

export async function upsertFaculty(f: Faculty): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO faculty (id, name, designation, max_daily_periods, max_weekly_periods)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, designation = EXCLUDED.designation,
         max_daily_periods = EXCLUDED.max_daily_periods, max_weekly_periods = EXCLUDED.max_weekly_periods`,
      [f.id, f.name, f.designation, f.maxDailyPeriods, f.maxWeeklyPeriods]
    )
  } catch {
    const idx = mem.faculty.findIndex(x => x.id === f.id)
    if (idx >= 0) mem.faculty[idx] = f
    else mem.faculty.push(f)
  }
}

export async function deleteFaculty(id: string): Promise<void> {
  try {
    await pool.query('DELETE FROM faculty WHERE id = $1', [id])
  } catch {
    mem.faculty = mem.faculty.filter(f => f.id !== id)
  }
}

export async function listFacultyUnavailability(facultyId?: string): Promise<FacultyUnavailability[]> {
  try {
    const { rows } = facultyId
      ? await pool.query('SELECT * FROM faculty_unavailability WHERE faculty_id = $1', [facultyId])
      : await pool.query('SELECT * FROM faculty_unavailability')
    return rows.map(r => ({ facultyId: r.faculty_id, day: r.day, period: r.period }))
  } catch {
    return facultyId ? mem.facultyUnavailability.filter(u => u.facultyId === facultyId) : mem.facultyUnavailability
  }
}

export async function addFacultyUnavailability(u: FacultyUnavailability): Promise<void> {
  try {
    await pool.query('INSERT INTO faculty_unavailability (faculty_id, day, period) VALUES ($1, $2, $3)', [
      u.facultyId,
      u.day,
      u.period,
    ])
  } catch {
    mem.facultyUnavailability.push(u)
  }
}

export async function clearFacultyUnavailability(facultyId: string): Promise<void> {
  try {
    await pool.query('DELETE FROM faculty_unavailability WHERE faculty_id = $1', [facultyId])
  } catch {
    mem.facultyUnavailability = mem.facultyUnavailability.filter(u => u.facultyId !== facultyId)
  }
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
  try {
    const { rows } = await pool.query('SELECT * FROM sections ORDER BY name')
    return rows.map(r => ({ id: r.id, name: r.name, year: r.year, semester: r.semester, studentCount: r.student_count ?? null }))
  } catch {
    return mem.sections
  }
}

export async function upsertSection(s: Section): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO sections (id, name, year, semester, student_count) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, year = EXCLUDED.year, semester = EXCLUDED.semester, student_count = EXCLUDED.student_count`,
      [s.id, s.name, s.year, s.semester, s.studentCount ?? null]
    )
  } catch {
    const idx = mem.sections.findIndex(x => x.id === s.id)
    if (idx >= 0) mem.sections[idx] = s
    else mem.sections.push(s)
  }
}

export async function deleteSection(id: string): Promise<void> {
  try {
    await pool.query('DELETE FROM sections WHERE id = $1', [id])
  } catch {
    mem.sections = mem.sections.filter(s => s.id !== id)
  }
}

// ---------- Canonical Stage-1 model ---------------------------------------

export async function listSubjects(): Promise<Subject[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM subjects ORDER BY name')
    return rows.map(toSubject)
  } catch {
    return mem.subjects
  }
}

export async function getSubject(id: string): Promise<Subject | undefined> {
  try {
    const { rows } = await pool.query('SELECT * FROM subjects WHERE id = $1', [id])
    return rows[0] ? toSubject(rows[0]) : undefined
  } catch {
    return mem.subjects.find(s => s.id === id)
  }
}

export async function upsertSubject(s: Subject): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO subjects (id, code, name, delivery_type, category)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name,
         delivery_type = EXCLUDED.delivery_type, category = EXCLUDED.category`,
      [s.id, s.code, s.name, s.deliveryType, s.category]
    )
  } catch {
    const idx = mem.subjects.findIndex(x => x.id === s.id)
    if (idx >= 0) mem.subjects[idx] = s
    else mem.subjects.push(s)
  }
}

export async function deleteSubject(id: string): Promise<void> {
  try {
    await pool.query('DELETE FROM subjects WHERE id = $1', [id])
  } catch {
    mem.subjects = mem.subjects.filter(s => s.id !== id)
  }
}

function toSubject(row: any): Subject {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    deliveryType: row.delivery_type,
    category: row.category,
  }
}

export async function listSectionSubjects(): Promise<SectionSubject[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM section_subjects ORDER BY section_id, subject_id')
    return rows.map(toSectionSubject)
  } catch {
    return mem.sectionSubjects
  }
}

export async function upsertSectionSubject(s: Omit<SectionSubject, 'id'>): Promise<number> {
  try {
    const { rows } = await pool.query(
      `INSERT INTO section_subjects
         (section_id, subject_id, theory_periods, lab_periods, lab_block_length)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (section_id, subject_id) DO UPDATE SET
         theory_periods = EXCLUDED.theory_periods,
         lab_periods = EXCLUDED.lab_periods,
         lab_block_length = EXCLUDED.lab_block_length
       RETURNING id`,
      [s.sectionId, s.subjectId, s.theoryPeriods, s.labPeriods, s.labBlockLength ?? null]
    )
    return rows[0].id as number
  } catch {
    const existing = mem.sectionSubjects.find(x => x.sectionId === s.sectionId && x.subjectId === s.subjectId)
    if (existing) {
      existing.theoryPeriods = s.theoryPeriods
      existing.labPeriods = s.labPeriods
      existing.labBlockLength = s.labBlockLength ?? null
      return existing.id
    }
    const id = mem.sectionSubjects.length + 1
    const newSs = { id, ...s } as SectionSubject
    mem.sectionSubjects.push(newSs)
    return id
  }
}

function toSectionSubject(row: any): SectionSubject {
  return {
    id: row.id,
    sectionId: row.section_id,
    subjectId: row.subject_id,
    theoryPeriods: row.theory_periods,
    labPeriods: row.lab_periods,
    labBlockLength: row.lab_block_length ?? null,
  }
}

export async function listTeachingAssignments(): Promise<TeachingAssignment[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM teaching_assignments ORDER BY section_subject_id, component, batch NULLS FIRST, faculty_id')
    return rows.map(toTeachingAssignment)
  } catch {
    return mem.teachingAssignments
  }
}

export async function addTeachingAssignment(a: Omit<TeachingAssignment, 'id'>): Promise<number> {
  try {
    const { rows } = await pool.query(
      `INSERT INTO teaching_assignments
         (faculty_id, section_subject_id, component, batch)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (faculty_id, section_subject_id, component, batch) DO NOTHING
       RETURNING id`,
      [a.facultyId, a.sectionSubjectId, a.component, a.batch ?? '']
    )
    if (rows[0]) return rows[0].id as number
    const existing = await pool.query(
      `SELECT id FROM teaching_assignments
       WHERE faculty_id = $1 AND section_subject_id = $2
         AND component = $3 AND batch IS NOT DISTINCT FROM $4`,
      [a.facultyId, a.sectionSubjectId, a.component, a.batch ?? '']
    )
    return existing.rows[0].id as number
  } catch {
    const id = mem.teachingAssignments.length + 1
    mem.teachingAssignments.push({ id, ...a } as TeachingAssignment)
    return id
  }
}

export async function removeTeachingAssignment(id: number): Promise<void> {
  try {
    await pool.query('DELETE FROM teaching_assignments WHERE id = $1', [id])
  } catch {
    mem.teachingAssignments = mem.teachingAssignments.filter(x => x.id !== id)
  }
}

function toTeachingAssignment(row: any): TeachingAssignment {
  return {
    id: row.id,
    facultyId: row.faculty_id,
    sectionSubjectId: row.section_subject_id,
    component: row.component as TeachingComponent,
    batch: row.batch ?? null,
  }
}

export async function listLabsForSubject(subjectId: string, sectionId?: string | null): Promise<string[]> {
  try {
    if (sectionId) {
      const specific = await pool.query(
        'SELECT lab_id FROM lab_mapping WHERE subject_id = $1 AND section_id = $2 ORDER BY lab_id',
        [subjectId, sectionId]
      )
      if (specific.rows.length > 0) return specific.rows.map(r => r.lab_id)
    }
    const global = await pool.query(
      'SELECT lab_id FROM lab_mapping WHERE subject_id = $1 AND section_id IS NULL ORDER BY lab_id',
      [subjectId]
    )
    return global.rows.map(r => r.lab_id)
  } catch {
    if (sectionId) {
      const specific = mem.labMappings.filter(m => m.subjectId === subjectId && m.sectionId === sectionId)
      if (specific.length > 0) return specific.map(m => m.labId)
    }
    return mem.labMappings.filter(m => m.subjectId === subjectId && !m.sectionId).map(m => m.labId)
  }
}

export async function getAllLabsBySubject(): Promise<Map<string, string[]>> {
  try {
    const { rows } = await pool.query('SELECT subject_id, lab_id FROM lab_mapping WHERE section_id IS NULL ORDER BY subject_id, lab_id')
    const map = new Map<string, string[]>()
    for (const r of rows) {
      if (!map.has(r.subject_id)) map.set(r.subject_id, [])
      map.get(r.subject_id)!.push(r.lab_id)
    }
    return map
  } catch {
    const map = new Map<string, string[]>()
    for (const m of mem.labMappings) {
      if (!m.sectionId) {
        if (!map.has(m.subjectId)) map.set(m.subjectId, [])
        map.get(m.subjectId)!.push(m.labId)
      }
    }
    return map
  }
}

export async function getAllLabsBySectionSubject(): Promise<Map<string, string[]>> {
  try {
    const { rows } = await pool.query('SELECT section_id, subject_id, lab_id FROM lab_mapping ORDER BY section_id NULLS FIRST, subject_id, lab_id')
    const map = new Map<string, string[]>()
    for (const r of rows) {
      if (r.section_id === null) {
        const key = `GLOBAL::${r.subject_id}`
        const arr = map.get(key) ?? []
        arr.push(r.lab_id)
        map.set(key, arr)
      } else {
        const key = `${r.section_id}::${r.subject_id}`
        const arr = map.get(key) ?? []
        arr.push(r.lab_id)
        map.set(key, arr)
      }
    }
    return map
  } catch {
    const map = new Map<string, string[]>()
    for (const m of mem.labMappings) {
      const key = m.sectionId ? `${m.sectionId}::${m.subjectId}` : `GLOBAL::${m.subjectId}`
      const arr = map.get(key) ?? []
      arr.push(m.labId)
      map.set(key, arr)
    }
    return map
  }
}

export async function setLabSubjectMapping(labId: string, subjectId: string, sectionId?: string | null): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO lab_mapping (lab_id, subject_id, section_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [labId, subjectId, sectionId ?? null]
    )
  } catch {
    if (!mem.labMappings.some(m => m.labId === labId && m.subjectId === subjectId && m.sectionId === (sectionId ?? null))) {
      mem.labMappings.push({ labId, subjectId, sectionId: sectionId ?? null })
    }
  }
}

export async function deleteLabSubjectMapping(labId: string, subjectId: string, sectionId?: string | null): Promise<void> {
  try {
    if (sectionId) {
      await pool.query('DELETE FROM lab_mapping WHERE lab_id = $1 AND subject_id = $2 AND section_id = $3', [labId, subjectId, sectionId])
    } else {
      await pool.query('DELETE FROM lab_mapping WHERE lab_id = $1 AND subject_id = $2 AND section_id IS NULL', [labId, subjectId])
    }
  } catch {
    mem.labMappings = mem.labMappings.filter(m => !(m.labId === labId && m.subjectId === subjectId && m.sectionId === (sectionId ?? null)))
  }
}

export async function listLabSubjectMappings(): Promise<Array<{ labId: string; subjectId: string; sectionId: string | null }>> {
  try {
    const { rows } = await pool.query('SELECT lab_id, subject_id, section_id FROM lab_mapping ORDER BY lab_id, subject_id, section_id NULLS FIRST')
    return rows.map(r => ({ labId: r.lab_id, subjectId: r.subject_id, sectionId: r.section_id ?? null }))
  } catch {
    return mem.labMappings
  }
}

export async function replaceCanonicalImport(dataset: import('../import/types.js').CanonicalImportDataset): Promise<void> {
  mem.faculty = [...dataset.faculty]
  mem.sections = [...dataset.sections]
  mem.subjects = [...dataset.subjects]
  mem.labs = [...dataset.labs]
  mem.labMappings = [...dataset.labMappings]
  mem.facultyUnavailability = [...dataset.facultyUnavailability]
  if (dataset.scheduleConfig) mem.scheduleConfig = dataset.scheduleConfig

  mem.sectionSubjects = dataset.sectionSubjects.map((s, idx) => ({ id: idx + 1, ...s }))
  const ssMap = new Map<string, number>()
  for (const ss of mem.sectionSubjects) ssMap.set(`${ss.sectionId}::${ss.subjectId}`, ss.id)

  mem.teachingAssignments = dataset.teachingAssignments.map((a, idx) => ({
    id: idx + 1,
    facultyId: a.facultyId,
    sectionSubjectId: ssMap.get(`${a.sectionId}::${a.subjectId}`) ?? idx + 1,
    component: a.component,
    batch: a.batch ?? null,
  }))

  mem.generationRuns = []
  mem.assignments = []
  mem.conflicts = []
  mem.unscheduled = []

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM generation_runs')
      await client.query('DELETE FROM teaching_assignments')
      await client.query('DELETE FROM section_subjects')
      await client.query('DELETE FROM lab_mapping')
      await client.query('DELETE FROM faculty_unavailability')
      await client.query('DELETE FROM faculty')
      await client.query('DELETE FROM sections')
      await client.query('DELETE FROM subjects')
      await client.query('DELETE FROM labs')

      for (const f of dataset.faculty) await client.query(`INSERT INTO faculty (id,name,designation,max_daily_periods,max_weekly_periods) VALUES ($1,$2,$3,$4,$5)`, [f.id,f.name,f.designation,f.maxDailyPeriods,f.maxWeeklyPeriods])
      for (const s of dataset.sections) await client.query(`INSERT INTO sections (id,name,year,semester,student_count) VALUES ($1,$2,$3,$4,$5)`, [s.id,s.name,s.year,s.semester,s.studentCount ?? null])
      for (const s of dataset.subjects) await client.query(`INSERT INTO subjects (id,code,name,delivery_type,category) VALUES ($1,$2,$3,$4,$5)`, [s.id,s.code,s.name,s.deliveryType,s.category])
      for (const l of dataset.labs) await client.query(`INSERT INTO labs (id,name,capacity) VALUES ($1,$2,$3)`, [l.id,l.name,l.capacity ?? null])

      const offeringIds = new Map<string, number>()
      for (const o of dataset.sectionSubjects) {
        const r = await client.query(`INSERT INTO section_subjects (section_id,subject_id,theory_periods,lab_periods,lab_block_length) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [o.sectionId,o.subjectId,o.theoryPeriods,o.labPeriods,o.labBlockLength ?? null])
        offeringIds.set(`${o.sectionId}::${o.subjectId}`, r.rows[0].id)
      }
      for (const a of dataset.teachingAssignments) {
        const offeringId = offeringIds.get(`${a.sectionId}::${a.subjectId}`)
        if (!offeringId) throw new Error(`Missing section-subject for teaching assignment ${a.sectionId}/${a.subjectId}`)
        await client.query(`INSERT INTO teaching_assignments (faculty_id,section_subject_id,component,batch) VALUES ($1,$2,$3,$4)`, [a.facultyId,offeringId,a.component,a.batch ?? ''])
      }
      for (const m of dataset.labMappings) await client.query(`INSERT INTO lab_mapping (lab_id,subject_id,section_id) VALUES ($1,$2,$3)`, [m.labId,m.subjectId,m.sectionId ?? null])
      for (const u of dataset.facultyUnavailability) await client.query(`INSERT INTO faculty_unavailability (faculty_id,day,period) VALUES ($1,$2,$3)`, [u.facultyId,u.day,u.period])
      if (dataset.scheduleConfig) {
        await client.query(`INSERT INTO schedule_config (id,working_days,periods) VALUES (1,$1,$2) ON CONFLICT (id) DO UPDATE SET working_days=EXCLUDED.working_days, periods=EXCLUDED.periods`, [JSON.stringify(dataset.scheduleConfig.workingDays), JSON.stringify(dataset.scheduleConfig.periods)])
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.warn('PostgreSQL connection unavailable; operating in memory-fallback mode.')
  }
}

// ---------- Courses ----------

export async function listCourses(): Promise<Course[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM courses ORDER BY name')
    return rows.map(toCourse)
  } catch {
    return []
  }
}

export async function getCourse(id: string): Promise<Course | undefined> {
  try {
    const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1', [id])
    return rows[0] ? toCourse(rows[0]) : undefined
  } catch {
    return undefined
  }
}

export async function upsertCourse(c: Course): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO courses (id, code, name, component_type, lab_block_length)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name,
         component_type = EXCLUDED.component_type, lab_block_length = EXCLUDED.lab_block_length`,
      [c.id, c.code, c.name, c.componentType, c.labBlockLength]
    )
  } catch {}
}

export async function deleteCourse(id: string): Promise<void> {
  try {
    await pool.query('DELETE FROM courses WHERE id = $1', [id])
  } catch {}
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
  try {
    const { rows } = await pool.query('SELECT * FROM labs ORDER BY name')
    return rows.map(r => ({ id: r.id, name: r.name, capacity: r.capacity ?? null }))
  } catch {
    return mem.labs
  }
}

export async function upsertLab(l: Lab): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO labs (id, name, capacity) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, capacity = EXCLUDED.capacity`,
      [l.id, l.name, l.capacity ?? null]
    )
  } catch {
    const idx = mem.labs.findIndex(x => x.id === l.id)
    if (idx >= 0) mem.labs[idx] = l
    else mem.labs.push(l)
  }
}

export async function deleteLab(id: string): Promise<void> {
  try {
    await pool.query('DELETE FROM labs WHERE id = $1', [id])
  } catch {
    mem.labs = mem.labs.filter(l => l.id !== id)
  }
}

export async function listLabCourseMappings(): Promise<LabCourseMapping[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM lab_course_mapping')
    return rows.map(r => ({ labId: r.lab_id, courseId: r.course_id }))
  } catch {
    return []
  }
}

export async function setLabCourseMapping(labId: string, courseId: string): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO lab_course_mapping (lab_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [labId, courseId]
    )
  } catch {}
}

export async function deleteLabCourseMapping(labId: string, courseId: string): Promise<void> {
  try {
    await pool.query('DELETE FROM lab_course_mapping WHERE lab_id = $1 AND course_id = $2', [labId, courseId])
  } catch {}
}

export async function labsForCourse(courseId: string): Promise<string[]> {
  try {
    const { rows } = await pool.query('SELECT lab_id FROM lab_course_mapping WHERE course_id = $1', [courseId])
    return rows.map(r => r.lab_id)
  } catch {
    return []
  }
}

export async function getAllLabsByCourse(): Promise<Map<string, string[]>> {
  try {
    const { rows } = await pool.query('SELECT course_id, lab_id FROM lab_course_mapping')
    const map = new Map<string, string[]>()
    for (const r of rows) {
      if (!map.has(r.course_id)) map.set(r.course_id, [])
      map.get(r.course_id)!.push(r.lab_id)
    }
    return map
  } catch {
    return new Map()
  }
}

// ---------- Course requirements ----------

export async function listCourseRequirements(): Promise<CourseRequirement[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM course_requirements')
    return rows.map(toRequirement)
  } catch {
    return []
  }
}

export async function upsertCourseRequirement(r: Omit<CourseRequirement, 'id'>): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO course_requirements (course_id, section_id, weekly_theory_periods, weekly_lab_periods)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (course_id, section_id) DO UPDATE SET
         weekly_theory_periods = EXCLUDED.weekly_theory_periods,
         weekly_lab_periods = EXCLUDED.weekly_lab_periods`,
      [r.courseId, r.sectionId, r.weeklyTheoryPeriods, r.weeklyLabPeriods]
    )
  } catch {}
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

// ---------- Teacher assignments ----------

export async function listTeacherAssignments(): Promise<TeacherAssignment[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM teacher_assignments')
    return rows.map(toTeacherAssignment)
  } catch {
    return []
  }
}

export async function upsertTeacherAssignment(a: Omit<TeacherAssignment, 'id'>): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO teacher_assignments (faculty_id, course_id, section_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (course_id, section_id) DO UPDATE SET faculty_id = EXCLUDED.faculty_id`,
      [a.facultyId, a.courseId, a.sectionId]
    )
  } catch {}
}

function toTeacherAssignment(row: any): TeacherAssignment {
  return { id: row.id, facultyId: row.faculty_id, courseId: row.course_id, sectionId: row.section_id }
}

// ---------- Schedule config ----------

export async function getScheduleConfig(): Promise<ScheduleConfig> {
  try {
    const { rows } = await pool.query('SELECT * FROM schedule_config WHERE id = 1')
    const row = rows[0]
    return { workingDays: JSON.parse(row.working_days), periods: JSON.parse(row.periods) }
  } catch {
    return mem.scheduleConfig
  }
}

export async function setScheduleConfig(cfg: ScheduleConfig): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO schedule_config (id, working_days, periods) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET working_days = EXCLUDED.working_days, periods = EXCLUDED.periods`,
      [JSON.stringify(cfg.workingDays), JSON.stringify(cfg.periods)]
    )
  } catch {
    mem.scheduleConfig = cfg
  }
}

// ---------- Generation runs / assignments / conflicts ----------

export async function createRun(status: TimetableStatus, warnings: string[]): Promise<number> {
  try {
    const { rows } = await pool.query(
      'INSERT INTO generation_runs (status, generated_at, warnings) VALUES ($1, $2, $3) RETURNING id',
      [status, new Date().toISOString(), JSON.stringify(warnings)]
    )
    return rows[0].id as number
  } catch {
    const id = mem.nextRunId++
    mem.generationRuns.push({ id, status, generatedAt: new Date().toISOString(), warnings })
    return id
  }
}

export async function saveAssignments(runId: number, assignments: Assignment[]): Promise<void> {
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const a of assignments) {
        await client.query(
          `INSERT INTO assignments
             (run_id, day, start_period, end_period, section_id, course_id, subject_id, section_subject_id, faculty_id, block_type, batch, lab_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            runId, a.day, a.startPeriod, a.endPeriod, a.sectionId,
            a.subjectId ? null : (a.courseId || null),
            a.subjectId ?? null,
            a.sectionSubjectId ?? null,
            a.facultyId, a.blockType, a.batch ?? '', a.labId ?? null,
          ]
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch {
    for (const a of assignments) mem.assignments.push({ ...a, runId })
  }
}

export async function saveConflicts(runId: number, conflicts: Conflict[]): Promise<void> {
  try {
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
  } catch {
    for (const c of conflicts) mem.conflicts.push({ ...c, runId })
  }
}

export async function saveUnscheduled(runId: number, units: SchedulableUnit[]): Promise<void> {
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const u of units) {
        await client.query(
          `INSERT INTO unscheduled
             (run_id, section_id, course_id, faculty_id, subject_id, section_subject_id, block_type, batch, length)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            runId, u.sectionId,
            u.subjectId ? null : (u.courseId || null),
            u.facultyId ?? null,
            u.subjectId ?? null,
            u.sectionSubjectId ?? null,
            u.blockType, u.batch ?? '', u.length,
          ]
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch {
    for (const u of units) mem.unscheduled.push({ ...u, runId })
  }
}

export async function getLatestValidRun(): Promise<{ id: number; status: TimetableStatus; generatedAt: string } | undefined> {
  try {
    const { rows } = await pool.query(
      `SELECT id, status, generated_at as "generatedAt" FROM generation_runs
       WHERE status IN ('GREEN','YELLOW') ORDER BY id DESC LIMIT 1`
    )
    return rows[0]
  } catch {
    const r = [...mem.generationRuns].reverse().find(x => x.status === 'GREEN' || x.status === 'YELLOW')
    return r ? { id: r.id, status: r.status, generatedAt: r.generatedAt } : undefined
  }
}

export async function getRun(runId: number): Promise<any> {
  try {
    const { rows } = await pool.query('SELECT * FROM generation_runs WHERE id = $1', [runId])
    return rows[0]
  } catch {
    const r = mem.generationRuns.find(x => x.id === runId)
    return r ? { id: r.id, status: r.status, generated_at: r.generatedAt, warnings: JSON.stringify(r.warnings) } : undefined
  }
}

export async function getAssignmentsForRun(runId: number): Promise<Assignment[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM assignments WHERE run_id = $1', [runId])
    return rows.map(r => ({
      day: r.day,
      startPeriod: r.start_period,
      endPeriod: r.end_period,
      sectionId: r.section_id,
      courseId: r.subject_id ?? r.course_id ?? '',
      subjectId: r.subject_id ?? undefined,
      sectionSubjectId: r.section_subject_id ?? undefined,
      facultyId: r.faculty_id,
      blockType: r.block_type,
      batch: r.batch ?? null,
      labId: r.lab_id ?? undefined,
    }))
  } catch {
    return mem.assignments.filter(a => a.runId === runId)
  }
}

export async function getConflictsForRun(runId: number): Promise<Conflict[]> {
  try {
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
  } catch {
    return mem.conflicts.filter(c => c.runId === runId)
  }
}

export async function getUnscheduledForRun(runId: number): Promise<SchedulableUnit[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM unscheduled WHERE run_id = $1', [runId])
    return rows.map(r => ({
      unitId: `${r.section_id}:${r.subject_id ?? r.course_id}:${r.id}`,
      sectionId: r.section_id,
      courseId: r.subject_id ?? r.course_id ?? '',
      subjectId: r.subject_id ?? undefined,
      sectionSubjectId: r.section_subject_id ?? undefined,
      facultyId: r.faculty_id ?? undefined,
      blockType: r.block_type,
      batch: r.batch ?? null,
      length: r.length,
    }))
  } catch {
    return mem.unscheduled.filter(u => u.runId === runId).map((r, i) => ({
      unitId: `${r.sectionId}:${r.subjectId ?? r.courseId}:${i + 1}`,
      sectionId: r.sectionId,
      courseId: r.subjectId ?? r.courseId ?? '',
      subjectId: r.subjectId ?? undefined,
      sectionSubjectId: r.sectionSubjectId ?? undefined,
      facultyId: r.facultyId ?? undefined,
      blockType: r.blockType,
      batch: r.batch ?? null,
      length: r.length,
    }))
  }
}
