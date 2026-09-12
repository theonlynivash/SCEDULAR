import { Router } from 'express'
import { z } from 'zod'
import {
  listCourseRequirements,
  listTeacherAssignments,
  upsertCourseRequirement,
  upsertTeacherAssignment,
} from '../db/repo.js'

// Raw structured input: which teacher takes which course for which section,
// and the exact weekly demand for that pairing (Section 3 / 4 of the
// report). This is data entry for already-decided assignments -- there is
// deliberately no allocation/optimization workflow here.
export const workloadRouter = Router()

const requirementSchema = z.object({
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
  weeklyTheoryPeriods: z.number().int().nonnegative().default(0),
  weeklyLabPeriods: z.number().int().nonnegative().default(0),
})

const teacherAssignmentSchema = z.object({
  facultyId: z.string().min(1),
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
})

workloadRouter.get('/requirements', (_req, res) => res.json(listCourseRequirements()))

workloadRouter.post('/requirements', (req, res) => {
  const parsed = requirementSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  upsertCourseRequirement(parsed.data)
  res.status(201).json(parsed.data)
})

workloadRouter.post('/requirements/bulk', (req, res) => {
  const parsed = z.array(requirementSchema).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  for (const r of parsed.data) upsertCourseRequirement(r)
  res.status(201).json({ count: parsed.data.length })
})

workloadRouter.get('/teacher-assignments', (_req, res) => res.json(listTeacherAssignments()))

workloadRouter.post('/teacher-assignments', (req, res) => {
  const parsed = teacherAssignmentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  upsertTeacherAssignment(parsed.data)
  res.status(201).json(parsed.data)
})

workloadRouter.post('/teacher-assignments/bulk', (req, res) => {
  const parsed = z.array(teacherAssignmentSchema).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  for (const a of parsed.data) upsertTeacherAssignment(a)
  res.status(201).json({ count: parsed.data.length })
})
