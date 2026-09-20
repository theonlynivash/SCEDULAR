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
  updateFacultyExperienceFields,
} from '../db/repo.js'
import { requireAuth } from '../auth/middleware.js'

export const facultyRouter = Router()

const experienceSchema = z.object({
  previousExperience: z.number().int().min(0).optional(),
  currentExperience: z.number().int().min(0).optional(),
  allocationExperience: z.number().int().min(0).optional(),
})

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

facultyRouter.get('/', async (_req, res, next) => {
  try {
    const faculty = await listFaculty()
    const withUnavailability = await Promise.all(
      faculty.map(async f => ({ ...f, unavailability: await listFacultyUnavailability(f.id) }))
    )
    res.json(withUnavailability)
  } catch (err) {
    next(err)
  }
})

facultyRouter.get('/:id', async (req, res, next) => {
  try {
    const f = await getFaculty(req.params.id)
    if (!f) return res.status(404).json({ error: 'Faculty not found' })
    res.json({ ...f, unavailability: await listFacultyUnavailability(f.id) })
  } catch (err) {
    next(err)
  }
})

facultyRouter.post('/', async (req, res, next) => {
  try {
    const parsed = facultySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await upsertFaculty({ ...parsed.data, designation: parsed.data.designation ?? null })
    res.status(201).json(await getFaculty(parsed.data.id))
  } catch (err) {
    next(err)
  }
})

facultyRouter.put('/:id', async (req, res, next) => {
  try {
    const parsed = facultySchema.safeParse({ ...req.body, id: req.params.id })
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await upsertFaculty({ ...parsed.data, designation: parsed.data.designation ?? null })
    res.json(await getFaculty(req.params.id))
  } catch (err) {
    next(err)
  }
})

// A faculty member may only edit their OWN experience fields (self-service
// profile completion); the HOD may edit anyone's. facultyId always comes
// from the authenticated session for the self-service case -- never trusted
// from the client for someone else's record.
facultyRouter.patch('/:id/experience', requireAuth, async (req, res, next) => {
  try {
    const isSelf = req.auth!.facultyId === req.params.id
    const isHod = req.auth!.role === 'HOD'
    if (!isSelf && !isHod) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You may only edit your own experience.' })
    }
    const parsed = experienceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ error: 'No experience fields provided' })
    }
    const updated = await updateFacultyExperienceFields(req.params.id, parsed.data)
    if (!updated) return res.status(404).json({ error: 'Faculty not found' })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

facultyRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteFaculty(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

facultyRouter.put('/:id/unavailability', async (req, res, next) => {
  try {
    const parsed = z.array(unavailabilitySchema).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await clearFacultyUnavailability(req.params.id)
    for (const u of parsed.data) await addFacultyUnavailability({ facultyId: req.params.id, ...u })
    res.json(await listFacultyUnavailability(req.params.id))
  } catch (err) {
    next(err)
  }
})
