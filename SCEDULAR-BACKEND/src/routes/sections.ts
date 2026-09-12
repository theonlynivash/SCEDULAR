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

sectionsRouter.get('/', (_req, res) => res.json(listSections()))

sectionsRouter.post('/', (req, res) => {
  const parsed = sectionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  upsertSection({ ...parsed.data, year: parsed.data.year ?? null, semester: parsed.data.semester ?? null })
  res.status(201).json(parsed.data)
})

sectionsRouter.delete('/:id', (req, res) => {
  deleteSection(req.params.id)
  res.status(204).end()
})
