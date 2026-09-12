import { Router } from 'express'
import { z } from 'zod'
import {
  addFacultyUnavailability,
  clearFacultyUnavailability,
  deleteFaculty,
  getFaculty,
  listFaculty,
  listFacultyUnavailability,
  upsertFaculty,
} from '../db/repo.js'

export const facultyRouter = Router()

const facultySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  designation: z.string().nullable().optional(),
  maxDailyPeriods: z.number().int().positive().default(6),
  maxWeeklyPeriods: z.number().int().positive().default(24),
})

const unavailabilitySchema = z.object({
  day: z.string().min(1),
  period: z.number().int().positive(),
})

facultyRouter.get('/', (_req, res) => {
  const faculty = listFaculty()
  const withUnavailability = faculty.map(f => ({
    ...f,
    unavailability: listFacultyUnavailability(f.id),
  }))
  res.json(withUnavailability)
})

facultyRouter.get('/:id', (req, res) => {
  const f = getFaculty(req.params.id)
  if (!f) return res.status(404).json({ error: 'Faculty not found' })
  res.json({ ...f, unavailability: listFacultyUnavailability(f.id) })
})

facultyRouter.post('/', (req, res) => {
  const parsed = facultySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  upsertFaculty({ ...parsed.data, designation: parsed.data.designation ?? null })
  res.status(201).json(getFaculty(parsed.data.id))
})

facultyRouter.put('/:id', (req, res) => {
  const parsed = facultySchema.safeParse({ ...req.body, id: req.params.id })
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  upsertFaculty({ ...parsed.data, designation: parsed.data.designation ?? null })
  res.json(getFaculty(req.params.id))
})

facultyRouter.delete('/:id', (req, res) => {
  deleteFaculty(req.params.id)
  res.status(204).end()
})

facultyRouter.put('/:id/unavailability', (req, res) => {
  const parsed = z.array(unavailabilitySchema).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  clearFacultyUnavailability(req.params.id)
  for (const u of parsed.data) addFacultyUnavailability({ facultyId: req.params.id, ...u })
  res.json(listFacultyUnavailability(req.params.id))
})
