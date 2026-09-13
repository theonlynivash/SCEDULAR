import { Router } from 'express'
import { z } from 'zod'
import { deleteLab, deleteLabCourseMapping, listLabCourseMappings, listLabs, setLabCourseMapping, upsertLab } from '../db/repo.js'

export const labsRouter = Router()

const labSchema = z.object({ id: z.string().min(1), name: z.string().min(1) })
const mappingSchema = z.object({ labId: z.string().min(1), courseId: z.string().min(1) })

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
    await upsertLab(parsed.data)
    res.status(201).json(parsed.data)
  } catch (err) {
    next(err)
  }
})

// Global lab <-> course mapping, e.g. OOP + DBMS sharing one physical lab
// (Section 7 of the report). A lab may host more than one course; a course
// may be hostable in more than one lab. Registered BEFORE the generic
// '/:id' delete route below -- Express matches routes in registration
// order, and '/:id' would otherwise swallow "DELETE /mapping" by binding
// id="mapping" and silently deleting nothing.
labsRouter.post('/mapping', async (req, res, next) => {
  try {
    const parsed = mappingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await setLabCourseMapping(parsed.data.labId, parsed.data.courseId)
    res.status(201).json(parsed.data)
  } catch (err) {
    next(err)
  }
})

labsRouter.delete('/mapping', async (req, res, next) => {
  try {
    const parsed = mappingSchema.safeParse(req.query)
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
