import { Router } from 'express'
import { generateTimetable } from '../solver/pipeline.js'
import {
  getAssignmentsForRun,
  getConflictsForRun,
  getLatestValidRun,
  getRun,
  getUnscheduledForRun,
  getSemesterReadinessStatus,
} from '../db/repo.js'

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
    res.json(await generateTimetable())
  } catch (err) {
    next(err)
  }
})

// Regeneration is intentionally the same deterministic pipeline with a fresh run;
// it never changes the imported requirements.
timetableRouter.post('/regenerate', async (_req, res, next) => {
  try {
    res.json(await generateTimetable())
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
