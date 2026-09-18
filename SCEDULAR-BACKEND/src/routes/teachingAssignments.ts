import { Router } from 'express'
import { z } from 'zod'
import { addTeachingAssignment, listTeachingAssignments, removeTeachingAssignment } from '../db/repo.js'

export const teachingAssignmentsRouter = Router()
const schema = z.object({ facultyId: z.string().min(1), sectionSubjectId: z.number().int().positive(), component: z.enum(['THEORY','LAB']), batch: z.string().nullable().optional() })
teachingAssignmentsRouter.get('/', async (_req,res,next)=>{ try { res.json(await listTeachingAssignments()) }catch(err){next(err)} })
teachingAssignmentsRouter.post('/', async (req,res,next)=>{ try { const p=schema.safeParse(req.body); if(!p.success)return res.status(400).json({error:p.error.flatten()}); const id=await addTeachingAssignment({...p.data,batch:p.data.batch??null}); res.status(201).json({id,...p.data,batch:p.data.batch??null}) }catch(err){next(err)} })
teachingAssignmentsRouter.delete('/:id', async (req,res,next)=>{ try { const id=Number(req.params.id); if(!Number.isInteger(id))return res.status(400).json({error:'Invalid assignment id'}); await removeTeachingAssignment(id); res.status(204).end() }catch(err){next(err)} })
