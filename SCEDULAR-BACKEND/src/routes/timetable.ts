import { Router } from 'express'
import { generateTimetable } from '../solver/pipeline.js'
import {
  getAssignmentsForRun,
  getConflictsForRun,
  getLatestValidRun,
  getRun,
  getUnscheduledForRun,
} from '../db/repo.js'

export const timetableRouter = Router()

// Kicks off the full pipeline (Section 11 / 19) and persists the run.
// Always returns a definite status -- GREEN or RED -- never a fake success.
timetableRouter.post('/generate', async (_req, res, next) => {
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
