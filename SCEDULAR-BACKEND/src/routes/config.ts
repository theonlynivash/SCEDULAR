import { Router } from 'express'
import { z } from 'zod'
import { getScheduleConfig, setScheduleConfig } from '../db/repo.js'

export const configRouter = Router()

const periodSchema = z.object({
  index: z.number().int().positive(),
  label: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  schedulable: z.boolean(),
})

const configSchema = z.object({
  workingDays: z.array(z.string().min(1)).min(1),
  periods: z.array(periodSchema).min(1),
})

configRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await getScheduleConfig())
  } catch (err) {
    next(err)
  }
})

configRouter.put('/', async (req, res, next) => {
  try {
    const parsed = configSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    await setScheduleConfig(parsed.data)
    res.json(parsed.data)
  } catch (err) {
    next(err)
  }
})
