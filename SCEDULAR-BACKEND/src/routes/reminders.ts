/**
 * Calendar reminders, like events in Google Calendar: a date (and optional time), a title and a note.
 * Everyone keeps their own; the HOD can also post one for all teachers. The dashboard lists them soonest first.
 */
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { saveLocalDb, getLocalDb } from '../db/localDb.js'
import { isDate, todayIst } from '../leave/service.js'
import type { Reminder } from '../types.js'

export const remindersRouter = Router()
const fail = (res: any, status: number, error: string, message: string) => res.status(status).json({ error, message })
const MAX_PER_USER = 500

function table() {
  const db = getLocalDb()
  db.reminders ??= []
  db.nextReminderId ??= Math.max(1, ...db.reminders.map(r => r.id + 1))
  return db as typeof db & { reminders: Reminder[]; nextReminderId: number }
}
const visibleTo = (r: Reminder, me: string) => r.ownerId === me || r.audience === 'all'
const order = (a: Reminder, b: Reminder) => a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.id - b.id

// GET /api/reminders?from=YYYY-MM-DD&to=YYYY-MM-DD -> mine and the HOD's notices, soonest first (default: today onwards)
remindersRouter.get('/reminders', requireAuth, (req, res) => {
  const me = req.auth!.facultyId
  const from = typeof req.query.from === 'string' && isDate(req.query.from) ? req.query.from : todayIst()
  const to = typeof req.query.to === 'string' && isDate(req.query.to) ? req.query.to : '9999-12-31'
  res.json(table().reminders.filter(r => visibleTo(r, me) && r.date >= from && r.date <= to).sort(order).map(r => ({ ...r, mine: r.ownerId === me })))
})

const body = z.object({
  date: z.string().refine(isDate, 'Pick a valid date.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time looks like 14:30.').nullable().optional(),
  title: z.string().trim().min(1, 'Give the reminder a title.').max(120),
  note: z.string().trim().max(300).optional(),
  audience: z.enum(['me', 'all']).optional(),
})

// POST /api/reminders
remindersRouter.post('/reminders', requireAuth, (req, res) => {
  const p = body.safeParse(req.body)
  if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Check the reminder.')
  const me = req.auth!.facultyId
  if (p.data.audience === 'all' && req.auth!.role !== 'HOD') return fail(res, 403, 'FORBIDDEN', 'Only the HOD can post a reminder for everyone.')
  if (p.data.date < todayIst()) return fail(res, 400, 'PAST', 'A reminder cannot be set in the past.')
  const t = table()
  if (t.reminders.filter(r => r.ownerId === me).length >= MAX_PER_USER) return fail(res, 409, 'TOO_MANY', 'Delete some old reminders first.')
  const r: Reminder = { id: t.nextReminderId, ownerId: me, date: p.data.date, time: p.data.time ?? null, title: p.data.title, note: p.data.note ?? '', audience: p.data.audience ?? 'me', done: false, createdAt: new Date().toISOString() }
  t.nextReminderId += 1
  t.reminders.push(r)
  saveLocalDb()
  res.status(201).json({ ...r, mine: true })
})

// PUT /api/reminders/:id -> edit or tick off (owner only)
remindersRouter.put('/reminders/:id', requireAuth, (req, res) => {
  const t = table(), r = t.reminders.find(x => x.id === Number(req.params.id))
  if (!r || !visibleTo(r, req.auth!.facultyId)) return fail(res, 404, 'NOT_FOUND', 'Reminder not found.')
  if (r.ownerId !== req.auth!.facultyId) return fail(res, 403, 'FORBIDDEN', 'Only the person who set it can change it.')
  const p = body.partial().extend({ done: z.boolean().optional() }).safeParse(req.body)
  if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Check the reminder.')
  if (p.data.audience === 'all' && req.auth!.role !== 'HOD') return fail(res, 403, 'FORBIDDEN', 'Only the HOD can post a reminder for everyone.')
  if (p.data.date !== undefined) r.date = p.data.date
  if (p.data.time !== undefined) r.time = p.data.time
  if (p.data.title !== undefined) r.title = p.data.title
  if (p.data.note !== undefined) r.note = p.data.note
  if (p.data.audience !== undefined) r.audience = p.data.audience
  if (p.data.done !== undefined) r.done = p.data.done
  saveLocalDb()
  res.json({ ...r, mine: true })
})

// DELETE /api/reminders/:id (the owner; the HOD may also remove a notice posted for everyone)
remindersRouter.delete('/reminders/:id', requireAuth, (req, res) => {
  const t = table(), r = t.reminders.find(x => x.id === Number(req.params.id))
  if (!r || !visibleTo(r, req.auth!.facultyId)) return fail(res, 404, 'NOT_FOUND', 'Reminder not found.')
  if (r.ownerId !== req.auth!.facultyId && !(req.auth!.role === 'HOD' && r.audience === 'all')) return fail(res, 403, 'FORBIDDEN', 'Only the person who set it can delete it.')
  t.reminders = t.reminders.filter(x => x.id !== r.id)
  saveLocalDb()
  res.json({ ok: true })
})
