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
timetableRouter.post('/generate', (_req, res) => {
  const result = generateTimetable()
  res.json(result)
})

timetableRouter.get('/runs/:runId', (req, res) => {
  const runId = Number(req.params.runId)
  const run = getRun(runId)
  if (!run) return res.status(404).json({ error: 'Run not found' })
  res.json({
    id: run.id,
    status: run.status,
    generatedAt: run.generated_at,
    warnings: JSON.parse(run.warnings),
    assignments: getAssignmentsForRun(runId),
    conflicts: getConflictsForRun(runId),
    unscheduled: getUnscheduledForRun(runId),
  })
})

// The one authoritative master schedule (Section 14): the latest run that
// passed validation. Class/Faculty/Lab views below are projections of it.
timetableRouter.get('/master', (_req, res) => {
  const latest = getLatestValidRun()
  if (!latest) return res.status(404).json({ error: 'No validated timetable has been generated yet' })
  res.json({
    runId: latest.id,
    status: latest.status,
    generatedAt: latest.generatedAt,
    assignments: getAssignmentsForRun(latest.id),
  })
})

timetableRouter.get('/section/:sectionId', (req, res) => {
  const latest = getLatestValidRun()
  if (!latest) return res.status(404).json({ error: 'No validated timetable has been generated yet' })
  const assignments = getAssignmentsForRun(latest.id).filter(a => a.sectionId === req.params.sectionId)
  res.json({ runId: latest.id, sectionId: req.params.sectionId, assignments })
})

timetableRouter.get('/faculty/:facultyId', (req, res) => {
  const latest = getLatestValidRun()
  if (!latest) return res.status(404).json({ error: 'No validated timetable has been generated yet' })
  const assignments = getAssignmentsForRun(latest.id).filter(a => a.facultyId === req.params.facultyId)
  res.json({ runId: latest.id, facultyId: req.params.facultyId, assignments })
})

timetableRouter.get('/lab/:labId', (req, res) => {
  const latest = getLatestValidRun()
  if (!latest) return res.status(404).json({ error: 'No validated timetable has been generated yet' })
  const assignments = getAssignmentsForRun(latest.id).filter(a => a.labId === req.params.labId)
  res.json({ runId: latest.id, labId: req.params.labId, assignments })
})

timetableRouter.get('/conflicts/:runId', (req, res) => {
  const runId = Number(req.params.runId)
  res.json({
    runId,
    conflicts: getConflictsForRun(runId),
    unscheduled: getUnscheduledForRun(runId),
  })
})
