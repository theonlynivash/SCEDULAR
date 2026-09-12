import { Router } from 'express'
import { z } from 'zod'
import { deleteCourse, listCourses, upsertCourse } from '../db/repo.js'

export const coursesRouter = Router()

const courseSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  componentType: z.enum(['INTEGRATED', 'NON_INTEGRATED', 'MANDATORY', 'LAB_ONLY']),
  labBlockLength: z.number().int().positive().default(3),
})

coursesRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listCourses())
  } catch (err) {
    next(err)
  }
})

coursesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = courseSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await upsertCourse(parsed.data)
    res.status(201).json(parsed.data)
  } catch (err) {
    next(err)
  }
})

coursesRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteCourse(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
