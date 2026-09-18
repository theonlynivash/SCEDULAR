import { Router } from 'express'
import { z } from 'zod'
import {
  deleteLab,
  deleteLabCourseMapping,
  listLabCourseMappings,
  listLabSubjectMappings,
  listLabs,
  setLabCourseMapping,
  setLabSubjectMapping,
  deleteLabSubjectMapping,
  upsertLab,
} from '../db/repo.js'

export const labsRouter = Router()

const labSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capacity: z.number().int().positive().nullable().optional(),
})
const courseMappingSchema = z.object({ labId: z.string().min(1), courseId: z.string().min(1) })
const subjectMappingSchema = z.object({
  labId: z.string().min(1),
  subjectId: z.string().min(1),
  sectionId: z.string().min(1).nullable().optional(),
})

labsRouter.get('/', async (_req, res, next) => {
  try {
    const [labs, mappings] = await Promise.all([listLabs(), listLabCourseMappings()])
    res.json(labs.map(l => ({ ...l, courseIds: mappings.filter(m => m.labId === l.id).map(m => m.courseId) })))
  } catch (err) {
    next(err)
  }
})

labsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = labSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await upsertLab({ ...parsed.data, capacity: parsed.data.capacity ?? null })
    res.status(201).json({ ...parsed.data, capacity: parsed.data.capacity ?? null })
  } catch (err) {
    next(err)
  }
})

// Legacy global course ↔ lab mapping kept for compatibility with older UI.
labsRouter.post('/mapping', async (req, res, next) => {
  try {
    const parsed = courseMappingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await setLabCourseMapping(parsed.data.labId, parsed.data.courseId)
    res.status(201).json(parsed.data)
  } catch (err) {
    next(err)
  }
})

// Canonical section-aware subject ↔ lab mapping.
labsRouter.get('/subject-mapping', async (_req, res, next) => {
  try {
    res.json(await listLabSubjectMappings())
  } catch (err) {
    next(err)
  }
})

labsRouter.post('/subject-mapping', async (req, res, next) => {
  try {
    const parsed = subjectMappingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await setLabSubjectMapping(parsed.data.labId, parsed.data.subjectId, parsed.data.sectionId ?? null)
    res.status(201).json({ ...parsed.data, sectionId: parsed.data.sectionId ?? null })
  } catch (err) {
    next(err)
  }
})

labsRouter.delete('/subject-mapping', async (req, res, next) => {
  try {
    const parsed = subjectMappingSchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await deleteLabSubjectMapping(parsed.data.labId, parsed.data.subjectId, parsed.data.sectionId ?? null)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

labsRouter.delete('/mapping', async (req, res, next) => {
  try {
    const parsed = courseMappingSchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await deleteLabCourseMapping(parsed.data.labId, parsed.data.courseId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

labsRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteLab(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
