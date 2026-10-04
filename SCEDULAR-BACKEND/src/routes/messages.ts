import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { addMessage, getFaculty, listFaculty, listMessagesFor, listPhotoTimes, markMessagesRead } from '../db/repo.js'

export const messagesRouter = Router()

/** The department has one chat partner for teachers (the HOD); the HOD talks to any teacher. */
async function hodId(): Promise<string | null> {
  return (await listFaculty()).find(f => f.role === 'HOD')?.id ?? null
}

// GET /api/messages/threads -> HOD: every teacher (with last message + unread count); teacher: the single thread with the HOD
messagesRouter.get('/messages/threads', requireAuth, async (req, res, next) => {
  try {
    const me = req.auth!.facultyId
    const mine = await listMessagesFor(me)
    const photos = await listPhotoTimes()
    const partners = req.auth!.role === 'HOD' ? (await listFaculty()).filter(f => f.id !== me) : [(await listFaculty()).find(f => f.role === 'HOD')].filter(Boolean) as any[]
    const threads = partners.map(p => {
      const msgs = mine.filter(m => m.fromId === p.id || m.toId === p.id)
      const last = msgs[msgs.length - 1]
      return { id: p.id, photoAt: photos[p.id] ?? null, name: p.name, designation: p.designation, lastText: last?.text ?? null, lastAt: last?.sentAt ?? null, lastFromMe: last ? last.fromId === me : null, unread: msgs.filter(m => m.toId === me && !m.readAt).length }
    })
    threads.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name))
    res.json(threads)
  } catch (err) { next(err) }
})

// GET /api/messages/unread -> { count }
messagesRouter.get('/messages/unread', requireAuth, async (req, res, next) => {
  try {
    const me = req.auth!.facultyId
    res.json({ count: (await listMessagesFor(me)).filter(m => m.toId === me && !m.readAt).length })
  } catch (err) { next(err) }
})

// GET /api/messages/thread/:otherId -> messages with that person; opening it marks theirs as read
messagesRouter.get('/messages/thread/:otherId', requireAuth, async (req, res, next) => {
  try {
    const me = req.auth!.facultyId, other = String(req.params.otherId)
    if (!(await allowed(req.auth!.role, other))) return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only message the HOD.' })
    await markMessagesRead(other, me)
    res.json((await listMessagesFor(me)).filter(m => m.fromId === other || m.toId === other))
  } catch (err) { next(err) }
})

const sendBody = z.object({ toId: z.string().min(1), text: z.string().trim().min(1).max(1000) })

// POST /api/messages { toId, text }
messagesRouter.post('/messages', requireAuth, async (req, res, next) => {
  try {
    const p = sendBody.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: 'INVALID_INPUT', message: 'Write a message (up to 1000 characters).' })
    const me = req.auth!.facultyId
    if (p.data.toId === me || !(await allowed(req.auth!.role, p.data.toId))) return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only message the HOD.' })
    res.status(201).json(await addMessage(me, p.data.toId, p.data.text))
  } catch (err) { next(err) }
})

async function allowed(role: string, otherId: string): Promise<boolean> {
  if (role === 'HOD') return Boolean(await getFaculty(otherId))
  return otherId === (await hodId())
}
