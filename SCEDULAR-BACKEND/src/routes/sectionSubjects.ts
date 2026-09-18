import { Router } from 'express'
import { z } from 'zod'
import { listSectionSubjects, upsertSectionSubject } from '../db/repo.js'

export const sectionSubjectsRouter = Router()
const schema = z.object({
  sectionId: z.string().min(1),
  subjectId: z.string().min(1),
  theoryPeriods: z.number().int().nonnegative(),
  labPeriods: z.number().int().nonnegative(),
  labBlockLength: z.preprocess(
    (value) => value === undefined ? null : value,
    z.number().int().positive().nullable()
  )
})
sectionSubjectsRouter.get('/', async (_req,res,next)=>{ try { res.json(await listSectionSubjects()) } catch(err){ next(err) } })
sectionSubjectsRouter.post('/', async (req,res,next)=>{ try { const p=schema.safeParse(req.body); if(!p.success)return res.status(400).json({error:p.error.flatten()}); const payload = { ...p.data, labBlockLength: p.data.labBlockLength ?? null }; const id=await upsertSectionSubject(payload); res.status(201).json({id,...payload}) }catch(err){next(err)} })
