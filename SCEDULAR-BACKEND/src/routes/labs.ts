import { Router } from 'express'
import { z } from 'zod'
import { deleteLab, listLabCourseMappings, listLabs, setLabCourseMapping, upsertLab } from '../db/repo.js'

export const labsRouter = Router()

const labSchema = z.object({ id: z.string().min(1), name: z.string().min(1) })
const mappingSchema = z.object({ labId: z.string().min(1), courseId: z.string().min(1) })

labsRouter.get('/', (_req, res) => {
  const labs = listLabs()
  const mappings = listLabCourseMappings()
  res.json(
    labs.map(l => ({ ...l, courseIds: mappings.filter(m => m.labId === l.id).map(m => m.courseId) }))
  )
})

labsRouter.post('/', (req, res) => {
  const parsed = labSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  upsertLab(parsed.data)
  res.status(201).json(parsed.data)
})

labsRouter.delete('/:id', (req, res) => {
  deleteLab(req.params.id)
  res.status(204).end()
})

// Global lab <-> course mapping, e.g. OOP + DBMS sharing one physical lab
// (Section 7 of the report). A lab may host more than one course; a course
// may be hostable in more than one lab.
labsRouter.post('/mapping', (req, res) => {
  const parsed = mappingSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  setLabCourseMapping(parsed.data.labId, parsed.data.courseId)
  res.status(201).json(parsed.data)
})
