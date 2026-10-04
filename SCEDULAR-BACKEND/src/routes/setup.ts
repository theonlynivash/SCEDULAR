/**
 * Semester setup, all inside the app (no PDF/seed dependency):
 *   sections   - generate/remove the classes running this semester
 *   subjects   - the syllabus: add / edit / delete, with the sections that offer each one
 *   teachers   - add / remove, and issue logins
 *   dataset    - start from a blank dataset
 */
import { notifyPasswordChanged } from '../mail/notify.js'
import { Router } from 'express'
import { z } from 'zod'
import {
  listFaculty, getFaculty, upsertFaculty, deleteFacultyCascade,
  listSections, upsertSection, deleteSection,
  listSubjects, upsertSubject, deleteSubjectCascade, removeSectionSubjectOfferings,
  listSectionSubjects, upsertSectionSubject, listTeachingAssignments,
  upsertCourse, deleteCourse, getCurrentAcademicCycle, getFacultyPreferences, listLabs,
  listLabSubjectMappings, setLabSubjectMapping, deleteLabSubjectMapping,
} from '../db/repo.js'
import { deriveInitialCourses, saveLocalDb } from '../db/localDb.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { generatePassword, hasPersonalPassword, setFacultyPassword, verifyFacultyPassword } from '../auth/passwords.js'
import { SEMESTER_TO_YEAR, isSpecificSemester, semesterInCycle } from '../utils/academicCycle.js'
import type { Subject } from '../types.js'

export const setupRouter = Router()
setupRouter.use('/setup', requireAuth, requireRole('HOD'))

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const SEM_NUM: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 }
const CATEGORIES = ['CORE', 'BASIC_SCIENCE', 'ENGINEERING_SCIENCE', 'HUMANITIES', 'PROFESSIONAL_ELECTIVE', 'OPEN_ELECTIVE', 'MANDATORY', 'ADDITIONAL', 'LAB_ONLY', 'PROJECT'] as const

const fail = (res: any, status: number, error: string, message: string) => res.status(status).json({ error, message })

// ───────────────────────── overview ─────────────────────────
setupRouter.get('/setup/overview', async (_req, res, next) => {
  try {
    const cycle = await getCurrentAcademicCycle()
    const [faculty, sections, subjects, offerings, assignments, labs, prefs] = await Promise.all([
      listFaculty(), listSections(), listSubjects(), listSectionSubjects(), listTeachingAssignments(), listLabs(), getFacultyPreferences(),
    ])
    const logins = await Promise.all(faculty.map(async f => [f.id, await hasPersonalPassword(f.id)] as const))
    const withLogin = new Set(logins.filter(([, ok]) => ok).map(([id]) => id))
    const semesters = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'].filter(s => semesterInCycle(s, cycle)).map(sem => {
      const secs = sections.filter(s => s.semester === sem && s.active !== false)
      const secIds = new Set(secs.map(s => s.id))
      const subs = subjects.filter(s => s.semester === sem)
      const offered = offerings.filter(o => secIds.has(o.sectionId))
      const offeredIds = new Set(offered.map(o => o.id))
      const staffed = offered.filter(o => assignments.some(a => a.sectionSubjectId === o.id)).length
      return {
        semester: sem, year: SEMESTER_TO_YEAR[sem], sections: secs.length, subjects: subs.length,
        subjectsOffered: new Set(offered.map(o => o.subjectId)).size, offerings: offeredIds.size, staffed,
        choices: prefs.filter(p => p.semester === sem && p.status !== 'DRAFT').length,
        choicesPending: prefs.filter(p => p.semester === sem && p.status !== 'DRAFT' && p.status !== 'APPROVED').length,
      }
    })
    const teachers = faculty.filter(f => f.role !== 'HOD')
    res.json({
      cycle, semesters,
      teachers: { total: teachers.length, withLogin: teachers.filter(t => withLogin.has(t.id)).length },
      labs: labs.length,
    })
  } catch (err) { next(err) }
})

// ───────────────────────── sections ─────────────────────────
const sectionsBody = z.object({
  semester: z.string(),
  count: z.number().int().min(1).max(26),
})

function sectionId(semester: string, letter: string): string {
  const n = SEM_NUM[semester]
  const yearNo = Math.ceil(n / 2)
  return n % 2 === 1 ? `Y${yearNo}-${letter}` : `Y${yearNo}S${n}-${letter}`
}

// POST /setup/sections { semester, count } -> makes the class sections A.. (continuing after existing ones) and
// offers every subject of that semester to them.
setupRouter.post('/setup/sections', async (req, res, next) => {
  try {
    const p = sectionsBody.safeParse(req.body)
    if (!p.success || !isSpecificSemester(p.data.semester)) return fail(res, 400, 'INVALID_INPUT', 'Give a semester (I–VIII) and a section count (1–26).')
    const { semester, count } = p.data
    const year = SEMESTER_TO_YEAR[semester]
    const cycle = await getCurrentAcademicCycle()
    const existing = (await listSections()).filter(s => s.semester === semester)
    const letters = existing.map(s => s.id.slice(-1)).sort()
    const created: string[] = []
    let code = letters.length ? letters[letters.length - 1].charCodeAt(0) + 1 : 65
    for (let i = 0; i < count; i++, code++) {
      if (code > 90) return fail(res, 400, 'TOO_MANY_SECTIONS', 'No more section letters (A–Z) are free for this semester.')
      const letter = String.fromCharCode(code)
      const n = SEM_NUM[semester]
      const yearRoman = ROMAN[Math.ceil(n / 2)]
      await upsertSection({
        id: sectionId(semester, letter),
        name: `${yearRoman} Year AI&DS ${letter}${n % 2 === 0 ? ` (Sem ${semester})` : ''}`,
        year, semester, department: 'AI & DS', studentCount: null, active: semesterInCycle(semester, cycle),
      })
      created.push(sectionId(semester, letter))
    }
    saveLocalDb()
    res.status(201).json({ created })
  } catch (err) { next(err) }
})

// PATCH /setup/sections/:id { classIncharge } -> the teacher printed as "CLASS INCHARGE" on the section's timetable.
setupRouter.patch('/setup/sections/:id', async (req, res, next) => {
  try {
    const sec = (await listSections()).find(s => s.id === req.params.id)
    if (!sec) return fail(res, 404, 'NOT_FOUND', 'Section not found.')
    const fid = req.body?.classIncharge ?? null
    if (fid !== null && !(await getFaculty(String(fid)))) return fail(res, 400, 'UNKNOWN_TEACHER', 'That teacher does not exist.')
    await upsertSection({ ...sec, classIncharge: fid })
    saveLocalDb()
    res.json({ id: sec.id, classIncharge: fid })
  } catch (err) { next(err) }
})

setupRouter.delete('/setup/sections/:id', async (req, res, next) => {
  try {
    const sec = (await listSections()).find(s => s.id === req.params.id)
    if (!sec) return fail(res, 404, 'NOT_FOUND', 'Section not found.')
    await deleteSection(sec.id)
    saveLocalDb()
    res.json({ success: true })
  } catch (err) { next(err) }
})

// ───────────────────────── subjects (syllabus) ─────────────────────────
const subjectBody = z.object({
  code: z.string().trim().min(2).max(24),
  name: z.string().trim().min(2).max(120),
  semester: z.string(),
  deliveryType: z.enum(['THEORY', 'INTEGRATED', 'LAB']),
  theoryPeriods: z.number().int().min(0).max(12),
  labPeriods: z.number().int().min(0).max(12),
  credits: z.number().int().min(0).max(10).optional(),
  category: z.enum(CATEGORIES).optional(),
  /** Sections that run it. Omit to offer it to every active section of the semester. */
  sectionIds: z.array(z.string()).optional(),
  /** Lab rooms that can host the lab part (for lab / integrated subjects). */
  labIds: z.array(z.string()).optional(),
  /** Printing details for the class timetable sheets. */
  shortName: z.string().trim().max(24).nullable().optional(),
  ltp: z.tuple([z.number().int().min(0).max(9), z.number().int().min(0).max(9), z.number().int().min(0).max(9)]).nullable().optional(),
  printAs: z.enum(['THEORY', 'PRACTICAL']).nullable().optional(),
})

function checkPeriods(b: z.infer<typeof subjectBody>): string | null {
  if (!isSpecificSemester(b.semester)) return 'Semester must be I–VIII.'
  if (b.deliveryType === 'THEORY' && (b.theoryPeriods < 1 || b.labPeriods !== 0)) return 'A theory subject needs theory periods and no lab periods.'
  if (b.deliveryType === 'LAB' && (b.labPeriods < 1 || b.theoryPeriods !== 0)) return 'A lab subject needs lab periods and no theory periods.'
  if (b.deliveryType === 'INTEGRATED' && (b.theoryPeriods < 1 || b.labPeriods < 1)) return 'An integrated subject needs both theory and lab periods.'
  if (b.labPeriods > 4 && b.labPeriods % 3 !== 0) return 'Lab periods per week must be 1–4 or a multiple of 3 (labs run as continuous blocks).'
  return null
}
const blockLength = (lab: number) => (lab === 0 ? null : lab <= 4 ? lab : 3)

async function writeSubjectCourses(sub: Subject) {
  for (const c of deriveInitialCourses([sub])) await upsertCourse(c)
}

async function syncLabRooms(sub: Subject, labIds: string[] | undefined) {
  if (labIds === undefined) return
  const wanted = (sub.labPeriods ?? 0) > 0 ? labIds : []
  const current = (await listLabSubjectMappings()).filter(m => m.subjectId === sub.id && !m.sectionId)
  for (const id of wanted) if (!current.some(m => m.labId === id)) await setLabSubjectMapping(id, sub.id, null)
  for (const m of current) if (!wanted.includes(m.labId)) await deleteLabSubjectMapping(m.labId, sub.id, null)
}

async function syncOfferings(sub: Subject, wanted: string[]) {
  const offerings = await listSectionSubjects()
  const have = new Set(offerings.filter(o => o.subjectId === sub.id).map(o => o.sectionId))
  for (const sid of wanted) {
    await upsertSectionSubject({ sectionId: sid, subjectId: sub.id, theoryPeriods: sub.theoryPeriods ?? 0, labPeriods: sub.labPeriods ?? 0, labBlockLength: blockLength(sub.labPeriods ?? 0) })
  }
  const drop = [...have].filter(sid => !wanted.includes(sid))
  if (drop.length) await removeSectionSubjectOfferings(sub.id, drop)
}

setupRouter.get('/setup/subjects', async (_req, res, next) => {
  try {
    const [subjects, offerings, assignments, sections, labMaps] = await Promise.all([listSubjects(), listSectionSubjects(), listTeachingAssignments(), listSections(), listLabSubjectMappings()])
    const secById = new Map(sections.map(s => [s.id, s]))
    res.json(subjects.map(s => {
      const offs = offerings.filter(o => o.subjectId === s.id)
      return {
        id: s.id, code: s.code, name: s.name, year: s.year, semester: s.semester, deliveryType: s.deliveryType, category: s.category,
        credits: s.credits ?? 0, theoryPeriods: s.theoryPeriods, labPeriods: s.labPeriods,
        sectionIds: offs.map(o => o.sectionId),
        sectionNames: offs.map(o => secById.get(o.sectionId)?.name ?? o.sectionId),
        shortName: s.shortName ?? null, ltp: s.ltp ?? null, printAs: s.printAs ?? null,
        labIds: labMaps.filter(m => m.subjectId === s.id && !m.sectionId).map(m => m.labId),
        staffed: offs.filter(o => assignments.some(a => a.sectionSubjectId === o.id)).length,
      }
    }))
  } catch (err) { next(err) }
})

setupRouter.post('/setup/subjects', async (req, res, next) => {
  try {
    const p = subjectBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Invalid subject.')
    const b = p.data
    const problem = checkPeriods(b)
    if (problem) return fail(res, 400, 'INVALID_PERIODS', problem)
    const all = await listSubjects()
    if (all.some(s => s.code.toLowerCase() === b.code.toLowerCase())) return fail(res, 409, 'DUPLICATE_CODE', `A subject with code ${b.code} already exists.`)
    const sub: Subject = {
      id: `SUB-${b.code}`, code: b.code, name: b.name, credits: b.credits ?? 0, deliveryType: b.deliveryType,
      category: b.category ?? (b.deliveryType === 'LAB' ? 'LAB_ONLY' : 'CORE'),
      year: SEMESTER_TO_YEAR[b.semester], semester: b.semester, theoryPeriods: b.theoryPeriods, labPeriods: b.labPeriods, vertical: null,
      shortName: b.shortName || null, ltp: b.ltp ?? null, printAs: b.printAs ?? null,
    }
    await upsertSubject(sub)
    await writeSubjectCourses(sub)
    const sections = (await listSections()).filter(s => s.semester === b.semester && s.active !== false)
    await syncOfferings(sub, b.sectionIds ?? sections.map(s => s.id))
    await syncLabRooms(sub, b.labIds)
    saveLocalDb()
    res.status(201).json({ id: sub.id })
  } catch (err) { next(err) }
})

setupRouter.put('/setup/subjects/:id', async (req, res, next) => {
  try {
    const p = subjectBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Invalid subject.')
    const b = p.data
    const problem = checkPeriods(b)
    if (problem) return fail(res, 400, 'INVALID_PERIODS', problem)
    const all = await listSubjects()
    const cur = all.find(s => s.id === req.params.id)
    if (!cur) return fail(res, 404, 'NOT_FOUND', 'Subject not found.')
    if (all.some(s => s.id !== cur.id && s.code.toLowerCase() === b.code.toLowerCase())) return fail(res, 409, 'DUPLICATE_CODE', `Another subject already uses code ${b.code}.`)
    if (cur.semester !== b.semester) return fail(res, 400, 'SEMESTER_LOCKED', 'A subject cannot move to another semester; delete it and add it again.')
    const sub: Subject = {
      ...cur, code: b.code, name: b.name, credits: b.credits ?? cur.credits ?? 0, deliveryType: b.deliveryType,
      category: b.category ?? cur.category, theoryPeriods: b.theoryPeriods, labPeriods: b.labPeriods,
      shortName: b.shortName === undefined ? cur.shortName : (b.shortName || null),
      ltp: b.ltp === undefined ? cur.ltp : b.ltp,
      printAs: b.printAs === undefined ? cur.printAs : b.printAs,
    }
    await upsertSubject(sub)
    for (const c of await deriveInitialCourses([cur])) await deleteCourse(c.id)
    await writeSubjectCourses(sub)
    const sections = (await listSections()).filter(s => s.semester === b.semester && s.active !== false)
    await syncOfferings(sub, b.sectionIds ?? sections.map(s => s.id))
    await syncLabRooms(sub, b.labIds)
    saveLocalDb()
    res.json({ id: sub.id })
  } catch (err) { next(err) }
})

setupRouter.delete('/setup/subjects/:id', async (req, res, next) => {
  try {
    const sub = (await listSubjects()).find(s => s.id === req.params.id)
    if (!sub) return fail(res, 404, 'NOT_FOUND', 'Subject not found.')
    await deleteSubjectCascade(sub.id)
    res.json({ success: true })
  } catch (err) { next(err) }
})

// ───────────────────────── teachers & logins ─────────────────────────
const facultyBody = z.object({
  name: z.string().trim().min(2).max(80),
  designation: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  allocationExperience: z.number().int().min(0).max(60).optional(),
  maxWeeklyPeriods: z.number().int().min(1).max(40).optional(),
  maxDailyPeriods: z.number().int().min(1).max(10).optional(),
})

function nextFacultyId(ids: string[]): string {
  const max = ids.map(i => /^FAC-(\d+)$/.exec(i)).filter(Boolean).reduce((m, r) => Math.max(m, Number(r![1])), 0)
  return `FAC-${String(max + 1).padStart(3, '0')}`
}

// POST /setup/faculty -> new teacher with a generated ID and a one-time password (shown once).
setupRouter.post('/setup/faculty', async (req, res, next) => {
  try {
    const p = facultyBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Invalid teacher.')
    const all = await listFaculty()
    if (p.data.email && all.some(f => f.email && f.email.toLowerCase() === p.data.email!.toLowerCase())) return fail(res, 409, 'DUPLICATE_EMAIL', 'That email is already used by another teacher.')
    const id = nextFacultyId(all.map(f => f.id))
    await upsertFaculty({
      id, name: p.data.name, designation: p.data.designation ?? 'Assistant Professor', department: 'AI & DS', email: p.data.email ?? null,
      role: 'FACULTY', allocationExperience: p.data.allocationExperience, previousExperience: p.data.allocationExperience, currentExperience: 0,
      maxDailyPeriods: p.data.maxDailyPeriods ?? 6, maxWeeklyPeriods: p.data.maxWeeklyPeriods ?? 24,
    } as any)
    const password = generatePassword()
    await setFacultyPassword(id, password)
    await notifyPasswordChanged(id, 'created')
    saveLocalDb()
    res.status(201).json({ facultyId: id, name: p.data.name, password })
  } catch (err) { next(err) }
})

// PATCH /setup/faculty/:id -> partial update (only the fields sent change).
const facultyPatch = facultyBody.partial()
setupRouter.patch('/setup/faculty/:id', async (req, res, next) => {
  try {
    const p = facultyPatch.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Invalid values.')
    const f = await getFaculty(req.params.id)
    if (!f) return fail(res, 404, 'NOT_FOUND', 'Teacher not found.')
    const d = p.data
    if (d.email && (await listFaculty()).some(x => x.id !== f.id && x.email && x.email.toLowerCase() === d.email!.toLowerCase())) return fail(res, 409, 'DUPLICATE_EMAIL', 'That email is already used by another teacher.')
    await upsertFaculty({
      ...f,
      ...(d.name !== undefined && { name: d.name }),
      ...(d.designation !== undefined && { designation: d.designation }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.allocationExperience !== undefined && { allocationExperience: d.allocationExperience }),
      ...(d.maxWeeklyPeriods !== undefined && { maxWeeklyPeriods: d.maxWeeklyPeriods }),
      ...(d.maxDailyPeriods !== undefined && { maxDailyPeriods: d.maxDailyPeriods }),
    } as any)
    saveLocalDb()
    res.json(await getFaculty(f.id))
  } catch (err) { next(err) }
})

// POST /setup/faculty/:id/credentials { password? } -> (re)issue a login. Without a password one is generated.
setupRouter.post('/setup/faculty/:id/credentials', async (req, res, next) => {
  try {
    const f = await getFaculty(req.params.id)
    if (!f) return fail(res, 404, 'NOT_FOUND', 'Teacher not found.')
    const given = typeof req.body?.password === 'string' ? req.body.password.trim() : ''
    if (given && given.length < 6) return fail(res, 400, 'WEAK_PASSWORD', 'Password must be at least 6 characters.')
    const password = given || generatePassword()
    await setFacultyPassword(f.id, password)
    await notifyPasswordChanged(f.id, 'issued')
    res.json({ facultyId: f.id, name: f.name, password })
  } catch (err) { next(err) }
})

// POST /setup/faculty-credentials/missing -> generate a login for every teacher who has none (for printing / CSV).
setupRouter.post('/setup/faculty-credentials/missing', async (_req, res, next) => {
  try {
    const out: { facultyId: string; name: string; password: string }[] = []
    for (const f of await listFaculty()) {
      if (f.role === 'HOD' || await hasPersonalPassword(f.id)) continue
      const password = generatePassword()
      await setFacultyPassword(f.id, password)
      out.push({ facultyId: f.id, name: f.name, password })
    }
    res.json({ issued: out })
  } catch (err) { next(err) }
})

setupRouter.get('/setup/faculty-logins', async (_req, res, next) => {
  try {
    const faculty = await listFaculty()
    res.json(Object.fromEntries(await Promise.all(faculty.map(async f => [f.id, await hasPersonalPassword(f.id)] as const))))
  } catch (err) { next(err) }
})

setupRouter.delete('/setup/faculty/:id', async (req, res, next) => {
  try {
    const f = await getFaculty(req.params.id)
    if (!f) return fail(res, 404, 'NOT_FOUND', 'Teacher not found.')
    if (f.role === 'HOD') return fail(res, 400, 'HOD_PROTECTED', 'The HOD account cannot be deleted.')
    if (f.id === req.auth!.facultyId) return fail(res, 400, 'SELF_DELETE', 'You cannot delete your own account.')
    await deleteFacultyCascade(f.id)
    res.json({ success: true })
  } catch (err) { next(err) }
})

