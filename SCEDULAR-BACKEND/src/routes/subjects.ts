import { Router } from 'express'
import { z } from 'zod'
import { deleteSubject, getSubject, listSubjects, upsertSubject } from '../db/repo.js'

export const subjectsRouter = Router()

const subjectSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  deliveryType: z.enum(['THEORY', 'LAB', 'INTEGRATED']),
  category: z.enum(['CORE', 'ELECTIVE', 'MANDATORY', 'ADDITIONAL', 'OTHER']),
})

subjectsRouter.get('/', async (_req, res, next) => { try { res.json(await listSubjects()) } catch (err) { next(err) } })
subjectsRouter.get('/:id', async (req, res, next) => { try { const s = await getSubject(req.params.id); if (!s) return res.status(404).json({ error: 'Subject not found' }); res.json(s) } catch (err) { next(err) } })
subjectsRouter.post('/', async (req, res, next) => { try { const p = subjectSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ error: p.error.flatten() }); await upsertSubject(p.data); res.status(201).json(p.data) } catch (err) { next(err) } })
subjectsRouter.put('/:id', async (req, res, next) => { try { const p = subjectSchema.safeParse({ ...req.body, id: req.params.id }); if (!p.success) return res.status(400).json({ error: p.error.flatten() }); await upsertSubject(p.data); res.json(p.data) } catch (err) { next(err) } })
subjectsRouter.delete('/:id', async (req, res, next) => { try { await deleteSubject(req.params.id); res.status(204).end() } catch (err) { next(err) } })
