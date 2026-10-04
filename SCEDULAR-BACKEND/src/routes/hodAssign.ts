/**
 * HOD subject -> teacher -> sections assignment.
 *
 * Model: a subject offered to N sections. The HOD gives a teacher n of those
 * sections. The workload "template" is derived, never typed: for each section
 * the teacher takes, they get that section's theory AND lab periods together
 * (n x T theory + n x L lab; theory-only subjects are just n x T). Assigning
 * writes canonical TeachingAssignment rows directly.
 */
import { Router } from 'express'
import { z } from 'zod'
import {
  listFaculty,
  listSubjects,
  listSections,
  listSectionSubjects,
  listTeachingAssignments,
  addTeachingAssignment,
  removeTeachingAssignment,
  getFacultyPreferences,
  getCurrentAcademicCycle,
  hodChangePreferenceSubject,
  hodDeletePreference,
  getAllocationSettings,
} from '../db/repo.js'
import { computeStaffing, staffingPolicy, subjectQuota } from '../utils/staffing.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { semestersForCycle } from '../utils/academicCycle.js'

export const hodAssignRouter = Router()

function sectionOrder(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

async function loadState() {
  const [faculty, subjects, sections, sectionSubjects, assignments] = await Promise.all([
    listFaculty(), listSubjects(), listSections(), listSectionSubjects(), listTeachingAssignments(),
  ])
  const ssById = new Map(sectionSubjects.map(s => [s.id, s]))
  const load = new Map<string, number>()
  for (const ta of assignments) {
    const ss = ssById.get(ta.sectionSubjectId)
    if (!ss) continue
    const p = ta.component === 'LAB' ? ss.labPeriods : ss.theoryPeriods
    load.set(ta.facultyId, (load.get(ta.facultyId) ?? 0) + p)
  }
  return { faculty, subjects, sections, sectionSubjects, assignments, ssById, load }
}

// GET /api/hod/assign-board?semester=VII
hodAssignRouter.get('/hod/assign-board', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const cycle = await getCurrentAcademicCycle()
    const semester = String(req.query.semester ?? '')
    const allowed = semestersForCycle(cycle) as string[]
    if (!semester || !allowed.includes(semester)) {
      return res.status(400).json({ error: 'INVALID_SEMESTER', message: `semester must be one of ${allowed.join(', ')} for the ${cycle} cycle.` })
    }

    const { faculty, subjects, sections, sectionSubjects, assignments, load } = await loadState()
    const pol = staffingPolicy(await getAllocationSettings())
    const facName = new Map(faculty.map(f => [f.id, f.name]))
    const secName = new Map(sections.map(s => [s.id, s.name]))
    const activeSec = new Set(sections.filter(s => s.active !== false && s.semester === semester).map(s => s.id))
    const prefs = (await getFacultyPreferences()).filter(
      p => p.semester === semester && (p.status === 'SUBMITTED' || p.status === 'APPROVED')
    )

    const rows = subjects.filter(s => s.semester === semester).map(sub => {
      const offered = sectionSubjects
        .filter(ss => ss.subjectId === sub.id && activeSec.has(ss.sectionId))
        .sort((a, b) => sectionOrder(a.sectionId, b.sectionId))
      const secs = offered.map(ss => {
        const mine = assignments.filter(a => a.sectionSubjectId === ss.id)
        const theory = mine.find(a => a.component === 'THEORY')
        const lab = mine.find(a => a.component === 'LAB')
        const facultyId = theory?.facultyId ?? lab?.facultyId ?? null
        return {
          sectionId: ss.sectionId,
          sectionName: secName.get(ss.sectionId) ?? ss.sectionId,
          theoryPeriods: ss.theoryPeriods,
          labPeriods: ss.labPeriods,
          facultyId,
          facultyName: facultyId ? facName.get(facultyId) ?? facultyId : null,
          // a section is "complete" only when every component it needs has a teacher
          complete: (ss.theoryPeriods === 0 || !!theory) && (ss.labPeriods === 0 || !!lab),
        }
      })
      const perSection = offered[0] ? { theory: offered[0].theoryPeriods, lab: offered[0].labPeriods } : { theory: 0, lab: 0 }
      const byFaculty = new Map<string, string[]>()
      for (const s of secs) if (s.facultyId) byFaculty.set(s.facultyId, [...(byFaculty.get(s.facultyId) ?? []), s.sectionId])
      const interested = prefs
        .filter(p => p.subjectId === sub.id)
        .sort((a, b) => a.preferenceRank - b.preferenceRank)
        .map(p => ({ facultyId: p.facultyId, facultyName: facName.get(p.facultyId) ?? p.facultyId, rank: p.preferenceRank, approved: p.status === 'APPROVED' }))
      return {
        subjectId: sub.id,
        code: sub.code,
        name: sub.name,
        year: sub.year,
        deliveryType: sub.deliveryType,
        perSection,
        teachersWanted: subjectQuota(secs.length, pol.avgSectionsPerTeacher),
        sectionCount: secs.length,
        assignedCount: secs.filter(s => s.complete).length,
        sections: secs,
        interested,
        teachers: [...byFaculty.entries()].map(([facultyId, sectionIds]) => ({
          facultyId,
          facultyName: facName.get(facultyId) ?? facultyId,
          sectionIds,
          theory: sectionIds.length * perSection.theory,
          lab: sectionIds.length * perSection.lab,
        })),
      }
    }).filter(r => r.sectionCount > 0)

    const teachers = faculty
      .filter(f => f.role !== 'HOD' || true)
      .map(f => ({
        facultyId: f.id,
        name: f.name,
        experience: f.allocationExperience ?? null,
        load: load.get(f.id) ?? 0,
        max: pol.maxWeeklyPeriods,
      }))

    res.json({ semester, cycle, subjects: rows, teachers, avgSectionsPerTeacher: pol.avgSectionsPerTeacher, maxWeeklyPeriods: pol.maxWeeklyPeriods })
  } catch (err) { next(err) }
})

const assignSchema = z.object({
  subjectId: z.string().min(1),
  facultyId: z.string().min(1),
  semester: z.string().min(1),
  sectionCount: z.number().int().positive().optional(),
  sectionIds: z.array(z.string()).optional(),
  override: z.boolean().optional(),
}).refine(v => v.sectionCount || (v.sectionIds && v.sectionIds.length), { message: 'Give sectionCount or sectionIds.' })

// POST /api/hod/assign  { subjectId, facultyId, semester, sectionCount | sectionIds, override? }
hodAssignRouter.post('/hod/assign', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const p = assignSchema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: 'INVALID_INPUT', message: p.error.issues[0]?.message ?? 'Invalid input' })
    const { subjectId, facultyId, semester, sectionCount, sectionIds, override } = p.data

    const { faculty, subjects, sections, sectionSubjects, assignments, load } = await loadState()
    const fac = faculty.find(f => f.id === facultyId)
    if (!fac) return res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: `Faculty ${facultyId} not found.` })
    const sub = subjects.find(s => s.id === subjectId)
    if (!sub) return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: `Subject ${subjectId} not found.` })
    if (sub.semester !== semester) return res.status(400).json({ error: 'SEMESTER_MISMATCH', message: `${sub.code} belongs to semester ${sub.semester}.` })

    const activeSec = new Set(sections.filter(s => s.active !== false && s.semester === semester).map(s => s.id))
    const offered = sectionSubjects
      .filter(ss => ss.subjectId === subjectId && activeSec.has(ss.sectionId))
      .sort((a, b) => sectionOrder(a.sectionId, b.sectionId))
    const isFree = (ssId: number) => !assignments.some(a => a.sectionSubjectId === ssId)

    let chosen
    if (sectionIds && sectionIds.length) {
      chosen = []
      for (const id of sectionIds) {
        const ss = offered.find(o => o.sectionId === id)
        if (!ss) return res.status(400).json({ error: 'SECTION_NOT_OFFERED', message: `Section ${id} does not offer ${sub.code}.` })
        if (!isFree(ss.id)) return res.status(400).json({ error: 'SECTION_TAKEN', message: `Section ${id} of ${sub.code} already has a teacher. Unassign it first.` })
        chosen.push(ss)
      }
    } else {
      const free = offered.filter(o => isFree(o.id))
      if (sectionCount! > free.length) {
        return res.status(400).json({ error: 'NOT_ENOUGH_SECTIONS', message: `Only ${free.length} section(s) of ${sub.code} are still unassigned; you asked for ${sectionCount}.` })
      }
      chosen = free.slice(0, sectionCount)
    }

    const added = chosen.reduce((n, ss) => n + ss.theoryPeriods + ss.labPeriods, 0)
    const current = load.get(facultyId) ?? 0
    const max = staffingPolicy(await getAllocationSettings()).maxWeeklyPeriods
    if (!override && current + added > max) {
      return res.status(409).json({
        error: 'FACULTY_CAPACITY_EXCEEDED',
        message: `${fac.name} would reach ${current + added}/${max} periods per week (currently ${current}, adding ${added}).`,
        current, added, max,
      })
    }

    // Theory and lab always go to the same teacher.
    for (const ss of chosen) {
      if (ss.theoryPeriods > 0) await addTeachingAssignment({ facultyId, sectionSubjectId: ss.id, component: 'THEORY', batch: null })
      if (ss.labPeriods > 0) await addTeachingAssignment({ facultyId, sectionSubjectId: ss.id, component: 'LAB', batch: null })
    }
    res.status(201).json({ success: true, assignedSectionIds: chosen.map(c => c.sectionId), addedPeriods: added, facultyLoad: current + added, facultyMax: max })
  } catch (err) { next(err) }
})

const unassignSchema = z.object({
  subjectId: z.string().min(1),
  facultyId: z.string().min(1),
  sectionIds: z.array(z.string()).optional(),
})

// POST /api/hod/unassign  { subjectId, facultyId, sectionIds? } - omit sectionIds to drop all of that teacher's sections
hodAssignRouter.post('/hod/unassign', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const p = unassignSchema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: 'INVALID_INPUT', message: p.error.issues[0]?.message ?? 'Invalid input' })
    const { subjectId, facultyId, sectionIds } = p.data
    const [sectionSubjects, assignments] = await Promise.all([listSectionSubjects(), listTeachingAssignments()])
    const ssIds = new Set(
      sectionSubjects
        .filter(ss => ss.subjectId === subjectId && (!sectionIds || sectionIds.includes(ss.sectionId)))
        .map(ss => ss.id)
    )
    const doomed = assignments.filter(a => a.facultyId === facultyId && ssIds.has(a.sectionSubjectId))
    for (const a of doomed) await removeTeachingAssignment(a.id)
    res.json({ success: true, removed: doomed.length })
  } catch (err) { next(err) }
})

/** Live staffing picture for the current cycle: demand vs what the teachers can still carry. */
async function staffingReport() {
  const cycle = await getCurrentAcademicCycle()
  const [faculty, subjects, sections, sectionSubjects, teachingAssignments, prefs, cfg] = await Promise.all([
    listFaculty(), listSubjects(), listSections(), listSectionSubjects(), listTeachingAssignments(), getFacultyPreferences(), getAllocationSettings(),
  ])
  return { cycle, ...computeStaffing({ semesters: semestersForCycle(cycle) as string[], faculty, sections, subjects, sectionSubjects, teachingAssignments, preferences: prefs, policy: staffingPolicy(cfg) }) }
}

// GET /api/hod/staffing - total demand (sections x subjects x periods), the weekly cap, and "need N more teachers"
hodAssignRouter.get('/hod/staffing', requireAuth, requireRole('HOD'), async (_req, res, next) => {
  try { res.json(await staffingReport()) } catch (err) { next(err) }
})

// POST /api/hod/auto-assign { semester, subjectId?, dryRun? }
// "Apply template": for every subject with open sections, hand sections one at a time to the
// teachers who chose it (approved first, then by rank), always to the least-loaded one that still
// has room under their weekly limit. dryRun returns the plan without writing anything.
const autoSchema = z.object({ semester: z.string().min(1), subjectId: z.string().optional(), dryRun: z.boolean().optional() })

hodAssignRouter.post('/hod/auto-assign', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const p = autoSchema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: 'INVALID_INPUT', message: p.error.issues[0]?.message ?? 'Invalid input' })
    const { semester, subjectId, dryRun } = p.data

    const { faculty, subjects, sections, sectionSubjects, assignments, load } = await loadState()
    const facById = new Map(faculty.map(f => [f.id, f]))
    const cap = staffingPolicy(await getAllocationSettings()).maxWeeklyPeriods
    const activeSec = new Set(sections.filter(s => s.active !== false && s.semester === semester).map(s => s.id))
    const prefs = (await getFacultyPreferences()).filter(
      x => x.semester === semester && (x.status === 'SUBMITTED' || x.status === 'APPROVED')
    )
    const virtualLoad = new Map(load)

    const targets = subjects
      .filter(s => s.semester === semester && (!subjectId || s.id === subjectId))
      .map(sub => {
        const offered = sectionSubjects
          .filter(ss => ss.subjectId === sub.id && activeSec.has(ss.sectionId))
          .sort((a, b) => sectionOrder(a.sectionId, b.sectionId))
        const open = offered.filter(ss => !assignments.some(a => a.sectionSubjectId === ss.id))
        const interested = prefs
          .filter(x => x.subjectId === sub.id)
          .sort((a, b) => (a.status === 'APPROVED' ? 0 : 1) - (b.status === 'APPROVED' ? 0 : 1) || a.preferenceRank - b.preferenceRank)
        return { sub, open, interested }
      })
      .filter(t => t.open.length > 0)
      .sort((a, b) => a.interested.length - b.interested.length)   // scarcest subjects first

    const plan: { subjectId: string; code: string; name: string; facultyId: string; facultyName: string; sectionIds: string[]; periods: number; loadAfter: number; max: number }[] = []
    const leftover: { subjectId: string; code: string; name: string; remaining: number; reason: string }[] = []
    const todo: { facultyId: string; ssList: typeof sectionSubjects }[] = []

    for (const t of targets) {
      const grabbed = new Map<string, typeof sectionSubjects>()
      const queue = [...t.open]
      let blocked = false
      while (queue.length && !blocked) {
        const candidates = t.interested
          .map(i => i.facultyId)
          .filter((f, i, a) => a.indexOf(f) === i && facById.has(f))
          .filter(f => (virtualLoad.get(f) ?? 0) + queue[0].theoryPeriods + queue[0].labPeriods <= cap)
          .sort((a, b) => (virtualLoad.get(a) ?? 0) - (virtualLoad.get(b) ?? 0))
        if (!candidates.length) { blocked = true; break }
        const pick = candidates[0]
        const ss = queue.shift()!
        virtualLoad.set(pick, (virtualLoad.get(pick) ?? 0) + ss.theoryPeriods + ss.labPeriods)
        grabbed.set(pick, [...(grabbed.get(pick) ?? []), ss])
      }
      for (const [fid, list] of grabbed) {
        plan.push({
          subjectId: t.sub.id, code: t.sub.code, name: t.sub.name, facultyId: fid, facultyName: facById.get(fid)!.name,
          sectionIds: list.map(x => x.sectionId), periods: list.reduce((n, x) => n + x.theoryPeriods + x.labPeriods, 0),
          loadAfter: virtualLoad.get(fid) ?? 0, max: cap,
        })
        todo.push({ facultyId: fid, ssList: list })
      }
      if (queue.length) {
        leftover.push({
          subjectId: t.sub.id, code: t.sub.code, name: t.sub.name, remaining: queue.length,
          reason: t.interested.length === 0 ? 'Nobody chose this subject' : 'The teachers who chose it have no capacity left',
        })
      }
    }

    if (!dryRun) {
      for (const job of todo) for (const ss of job.ssList) {
        if (ss.theoryPeriods > 0) await addTeachingAssignment({ facultyId: job.facultyId, sectionSubjectId: ss.id, component: 'THEORY', batch: null })
        if (ss.labPeriods > 0) await addTeachingAssignment({ facultyId: job.facultyId, sectionSubjectId: ss.id, component: 'LAB', batch: null })
      }
    }
    res.json({ dryRun: !!dryRun, plan, leftover, assignedSections: plan.reduce((n, x) => n + x.sectionIds.length, 0), staffing: await staffingReport() })
  } catch (err) { next(err) }
})

// POST /api/hod/preferences/:id/change { subjectId } - the HOD swaps the subject of a preference (any status).
hodAssignRouter.post('/hod/preferences/:id/change', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const subjectId = String(req.body?.subjectId ?? '')
    if (!Number.isInteger(id) || !subjectId) return res.status(400).json({ error: 'INVALID_INPUT', message: 'preference id and subjectId are required.' })
    const [subjects, prefs, cycle] = await Promise.all([listSubjects(), getFacultyPreferences(), getCurrentAcademicCycle()])
    const pref = prefs.find(p => p.id === id)
    if (!pref) return res.status(404).json({ error: 'NOT_FOUND', message: 'Preference not found.' })
    const sub = subjects.find(s => s.id === subjectId)
    if (!sub || !sub.semester || !sub.year) return res.status(400).json({ error: 'INVALID_SUBJECT', message: 'Unknown subject.' })
    if (!(semestersForCycle(cycle) as string[]).includes(sub.semester)) {
      return res.status(400).json({ error: 'CYCLE_MISMATCH', message: `${sub.code} (Semester ${sub.semester}) is outside the current ${cycle} cycle.` })
    }
    if (prefs.some(p => p.facultyId === pref.facultyId && p.subjectId === subjectId && p.id !== id)) {
      return res.status(409).json({ error: 'DUPLICATE_SUBJECT', message: 'This teacher already has that subject.' })
    }
    const updated = await hodChangePreferenceSubject(id, sub.id, sub.year, sub.semester)
    res.json({ success: true, preference: updated })
  } catch (err) { next(err) }
})

// DELETE /api/hod/preferences/:id - the HOD removes a preference (any status). Existing section assignments are untouched.
hodAssignRouter.delete('/hod/preferences/:id', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid preference id.' })
    const ok = await hodDeletePreference(id)
    if (!ok) return res.status(404).json({ error: 'NOT_FOUND', message: 'Preference not found.' })
    res.json({ success: true })
  } catch (err) { next(err) }
})
