import { Router } from 'express'
import { generateInBackground as generateTimetable, GenerationBusyError } from '../solver/runner.js'
import {
  getAssignmentsForRun,
  getConflictsForRun,
  getLatestValidRun,
  getRun,
  getUnscheduledForRun,
  getSemesterReadinessStatus,
  listFaculty,
  listSectionSubjects,
  listSections,
  listSubjects,
  listTeachingAssignments,
  getScheduleConfig,
} from '../db/repo.js'
import { createPdf, renderClassTimetablesPdf } from '../export/classTimetablePdf.js'
import { createLandscapePdf, renderFacultyTimetablePdf, renderMasterTimetablePdf } from '../export/facultyMasterPdf.js'
import { requireAuth, requireRole } from '../auth/middleware.js'

export const timetableRouter = Router()

// Kicks off the full pipeline and persists the run.
// The backend is authoritative: readiness is re-checked here even if the
// frontend button was disabled. Forged POST /generate requests are rejected.
//
// An optional { year, semester } body scopes generation to exactly that
// semester (e.g. so Year 2 / Semester III can be generated on its own once
// it's genuinely ready, without every other semester in the department also
// needing to be configured). The client-supplied scope is only ever used to
// pick WHICH semester's readiness to check -- the readiness check itself,
// and the pipeline's own re-derivation of that semester's real data, remain
// fully server-side authoritative.
timetableRouter.post('/generate', async (req, res, next) => {
  try {
    const readiness = await getSemesterReadinessStatus()
    const { year, semester } = req.body ?? {}

    if (year !== undefined || semester !== undefined) {
      const target = readiness.find(r => r.year === year && r.semester === semester)
      if (!target) {
        return res.status(400).json({ error: 'INVALID_SCOPE', message: `${year ?? '?'} Semester ${semester ?? '?'} is not a recognized (year, semester) context.` })
      }
      if (!target.canGenerate) {
        return res.status(422).json({
          error: 'READINESS_BLOCKED',
          message: `${target.year} Semester ${target.semester} is not ready for generation.`,
          blockedSemesters: [{ year: target.year, semester: target.semester, missingItems: target.missingItems }],
        })
      }
      return res.json(await generateTimetable({ year: target.year, semester: target.semester }))
    }

    const eligible = readiness.filter(r => r.canGenerate)
    if (eligible.length === 0) {
      const blocked = readiness.map(r => ({
        year: r.year,
        semester: r.semester,
        missingItems: r.missingItems,
      }))
      return res.status(422).json({
        error: 'READINESS_BLOCKED',
        message: 'No semester is ready for generation. Check the readiness dashboard.',
        blockedSemesters: blocked,
      })
    }
    // Every ready semester in ONE run: teachers are shared across years, so they must be solved together.
    res.json(await generateTimetable(eligible.map(r => ({ year: r.year, semester: r.semester }))))
  } catch (err) {
    if (err instanceof GenerationBusyError) return res.status(409).json({ error: 'BUSY', message: err.message })
    next(err)
  }
})

// Regeneration is intentionally the same deterministic pipeline with a fresh run;
// it never changes the imported requirements.
timetableRouter.post('/regenerate', async (_req, res, next) => {
  try {
    const eligible = (await getSemesterReadinessStatus()).filter(r => r.canGenerate)
    if (eligible.length === 0) return res.status(422).json({ error: 'READINESS_BLOCKED', message: 'No semester is ready for generation.' })
    res.json(await generateTimetable(eligible.map(r => ({ year: r.year, semester: r.semester }))))
  } catch (err) {
    next(err)
  }
})

timetableRouter.get('/runs/:runId', async (req, res, next) => {
  try {
    const runId = Number(req.params.runId)
    const run = await getRun(runId)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    const [assignments, conflicts, unscheduled] = await Promise.all([
      getAssignmentsForRun(runId),
      getConflictsForRun(runId),
      getUnscheduledForRun(runId),
    ])
    res.json({
      id: run.id,
      status: run.status,
      generatedAt: run.generated_at,
      warnings: JSON.parse(run.warnings),
      assignments,
      conflicts,
      unscheduled,
    })
  } catch (err) {
    next(err)
  }
})

// The one authoritative master schedule (Section 14): the latest run that
// passed validation. Class/Faculty/Lab views below are projections of it.
timetableRouter.get('/master', async (_req, res, next) => {
  try {
    const latest = await getLatestValidRun()
    if (!latest) return res.status(404).json({ error: 'No validated timetable has been generated yet' })
    res.json({
      runId: latest.id,
      status: latest.status,
      generatedAt: latest.generatedAt,
      assignments: await getAssignmentsForRun(latest.id),
    })
  } catch (err) {
    next(err)
  }
})

timetableRouter.get('/section/:sectionId', async (req, res, next) => {
  try {
    const latest = await getLatestValidRun()
    if (!latest) return res.status(404).json({ error: 'No validated timetable has been generated yet' })
    const assignments = (await getAssignmentsForRun(latest.id)).filter(a => a.sectionId === req.params.sectionId)
    res.json({ runId: latest.id, sectionId: req.params.sectionId, assignments })
  } catch (err) {
    next(err)
  }
})

timetableRouter.get('/faculty/:facultyId', async (req, res, next) => {
  try {
    const latest = await getLatestValidRun()
    if (!latest) return res.status(404).json({ error: 'No validated timetable has been generated yet' })
    const assignments = (await getAssignmentsForRun(latest.id)).filter(a => a.facultyId === req.params.facultyId)
    res.json({ runId: latest.id, facultyId: req.params.facultyId, assignments })
  } catch (err) {
    next(err)
  }
})

timetableRouter.get('/lab/:labId', async (req, res, next) => {
  try {
    const latest = await getLatestValidRun()
    if (!latest) return res.status(404).json({ error: 'No validated timetable has been generated yet' })
    const assignments = (await getAssignmentsForRun(latest.id)).filter(a => a.labId === req.params.labId)
    res.json({ runId: latest.id, labId: req.params.labId, assignments })
  } catch (err) {
    next(err)
  }
})

timetableRouter.get('/conflicts/:runId', async (req, res, next) => {
  try {
    const runId = Number(req.params.runId)
    const [conflicts, unscheduled] = await Promise.all([getConflictsForRun(runId), getUnscheduledForRun(runId)])
    res.json({ runId, conflicts, unscheduled })
  } catch (err) {
    next(err)
  }
})

const SEMESTERS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

// GET /api/timetable/export?semester=VII   (or semester=all)
// The generated class timetables as PDF sheets in the department's printed format, one page per section.
// GET /api/timetable/export/faculty/:facultyId - one teacher's weekly timetable (a teacher may only download their own)
timetableRouter.get('/export/faculty/:facultyId', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.facultyId)
    if (req.auth!.role !== 'HOD' && req.auth!.facultyId !== id) return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only download your own timetable.' })
    const run = await getLatestValidRun()
    if (!run) return res.status(404).json({ error: 'NO_TIMETABLE', message: 'No timetable has been generated yet.' })
    const [sections, subjects, sectionSubjects, teachingAssignments, faculty, config, assignments] = await Promise.all([
      listSections(), listSubjects(), listSectionSubjects(), listTeachingAssignments(), listFaculty(), getScheduleConfig(), getAssignmentsForRun(run.id),
    ])
    const f = faculty.find(x => x.id === id)
    if (!f) return res.status(404).json({ error: 'NOT_FOUND', message: 'Teacher not found.' })
    const doc = createLandscapePdf(`Timetable ${f.name}`)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Timetable-${f.id}.pdf"`)
    doc.pipe(res)
    renderFacultyTimetablePdf({ facultyId: id, sections, subjects, sectionSubjects, teachingAssignments, faculty, assignments, config }, doc)
    doc.end()
  } catch (err) { next(err) }
})

// GET /api/timetable/export/master?semester=VII|all - HOD only: the department's master timetable
timetableRouter.get('/export/master', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const wanted = String(req.query.semester ?? 'all').toUpperCase()
    const run = await getLatestValidRun()
    if (!run) return res.status(404).json({ error: 'NO_TIMETABLE', message: 'No timetable has been generated yet.' })
    const [sections, subjects, sectionSubjects, teachingAssignments, faculty, config, assignments] = await Promise.all([
      listSections(), listSubjects(), listSectionSubjects(), listTeachingAssignments(), listFaculty(), getScheduleConfig(), getAssignmentsForRun(run.id),
    ])
    const inRun = new Set(assignments.map(a => a.sectionId))
    const available = SEMESTERS.filter(sem => sections.some(sec => sec.semester === sem && sec.active !== false && inRun.has(sec.id)))
    const picked = wanted === 'ALL' ? available : available.filter(x => x === wanted)
    if (picked.length === 0) return res.status(400).json({ error: 'INVALID_SEMESTER', message: `Choose a semester (${available.join(', ') || 'none generated yet'}) or "all".` })
    const doc = createLandscapePdf('Master Timetable')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Master-Timetable-${wanted === 'ALL' ? 'All-Semesters' : 'Sem-' + wanted}.pdf"`)
    doc.pipe(res)
    renderMasterTimetablePdf({ semesters: picked, runId: run.id, generatedAt: run.generatedAt, sections, subjects, sectionSubjects, teachingAssignments, faculty, assignments, config }, doc)
    doc.end()
  } catch (err) { next(err) }
})

timetableRouter.get('/export', async (req, res, next) => {
  try {
    const wanted = String(req.query.semester ?? '').toUpperCase()
    const run = await getLatestValidRun()
    if (!run) return res.status(404).json({ error: 'NO_TIMETABLE', message: 'No timetable has been generated yet.' })
    const [sections, subjects, sectionSubjects, teachingAssignments, faculty, config, assignments] = await Promise.all([
      listSections(), listSubjects(), listSectionSubjects(), listTeachingAssignments(), listFaculty(), getScheduleConfig(), getAssignmentsForRun(run.id),
    ])
    const inRun = new Set(assignments.map(a => a.sectionId))
    const available = SEMESTERS.filter(sem => sections.some(sec => sec.semester === sem && sec.active !== false && inRun.has(sec.id)))
    const picked = wanted === 'ALL' ? available : SEMESTERS.includes(wanted) ? [wanted] : []
    if (picked.length === 0) return res.status(400).json({ error: 'INVALID_SEMESTER', message: `Choose a semester (${available.join(', ') || 'none generated yet'}) or "all".` })
    if (picked.some(sem => !available.includes(sem))) return res.status(404).json({ error: 'NOT_IN_RUN', message: `Semester ${wanted} is not part of the latest timetable (${available.join(', ')} are). Generate again first.` })

    const doc = createPdf()
    const name = wanted === 'ALL' ? 'All-Semesters' : `Sem-${wanted}`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Class-Timetables-${name}.pdf"`)
    doc.pipe(res)
    picked.forEach((sem, i) => {
      if (i > 0) doc.addPage()
      renderClassTimetablesPdf({
        semester: sem,
        sections: sections.filter(sec => sec.semester === sem && sec.active !== false && inRun.has(sec.id)),
        subjects, sectionSubjects, teachingAssignments, faculty, assignments, config,
      }, doc)
    })
    doc.end()
  } catch (err) {
    next(err)
  }
})
