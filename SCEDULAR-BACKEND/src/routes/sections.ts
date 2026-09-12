import { Router } from 'express'
import { z } from 'zod'
import { deleteSection, listSections, upsertSection } from '../db/repo.js'

export const sectionsRouter = Router()

const sectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  year: z.string().nullable().optional(),
  semester: z.string().nullable().optional(),
})

sectionsRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listSections())
  } catch (err) {
    next(err)
  }
})

sectionsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = sectionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await upsertSection({ ...parsed.data, year: parsed.data.year ?? null, semester: parsed.data.semester ?? null })
    res.status(201).json(parsed.data)
  } catch (err) {
    next(err)
  }
})

sectionsRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteSection(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
