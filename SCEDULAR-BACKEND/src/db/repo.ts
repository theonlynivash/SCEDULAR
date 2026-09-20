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
  FacultySubjectPreference,
  FacultySubjectHistory,
  SubjectDemandItem,
  PreferenceStatus,
  SessionRecord,
} from '../types.js'
import { DEFAULT_ALLOCATION_CONFIG, type AllocationConfig } from '../utils/allocationPolicy.js'
import { normalizeCycle, DEFAULT_CURRENT_CYCLE, type AcademicCycle } from '../utils/academicCycle.js'
import { REAL_FACULTY_ROSTER } from '../seed/facultyRoster.js'
import { REGULATION_2024_CURRICULUM } from '../seed/curriculumRoster.js'
import { KNOWN_SECTIONS_ROSTER, KNOWN_LABS_ROSTER, KNOWN_LAB_MAPPINGS } from '../seed/resourceRoster.js'

import { getLocalDb, saveLocalDb, saveLocalDbSync } from './localDb.js'

// Live database state (backed by local JSON database file or PostgreSQL)
const mem = getLocalDb()

export interface WorkflowResetResult {
  before: Record<string, number>
  after: Record<string, number>
}

export async function resetWorkflowStateRepo(): Promise<WorkflowResetResult> {
  const getCounts = () => ({
    faculty: mem.faculty.length,
    subjects: mem.subjects.length,
    sections: mem.sections.length,
    labs: mem.labs.length,
    labMappings: mem.labMappings.length,
    sectionSubjects: mem.sectionSubjects.length,
    facultyPreferences: mem.facultyPreferences.length,
    teachingAssignments: mem.teachingAssignments.length,
    generationRuns: mem.generationRuns.length,
    assignments: mem.assignments.length,
    conflicts: mem.conflicts.length,
    unscheduled: mem.unscheduled.length,
  })

  const before = getCounts()

  mem.facultyPreferences = []
  mem.teachingAssignments = []
  mem.generationRuns = []
  mem.assignments = []
  mem.conflicts = []
  mem.unscheduled = []
  mem.nextPreferenceId = 1
  mem.nextRunId = 1
  mem.nextTeachingAssignmentId = 1
  saveLocalDb()

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM unscheduled')
      await client.query('DELETE FROM conflicts')
      await client.query('DELETE FROM assignments')
      await client.query('DELETE FROM generation_runs')
      await client.query('DELETE FROM teaching_assignments')
      await client.query('DELETE FROM faculty_subject_preferences')
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

  const after = getCounts()
  return { before, after }
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
      `INSERT INTO faculty (id, name, designation, department, previous_experience, current_experience, allocation_experience, email, phone, role, max_daily_periods, max_weekly_periods)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         designation = EXCLUDED.designation,
         department = EXCLUDED.department,
         previous_experience = EXCLUDED.previous_experience,
         current_experience = EXCLUDED.current_experience,
         allocation_experience = EXCLUDED.allocation_experience,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         role = EXCLUDED.role,
         max_daily_periods = EXCLUDED.max_daily_periods,
         max_weekly_periods = EXCLUDED.max_weekly_periods`,
      [
        f.id,
        f.name,
        f.designation ?? null,
        f.department ?? 'AI & DS',
        f.previousExperience ?? null,
        f.currentExperience ?? null,
        f.allocationExperience ?? null,
        f.email ?? null,
        f.phone ?? null,
        f.role ?? 'FACULTY',
        f.maxDailyPeriods ?? 6,
        f.maxWeeklyPeriods ?? 24,
      ]
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
    department: row.department ?? 'AI & DS',
    previousExperience: row.previous_experience ?? undefined,
    currentExperience: row.current_experience ?? undefined,
    allocationExperience: row.allocation_experience ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    role: row.role ?? 'FACULTY',
    maxDailyPeriods: row.max_daily_periods,
    maxWeeklyPeriods: row.max_weekly_periods,
  }
}

// ---------- Sections ----------

export async function listSections(): Promise<Section[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM sections ORDER BY name')
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      year: r.year,
      semester: r.semester,
      department: r.department ?? 'AI & DS',
      studentCount: r.student_count ?? null,
      active: r.active ?? true,
    }))
  } catch {
    return mem.sections
  }
}

export async function upsertSection(s: Section): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO sections (id, name, year, semester, department, student_count, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         year = EXCLUDED.year,
         semester = EXCLUDED.semester,
         department = EXCLUDED.department,
         student_count = EXCLUDED.student_count,
         active = EXCLUDED.active`,
      [s.id, s.name, s.year, s.semester, s.department ?? 'AI & DS', s.studentCount ?? null, s.active ?? true]
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
    credits: row.credits ?? 0,
    year: row.year ?? undefined,
    semester: row.semester ?? undefined,
    theoryPeriods: row.theory_periods ?? 3,
    labPeriods: row.lab_periods ?? 0,
    vertical: row.vertical ?? null,
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

export async function bulkReplaceTeachingAssignments(
  sectionSubjectIds: number[],
  assignments: Array<Omit<TeachingAssignment, 'id'>>
): Promise<number[]> {
  try {
    if (sectionSubjectIds.length > 0) {
      await pool.query('DELETE FROM teaching_assignments WHERE section_subject_id = ANY($1::int[])', [sectionSubjectIds])
    }
    const createdIds: number[] = []
    for (const a of assignments) {
      const id = await addTeachingAssignment(a)
      createdIds.push(id)
    }
    return createdIds
  } catch {
    mem.teachingAssignments = mem.teachingAssignments.filter(x => !sectionSubjectIds.includes(x.sectionSubjectId))
    const createdIds: number[] = []
    for (const a of assignments) {
      const id = mem.teachingAssignments.length + 1
      mem.teachingAssignments.push({ id, ...a } as TeachingAssignment)
      createdIds.push(id)
    }
    return createdIds
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

function subjectsToCourses(subjects: Subject[]): Course[] {
  const converted: Course[] = []
  for (const s of subjects) {
    if (s.deliveryType === 'INTEGRATED') {
      converted.push({
        id: s.code,
        code: s.code,
        name: s.name,
        componentType: 'INTEGRATED_THEORY',
        labBlockLength: s.labPeriods || 3,
      })
      converted.push({
        id: `${s.code}_LAB`,
        code: `${s.code}_LAB`,
        name: `${s.name} Laboratory`,
        componentType: 'INTEGRATED_LAB',
        labBlockLength: s.labPeriods || 3,
      })
    } else if (s.deliveryType === 'LAB') {
      converted.push({
        id: s.code,
        code: s.code,
        name: s.name,
        componentType: 'LAB_ONLY',
        labBlockLength: s.labPeriods || 3,
      })
    } else {
      const comp = s.category === 'MANDATORY' ? 'MANDATORY' : s.category === 'ADDITIONAL' ? 'ADDITIONAL' : 'THEORY_ONLY'
      converted.push({
        id: s.code,
        code: s.code,
        name: s.name,
        componentType: comp,
        labBlockLength: 3,
      })
    }
  }
  return converted
}

export async function listCourses(): Promise<Course[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM courses ORDER BY name')
    if (rows.length > 0) return rows.map(toCourse)
  } catch {}

  const subjects = await listSubjects()
  return subjectsToCourses(subjects)
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
    const { rows } = await pool.query('SELECT * FROM labs ORDER BY id')
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      room: r.room ?? r.id,
      department: r.department ?? 'AI & DS',
      capacity: r.capacity ?? null,
      capacitySource: r.capacity_source ?? 'NOT_SPECIFIED',
      active: r.active ?? true,
      notes: r.notes ?? undefined,
    }))
  } catch {
    return mem.labs
  }
}

export async function upsertLab(l: Lab): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO labs (id, name, room, department, capacity, capacity_source, active, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         room = EXCLUDED.room,
         department = EXCLUDED.department,
         capacity = EXCLUDED.capacity,
         capacity_source = EXCLUDED.capacity_source,
         active = EXCLUDED.active,
         notes = EXCLUDED.notes`,
      [l.id, l.name, l.room ?? l.id, l.department ?? 'AI & DS', l.capacity ?? null, l.capacitySource ?? 'NOT_SPECIFIED', l.active ?? true, l.notes ?? null]
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

// ---------------------------------------------------------------------------
// Faculty Allocation & Preference Repository Methods
// ---------------------------------------------------------------------------

export async function getAllocationSettings(): Promise<AllocationConfig> {
  try {
    const { rows } = await pool.query('SELECT config_json FROM allocation_settings WHERE id = 1')
    if (rows.length > 0 && rows[0].config_json) {
      return JSON.parse(rows[0].config_json)
    }
  } catch {
    // fallback
  }
  return mem.allocationSettings
}

export async function saveAllocationSettings(config: AllocationConfig): Promise<AllocationConfig> {
  try {
    const jsonStr = JSON.stringify(config)
    await pool.query(
      'INSERT INTO allocation_settings (id, config_json) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET config_json = EXCLUDED.config_json',
      [jsonStr]
    )
  } catch {
    // fallback
  }
  mem.allocationSettings = config
  return config
}

// ---------------------------------------------------------------------------
// Academic cycle configuration (ODD | EVEN | BOTH). The current cycle is
// persisted (DB-configurable), never hardcoded in the frontend. Falls back to
// the in-memory/local JSON DB when Postgres is unavailable, matching the
// dual-mode pattern used by every other config accessor here.
// ---------------------------------------------------------------------------

export async function getCurrentAcademicCycle(): Promise<AcademicCycle> {
  try {
    const { rows } = await pool.query('SELECT current_cycle FROM academic_cycle_config WHERE id = 1')
    if (rows.length > 0 && rows[0].current_cycle) {
      return normalizeCycle(rows[0].current_cycle)
    }
  } catch {
    // fallback to local DB state
  }
  return normalizeCycle(mem.currentAcademicCycle, DEFAULT_CURRENT_CYCLE)
}

export async function setCurrentAcademicCycle(cycle: AcademicCycle): Promise<AcademicCycle> {
  const normalized = normalizeCycle(cycle)
  try {
    await pool.query(
      'INSERT INTO academic_cycle_config (id, current_cycle) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET current_cycle = EXCLUDED.current_cycle',
      [normalized]
    )
  } catch {
    // fallback to local DB state
  }
  mem.currentAcademicCycle = normalized
  saveLocalDbSync()
  return normalized
}

export async function getFacultyPreferences(facultyId?: string): Promise<FacultySubjectPreference[]> {
  try {
    let sql = 'SELECT * FROM faculty_subject_preferences'
    const params: any[] = []
    if (facultyId) {
      sql += ' WHERE faculty_id = $1'
      params.push(facultyId)
    }
    sql += ' ORDER BY academic_year, preference_rank'
    const { rows } = await pool.query(sql, params)
    if (rows.length > 0) {
      return rows.map(r => ({
        id: r.id,
        facultyId: r.faculty_id,
        subjectId: r.subject_id,
        academicYear: r.academic_year,
        semester: r.semester,
        preferenceRank: r.preference_rank,
        requestedSections: r.requested_sections,
        labConfirmed: Boolean(r.lab_confirmed),
        status: r.status,
        submittedAt: r.submitted_at ?? undefined,
        reviewedAt: r.reviewed_at ?? undefined,
        reviewedBy: r.reviewed_by ?? undefined,
        hodComment: r.hod_comment ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    }
  } catch {
    // fallback
  }

  if (facultyId) {
    return mem.facultyPreferences.filter(p => p.facultyId === facultyId)
  }
  return mem.facultyPreferences
}

export async function saveFacultyPreferences(
  facultyId: string,
  items: Array<{
    subjectId: string
    academicYear: string
    semester: string
    preferenceRank: number
    requestedSections: number
    labConfirmed: boolean
  }>,
  status: PreferenceStatus
): Promise<FacultySubjectPreference[]> {
  const now = new Date().toISOString()

  // A SUBMITTED or APPROVED batch is locked: the faculty may not overwrite it.
  // Editing resumes only when the HOD releases it (e.g. CHANGES_REQUESTED) or the
  // workflow is reset. Enforced here so no caller can bypass the route guard.
  const lockedExisting = mem.facultyPreferences.find(
    p => p.facultyId === facultyId && (p.status === 'SUBMITTED' || p.status === 'APPROVED')
  )
  if (lockedExisting) {
    throw new Error(`PREFERENCES_LOCKED: existing ${lockedExisting.status} preference cannot be edited`)
  }

  // Remove existing DRAFT/CHANGES_REQUESTED/REJECTED preferences for this faculty if overwriting
  mem.facultyPreferences = mem.facultyPreferences.filter(
    p => p.facultyId !== facultyId || p.status === 'APPROVED'
  )

  const created: FacultySubjectPreference[] = []
  for (const item of items) {
    const pref: FacultySubjectPreference = {
      id: mem.nextPreferenceId++,
      facultyId,
      subjectId: item.subjectId,
      academicYear: item.academicYear,
      semester: item.semester,
      preferenceRank: item.preferenceRank,
      requestedSections: item.requestedSections || 1,
      labConfirmed: Boolean(item.labConfirmed),
      status,
      submittedAt: status === 'SUBMITTED' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    }
    mem.facultyPreferences.push(pref)
    created.push(pref)

    try {
      await pool.query(
        `INSERT INTO faculty_subject_preferences 
         (faculty_id, subject_id, academic_year, semester, preference_rank, requested_sections, lab_confirmed, status, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          facultyId,
          item.subjectId,
          item.academicYear,
          item.semester,
          item.preferenceRank,
          item.requestedSections || 1,
          item.labConfirmed,
          status,
          status === 'SUBMITTED' ? now : null,
        ]
      )
    } catch {
      // fallback to memory
    }
  }

  return created
}

export async function reviewFacultyPreference(
  preferenceId: number,
  status: PreferenceStatus,
  comment?: string,
  reviewerId?: string
): Promise<FacultySubjectPreference | null> {
  const now = new Date().toISOString()

  const pref = mem.facultyPreferences.find(p => p.id === preferenceId)
  if (!pref) return null

  if (pref.status === 'APPROVED') {
    throw new Error('Cannot modify an APPROVED preference')
  }

  pref.status = status
  pref.hodComment = comment
  pref.reviewedBy = reviewerId
  pref.reviewedAt = now
  pref.updatedAt = now

  try {
    await pool.query(
      `UPDATE faculty_subject_preferences
       SET status = $1, hod_comment = $2, reviewed_by = $3, reviewed_at = $4, updated_at = $4
       WHERE id = $5 AND status != 'APPROVED'`,
      [status, comment ?? null, reviewerId ?? null, now, preferenceId]
    )
  } catch {
    // fallback
  }

  saveLocalDb()
  return pref
}

export interface FacultyPreferenceEdit {
  subjectId?: string
  academicYear?: string
  semester?: string
  preferenceRank?: number
  requestedSections?: number
  labConfirmed?: boolean
}

/**
 * HOD edit of a submitted preference BEFORE approval. An APPROVED preference is
 * locked and can never be mutated here (Section 6: "Do NOT silently mutate
 * approved records"). Returns the updated preference, or null when not found.
 */
export async function editFacultyPreference(
  preferenceId: number,
  patch: FacultyPreferenceEdit
): Promise<FacultySubjectPreference | null> {
  const pref = mem.facultyPreferences.find(p => p.id === preferenceId)
  if (!pref) return null

  if (pref.status === 'APPROVED') {
    throw new Error('Cannot edit an APPROVED preference')
  }

  if (patch.subjectId !== undefined) pref.subjectId = patch.subjectId
  if (patch.academicYear !== undefined) pref.academicYear = patch.academicYear
  if (patch.semester !== undefined) pref.semester = patch.semester
  if (patch.preferenceRank !== undefined) pref.preferenceRank = patch.preferenceRank
  if (patch.requestedSections !== undefined) pref.requestedSections = patch.requestedSections
  if (patch.labConfirmed !== undefined) pref.labConfirmed = patch.labConfirmed
  pref.updatedAt = new Date().toISOString()

  try {
    await pool.query(
      `UPDATE faculty_subject_preferences
       SET subject_id = $1, academic_year = $2, semester = $3, preference_rank = $4,
           requested_sections = $5, lab_confirmed = $6, updated_at = $7
       WHERE id = $8 AND status != 'APPROVED'`,
      [
        pref.subjectId,
        pref.academicYear,
        pref.semester,
        pref.preferenceRank,
        pref.requestedSections,
        pref.labConfirmed,
        pref.updatedAt,
        preferenceId,
      ]
    )
  } catch {
    // local/in-memory mode
  }

  saveLocalDb()
  return pref
}

export async function updateFacultyExperience(
  facultyId: string,
  allocationExperience: number
): Promise<void> {
  const f = mem.faculty.find(x => x.id === facultyId)
  if (f) {
    f.allocationExperience = allocationExperience
  }
  try {
    await pool.query('UPDATE faculty SET allocation_experience = $1 WHERE id = $2', [
      allocationExperience,
      facultyId,
    ])
  } catch {
    // fallback
  }
}

export interface FacultyExperienceUpdate {
  previousExperience?: number
  currentExperience?: number
  allocationExperience?: number
}

/**
 * Persist faculty experience fields independently. Previous, current and
 * allocation experience are distinct concepts and are never inferred from each
 * other (or from designation). Returns the freshly-read faculty record, or
 * undefined when the faculty id does not exist.
 */
export async function updateFacultyExperienceFields(
  facultyId: string,
  fields: FacultyExperienceUpdate
): Promise<Faculty | undefined> {
  const existing = await getFaculty(facultyId)
  if (!existing) return undefined

  const target = mem.faculty.find(x => x.id === facultyId)
  if (target) {
    if (fields.previousExperience !== undefined) target.previousExperience = fields.previousExperience
    if (fields.currentExperience !== undefined) target.currentExperience = fields.currentExperience
    if (fields.allocationExperience !== undefined) target.allocationExperience = fields.allocationExperience
  }

  try {
    const sets: string[] = []
    const params: any[] = []
    let i = 1
    if (fields.previousExperience !== undefined) { sets.push(`previous_experience = $${i++}`); params.push(fields.previousExperience) }
    if (fields.currentExperience !== undefined) { sets.push(`current_experience = $${i++}`); params.push(fields.currentExperience) }
    if (fields.allocationExperience !== undefined) { sets.push(`allocation_experience = $${i++}`); params.push(fields.allocationExperience) }
    if (sets.length > 0) {
      params.push(facultyId)
      await pool.query(`UPDATE faculty SET ${sets.join(', ')} WHERE id = $${i}`, params)
    }
  } catch {
    // local/in-memory mode
  }

  saveLocalDb()
  return getFaculty(facultyId)
}

/**
 * Clear allocationExperience for every faculty member (set to null/undefined),
 * so each teacher must complete their own profile again before the next
 * allocation cycle. Used only by the HOD-authenticated, passkey-gated reset
 * flow -- never called from client-supplied data.
 */
export async function clearAllFacultyAllocationExperience(): Promise<void> {
  for (const f of mem.faculty) {
    delete (f as any).allocationExperience
  }
  try {
    await pool.query('UPDATE faculty SET allocation_experience = NULL')
  } catch {
    // local/in-memory mode
  }
  saveLocalDb()
}

export async function getFacultySubjectHistory(facultyId: string): Promise<FacultySubjectHistory[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM faculty_subject_history WHERE faculty_id = $1', [
      facultyId,
    ])
    if (rows.length > 0) {
      return rows.map(r => ({
        id: r.id,
        facultyId: r.faculty_id,
        academicYear: r.academic_year,
        semester: r.semester,
        subjectName: r.subject_name,
        subjectCode: r.subject_code ?? undefined,
        type: r.type ?? 'THEORY',
        sectionsHandled: r.sections_handled,
      }))
    }
  } catch {
    // fallback
  }

  return mem.facultySubjectHistory.filter(h => h.facultyId === facultyId)
}

export async function getSubjectDemand(semesterFilter?: string, academicYearFilter?: string): Promise<SubjectDemandItem[]> {
  const subjects = await listSubjects()
  const sections = await listSections()
  const secSubs = await listSectionSubjects()
  const allPrefs = await getFacultyPreferences()
  const allFaculty = await listFaculty()
  const facultyMap = new Map(allFaculty.map(f => [f.id, f]))

  const activeSections = sections.filter(s => s.active !== false)

  let filteredSubjects = subjects
  if (semesterFilter) {
    filteredSubjects = filteredSubjects.filter(s => s.semester === semesterFilter)
  }
  if (academicYearFilter) {
    filteredSubjects = filteredSubjects.filter(s => s.year === academicYearFilter)
  }

  const demandMap = new Map<string, SubjectDemandItem>()

  for (const s of filteredSubjects) {
    if (!s.year || !s.semester) continue

    const activeSecsForSub = activeSections.filter(sec => sec.year === s.year && sec.semester === s.semester)
    const matchingSecSubs = secSubs.filter(ss => ss.subjectId === s.id)

    const requiredSections = activeSecsForSub.length > 0 ? activeSecsForSub.length : matchingSecSubs.length

    const theoryP = s.theoryPeriods ?? 0
    const labP = s.labPeriods ?? 0
    const requiredTheoryPeriods = theoryP
    const requiredLabPeriods = labP
    const requiredPeriodsWeekly = requiredSections * (theoryP + labP)

    const prefsForSub = allPrefs.filter(p => p.subjectId === s.id && p.status !== 'REJECTED')
    const submittedCount = prefsForSub.filter(p => p.status === 'SUBMITTED').length
    const approvedCount = prefsForSub.filter(p => p.status === 'APPROVED').length

    let reqSectionTot = 0
    let appSectionTot = 0

    const interestedList = prefsForSub.map(p => {
      reqSectionTot += p.requestedSections || 1
      if (p.status === 'APPROVED') {
        appSectionTot += p.requestedSections || 1
      }
      const fac = facultyMap.get(p.facultyId)
      return {
        preferenceId: p.id,
        facultyId: p.facultyId,
        facultyName: fac?.name ?? p.facultyId,
        designation: fac?.designation ?? 'Faculty',
        allocationExperience: fac?.allocationExperience ?? 0,
        preferenceRank: p.preferenceRank,
        requestedSections: p.requestedSections || 1,
        status: p.status,
        submittedAt: p.submittedAt ?? undefined,
      }
    })

    demandMap.set(s.id, {
      subjectId: s.id,
      subjectCode: s.code,
      subjectName: s.name,
      academicCategory: String(s.category || 'CORE'),
      deliveryType: s.deliveryType || 'THEORY',
      academicYear: s.year,
      semester: s.semester,
      requiredSections,
      requiredTheoryPeriods,
      requiredLabPeriods,
      requiredPeriodsWeekly,
      facultyInterestedCount: prefsForSub.length,
      submittedCount,
      approvedCount,
      requestedSectionTotal: reqSectionTot,
      approvedSectionTotal: appSectionTot,
      interestedFacultyList: interestedList,
    })
  }

  return Array.from(demandMap.values())
}

export async function getSemesterReadinessStatus(): Promise<import('../utils/readinessPolicy.js').SemesterReadiness[]> {
  const { computeSemesterReadiness, getSemesterLabel, ALL_YEAR_SEMESTER_PAIRS } = await import('../utils/readinessPolicy.js')
  const sections = await listSections()
  const subjects = await listSubjects()
  const labs = await listLabs()
  const faculty = await listFaculty()
  const sectionSubjectsList = await listSectionSubjects()
  const teachingAssignmentsList = await listTeachingAssignments()
  const config = await getScheduleConfig()
  const prefs = await getFacultyPreferences()
  const labsBySectionSubject = await getAllLabsBySectionSubject()

  const hasConfiguredSchedule = config.workingDays.length > 0 &&
    config.periods.some(p => p.schedulable)

  const academicYear = '2026-27'

  return ALL_YEAR_SEMESTER_PAIRS.map(({ year, isOdd }) => {
    const semester = getSemesterLabel(year, isOdd)
    const yearSubjects = subjects.filter(s => s.year === year && s.semester === semester)
    const yearSections = sections.filter(s => s.year === year && s.semester === semester && s.active !== false)
    const yearSectionSubjects = sectionSubjectsList.filter(ss =>
      yearSections.some(sec => sec.id === ss.sectionId)
    )
    const yearPrefs = prefs.filter(p => p.academicYear === year && p.semester === semester && p.status === 'APPROVED')

    // 1. DeliveryType-based Weekly Weightage Check
    let weightageMissingCount = 0
    for (const ss of yearSectionSubjects) {
      const subj = subjects.find(s => s.id === ss.subjectId)
      if (!subj) continue
      const dt = subj.deliveryType
      if (dt === 'THEORY' && ss.theoryPeriods <= 0) weightageMissingCount++
      else if (dt === 'LAB' && ss.labPeriods <= 0) weightageMissingCount++
      else if (dt === 'INTEGRATED' && (ss.theoryPeriods <= 0 || ss.labPeriods <= 0)) weightageMissingCount++
    }
    const weightageValid = yearSectionSubjects.length > 0 && weightageMissingCount === 0

    // 2. DeliveryType-based Teaching Assignment Check & Shortage Details
    const shortageDetails: string[] = []
    let unallocatedCount = 0

    const ssBySubject = new Map<string, typeof yearSectionSubjects>()
    for (const ss of yearSectionSubjects) {
      const arr = ssBySubject.get(ss.subjectId) ?? []
      arr.push(ss)
      ssBySubject.set(ss.subjectId, arr)
    }

    for (const subj of yearSubjects) {
      const offerings = ssBySubject.get(subj.id) ?? []
      if (offerings.length === 0) {
        shortageDetails.push(`${subj.name} (${subj.code}): Section offerings not configured`)
        unallocatedCount++
        continue
      }

      let unassignedSectionsForSubj = 0
      for (const ss of offerings) {
        const assigned = teachingAssignmentsList.filter(ta => ta.sectionSubjectId === ss.id)
        const dt = subj.deliveryType
        const hasTheory = assigned.some(ta => ta.component === 'THEORY')
        const hasLab = assigned.some(ta => ta.component === 'LAB')

        if (dt === 'THEORY' && !hasTheory) unassignedSectionsForSubj++
        else if (dt === 'LAB' && !hasLab) unassignedSectionsForSubj++
        else if (dt === 'INTEGRATED' && (!hasTheory || !hasLab)) unassignedSectionsForSubj++
      }

      if (unassignedSectionsForSubj > 0) {
        unallocatedCount++
        shortageDetails.push(`${subj.name} (${subj.code}): Faculty allocation shortage (${unassignedSectionsForSubj}/${offerings.length} sections unassigned)`)
      }
    }

    // 3. Lab mapping check — evaluated per (section, subject) offering, not
    // just per subject overall, since real lab mappings here are almost
    // always section-specific rather than global. A subject with a global
    // mapping is covered for every section; otherwise each offering needs
    // its own `${sectionId}::${subjectId}` mapping.
    let labsMapped = true
    for (const ss of yearSectionSubjects) {
      const subj = subjects.find(s => s.id === ss.subjectId)
      if (!subj || (subj.deliveryType !== 'LAB' && subj.deliveryType !== 'INTEGRATED')) continue
      const globalLabs = labsBySectionSubject.get(`GLOBAL::${ss.subjectId}`) ?? []
      const specificLabs = labsBySectionSubject.get(`${ss.sectionId}::${ss.subjectId}`) ?? []
      if (globalLabs.length === 0 && specificLabs.length === 0) {
        labsMapped = false
        shortageDetails.push(`${subj.name} (${subj.code}): No lab mapped for section ${ss.sectionId}`)
      }
    }

    const allocationValid = yearSubjects.length > 0 && unallocatedCount === 0 && labsMapped

    return computeSemesterReadiness({
      year,
      semester,
      isOdd,
      academicYear,
      subjectCount: yearSubjects.length,
      sectionCount: yearSections.length,
      totalFacultyCount: faculty.length,
      sectionSubjectCount: yearSectionSubjects.length,
      totalLabCount: labs.length,
      hasConfiguredSchedule,
      approvedPreferenceCount: yearPrefs.length,
      weightageValid,
      weightageMissingCount,
      allocationValid,
      unallocatedSubjectCount: unallocatedCount,
      shortageDetails,
      labsMapped,
    })
  })
}

/**
 * Legacy alias — kept for backward compatibility with the /api/readiness
 * endpoint that was wired up in the previous session.
 * @deprecated Use getSemesterReadinessStatus() which returns 8 entries.
 */
export async function getYearReadinessStatus(): Promise<import('../utils/readinessPolicy.js').SemesterReadiness[]> {
  return getSemesterReadinessStatus()
}

// --- Sessions -------------------------------------------------------------
// Persisted (Postgres table, or the local JSON file) rather than an
// in-memory Map, so logins survive a backend restart. Only the faculty id is
// stored; the authoritative role is always re-read from the faculty table.

export async function createSessionRecord(facultyId: string): Promise<SessionRecord> {
  const record: SessionRecord = {
    token: crypto.randomUUID(),
    facultyId,
    createdAt: new Date().toISOString(),
  }
  try {
    await pool.query(
      'INSERT INTO sessions (token, faculty_id, created_at) VALUES ($1, $2, $3)',
      [record.token, record.facultyId, record.createdAt]
    )
  } catch {
    mem.sessions.push(record)
    saveLocalDb()
  }
  return record
}

export async function getSessionFacultyId(token?: string | null): Promise<string | null> {
  if (!token) return null
  try {
    const { rows } = await pool.query('SELECT faculty_id FROM sessions WHERE token = $1', [token])
    return rows.length ? (rows[0].faculty_id as string) : null
  } catch {
    return mem.sessions.find(s => s.token === token)?.facultyId ?? null
  }
}

export async function destroySessionRecord(token?: string | null): Promise<void> {
  if (!token) return
  try {
    await pool.query('DELETE FROM sessions WHERE token = $1', [token])
  } catch {
    const before = mem.sessions.length
    mem.sessions = mem.sessions.filter(s => s.token !== token)
    if (mem.sessions.length !== before) saveLocalDb()
  }
}
