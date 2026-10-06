/**
 * Leave letters and substitutions.
 *
 *  teacher: asks for leave (sees her classes of those dates, who is free in each period, and may name the colleagues who agreed)
 *  HOD:     receives the letter (message box + email), sees the classes grouped by section with the free teachers under each,
 *           assigns one substitute per class
 *  substitute: sees "you take <section> in place of <teacher>" on the dashboard; the figures on the Leave tab count both sides
 */
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { addMessage, getFaculty, listFaculty } from '../db/repo.js'
import { saveLocalDb, runAtomic } from '../db/localDb.js'
import { sendMail } from '../mail/mailer.js'
import type { LeaveRequest, Substitution } from '../types.js'
import { MAX_LEAVE_DAYS, absenceReport, buildSlots, coverageOf, datesBetween, defaultLetter, freeFor, isDate, leaveTables, loadCtx, summaryFor, todayIst, type Ctx } from '../leave/service.js'

export const leaveRouter = Router()
const fail = (res: any, status: number, error: string, message: string) => res.status(status).json({ error, message })
const isHod = (req: any) => req.auth!.role === 'HOD'

async function hodOf(): Promise<string | null> { return (await listFaculty()).find(f => f.role === 'HOD')?.id ?? null }

/** best-effort notices: the in-app message always, the email when the person has one. A failure never undoes the change. */
async function tell(fromId: string | null, toId: string, subject: string, text: string, mail = true) {
  try { if (fromId && fromId !== toId) await addMessage(fromId, toId, text.length > 1000 ? text.slice(0, 997) + '…' : text) } catch (e) { console.warn('[leave] message failed:', (e as Error).message) }
  if (!mail) return
  try { const f = await getFaculty(toId); if (f?.email) await sendMail({ to: f.email, subject, text: `${text}\n\n— SCEDULAR` }) } catch (e) { console.warn('[leave] mail failed:', (e as Error).message) }
}

const fmtDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })
const periodsText = (s: { startPeriod: number; endPeriod: number }) => (s.startPeriod === s.endPeriod ? `P${s.startPeriod}` : `P${s.startPeriod}-${s.endPeriod}`)

function present(ctx: Ctx, l: LeaveRequest, withCandidates: boolean) {
  const name = (id: string) => ctx.faculty.find(f => f.id === id)?.name ?? id
  const subs = ctx.subs.filter(s => s.leaveId === l.id)
  const slots = l.slots.map(s => {
    const sub = subs.find(x => x.slotKey === s.key)
    return {
      ...s,
      subjectName: ctx.subjects.find(x => x.id === s.subjectId)?.name ?? s.subjectId,
      subjectCode: ctx.subjects.find(x => x.id === s.subjectId)?.code ?? s.subjectId,
      proposed: (l.proposed[s.key] ?? []).map(id => ({ facultyId: id, name: name(id) })),
      substitute: sub ? { facultyId: sub.substituteFacultyId, name: name(sub.substituteFacultyId), assignedAt: sub.assignedAt } : null,
      candidates: withCandidates && l.status !== 'REJECTED' && l.status !== 'CANCELLED' && s.date >= todayIst()
        ? freeFor(ctx, s, { requesterId: l.facultyId, proposed: l.proposed[s.key], ignoreSubId: sub?.id }) : [],
    }
  })
  return { id: l.id, facultyId: l.facultyId, facultyName: name(l.facultyId), fromDate: l.fromDate, toDate: l.toDate, reason: l.reason, letter: l.letter, status: l.status, hodNote: l.hodNote, createdBy: l.createdBy, createdAt: l.createdAt, decidedAt: l.decidedAt, coverage: coverageOf(ctx, l), slots }
}

const dateRange = z.object({ from: z.string(), to: z.string() })
function checkRange(from: string, to: string): string | null {
  if (!isDate(from) || !isDate(to)) return 'Pick valid dates.'
  if (to < from) return 'The last day of leave cannot be before the first day.'
  if (datesBetween(from, to).length > MAX_LEAVE_DAYS) return `A single request can cover up to ${MAX_LEAVE_DAYS} days. Send a second request for the rest.`
  if (from < todayIst()) return 'Leave dates cannot be in the past.'
  return null
}

// GET /api/leave/preview?from&to[&facultyId] -> the classes of those dates, with the free teachers for each
leaveRouter.get('/leave/preview', requireAuth, async (req, res, next) => {
  try {
    const p = dateRange.safeParse(req.query)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', 'Give the first and last day of leave.')
    const err = checkRange(p.data.from, p.data.to)
    if (err) return fail(res, 400, 'INVALID_DATES', err)
    const who = isHod(req) && typeof req.query.facultyId === 'string' ? String(req.query.facultyId) : req.auth!.facultyId
    const f = await getFaculty(who)
    if (!f) return fail(res, 404, 'NOT_FOUND', 'Teacher not found.')
    const ctx = await loadCtx()
    const overlap = ctx.leaves.find(l => l.facultyId === who && (l.status === 'PENDING' || l.status === 'APPROVED') && l.fromDate <= p.data.to && p.data.from <= l.toDate)
    const slots = buildSlots(ctx, who, p.data.from, p.data.to)
    res.json({
      facultyId: who, timetableReady: ctx.runId !== null, overlapsLeaveId: overlap?.id ?? null,
      letter: defaultLetter(f, p.data.from, p.data.to, ''),
      slots: slots.map(s => ({ ...s, subjectName: ctx.subjects.find(x => x.id === s.subjectId)?.name ?? s.subjectId, candidates: freeFor(ctx, s, { requesterId: who }) })),
    })
  } catch (err) { next(err) }
})

const createBody = z.object({
  fromDate: z.string(), toDate: z.string(),
  reason: z.string().trim().min(3, 'Give a short reason.').max(300),
  letter: z.string().trim().max(3000).optional(),
  proposed: z.record(z.string(), z.array(z.string()).max(10)).optional(),
  facultyId: z.string().optional(),
})

// POST /api/leave -> sends the letter (HOD may record one for a teacher)
leaveRouter.post('/leave', requireAuth, async (req, res, next) => {
  try {
    const p = createBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Check the leave details.')
    const err = checkRange(p.data.fromDate, p.data.toDate)
    if (err) return fail(res, 400, 'INVALID_DATES', err)
    const me = req.auth!.facultyId
    const who = isHod(req) && p.data.facultyId ? p.data.facultyId : me
    const f = await getFaculty(who)
    if (!f) return fail(res, 404, 'NOT_FOUND', 'Teacher not found.')
    const ctx = await loadCtx()
    if (ctx.leaves.some(l => l.facultyId === who && (l.status === 'PENDING' || l.status === 'APPROVED') && l.fromDate <= p.data.toDate && p.data.fromDate <= l.toDate)) {
      return fail(res, 409, 'OVERLAP', 'There is already a leave request for some of these dates.')
    }
    const slots = buildSlots(ctx, who, p.data.fromDate, p.data.toDate)
    // only teachers who really are free at that time can be named
    const proposed: Record<string, string[]> = {}
    for (const s of slots) {
      const free = new Set(freeFor(ctx, s, { requesterId: who }).map(c => c.facultyId))
      const names = [...new Set(p.data.proposed?.[s.key] ?? [])].filter(id => free.has(id))
      if (names.length) proposed[s.key] = names
    }
    const t = leaveTables()
    const leave: LeaveRequest = {
      id: t.nextLeaveId, facultyId: who, fromDate: p.data.fromDate, toDate: p.data.toDate, reason: p.data.reason,
      letter: p.data.letter || defaultLetter(f, p.data.fromDate, p.data.toDate, p.data.reason), slots, proposed,
      // the HOD taking her own leave needs no approval: she assigns the substitutes herself
      status: who === me && isHod(req) ? 'APPROVED' : 'PENDING', hodNote: null, createdBy: me, createdAt: new Date().toISOString(),
      decidedAt: who === me && isHod(req) ? new Date().toISOString() : null,
    }
    t.nextLeaveId += 1
    t.leaveRequests.push(leave)
    saveLocalDb()

    const range = leave.fromDate === leave.toDate ? fmtDate(leave.fromDate) : `${fmtDate(leave.fromDate)} to ${fmtDate(leave.toDate)}`
    const secs = [...new Set(slots.map(s => s.sectionId))]
    const hod = await hodOf()
    const summary = `${slots.length} class${slots.length === 1 ? '' : 'es'}${secs.length ? ` in ${secs.length} section${secs.length === 1 ? '' : 's'} (${secs.join(', ')})` : ''}`
    if (who !== hod && hod) {
      await tell(who, hod, `Leave request from ${f.name}`, `Leave request #${leave.id} from ${f.name}: ${range}. ${summary}. Open Leave to see the letter and assign substitutes.`, false)
      // the HOD gets the whole letter by email
      try { const h = await getFaculty(hod); if (h?.email) await sendMail({ to: h.email, subject: `Leave request from ${f.name} (${range})`, text: `${leave.letter}\n\n— — —\nClasses affected: ${summary}.\nOpen SCEDULAR → Leave to assign substitutes.\n\n— SCEDULAR` }) } catch (e) { console.warn('[leave] mail failed:', (e as Error).message) }
    }
    if (who !== me) await tell(me, who, 'A leave was recorded for you', `The HOD recorded a leave for you: ${range}. ${summary}.`)
    res.status(201).json({ ok: true, id: leave.id, classes: slots.length })
  } catch (err) { next(err) }
})

// GET /api/leave/letter?from&to&reason -> the standard formal letter for those dates (the teacher may edit it before sending)
leaveRouter.get('/leave/letter', requireAuth, async (req, res, next) => {
  try {
    const p = dateRange.safeParse(req.query)
    if (!p.success || !isDate(p.data.from) || !isDate(p.data.to)) return fail(res, 400, 'INVALID_INPUT', 'Give the first and last day of leave.')
    const who = isHod(req) && typeof req.query.facultyId === 'string' ? String(req.query.facultyId) : req.auth!.facultyId
    const f = await getFaculty(who)
    if (!f) return fail(res, 404, 'NOT_FOUND', 'Teacher not found.')
    res.json({ letter: defaultLetter(f, p.data.from, p.data.to, String(req.query.reason ?? '').slice(0, 300)) })
  } catch (err) { next(err) }
})

// GET /api/leave/calendar?month=YYYY-MM -> for each day: who is on leave and which substitutions are assigned.
// The HOD sees everything; a teacher sees her own leave, the classes she takes for others and the ones taken for her.
leaveRouter.get('/leave/calendar', requireAuth, async (req, res, next) => {
  try {
    const month = String(req.query.month ?? todayIst().slice(0, 7))
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail(res, 400, 'INVALID_INPUT', 'Month looks like 2026-10.')
    const ctx = await loadCtx(), me = req.auth!.facultyId, all = isHod(req)
    const name = (id: string) => ctx.faculty.find(f => f.id === id)?.name ?? id
    const first = `${month}-01`
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10)
    const days: Record<string, { leaves: { id: number; facultyId: string; facultyName: string; status: string }[]; substitutions: any[] }> = {}
    const at = (d: string) => (days[d] ??= { leaves: [], substitutions: [] })
    for (const l of ctx.leaves) {
      if ((l.status !== 'PENDING' && l.status !== 'APPROVED') || (!all && l.facultyId !== me)) continue
      if (l.toDate < first || l.fromDate > last) continue
      for (const d of datesBetween(l.fromDate < first ? first : l.fromDate, l.toDate > last ? last : l.toDate)) at(d).leaves.push({ id: l.id, facultyId: l.facultyId, facultyName: name(l.facultyId), status: l.status })
    }
    for (const s of ctx.subs) {
      if (s.date < first || s.date > last) continue
      if (!all && s.substituteFacultyId !== me && s.originalFacultyId !== me) continue
      at(s.date).substitutions.push({
        id: s.id, leaveId: s.leaveId, startPeriod: s.startPeriod, endPeriod: s.endPeriod, sectionId: s.sectionId, blockType: s.blockType,
        subject: ctx.subjects.find(x => x.id === s.subjectId)?.name ?? s.subjectId,
        originalId: s.originalFacultyId, originalName: name(s.originalFacultyId), substituteId: s.substituteFacultyId, substituteName: name(s.substituteFacultyId),
      })
    }
    for (const d of Object.values(days)) d.substitutions.sort((a, b) => a.startPeriod - b.startPeriod || a.sectionId.localeCompare(b.sectionId, undefined, { numeric: true }))
    res.json({ month, today: todayIst(), days })
  } catch (err) { next(err) }
})

// GET /api/leave/absence -> HOD: periods each teacher did not attend because of approved leave (Reports → Absence)
leaveRouter.get('/leave/absence', requireAuth, async (req, res, next) => {
  try {
    if (!isHod(req)) return fail(res, 403, 'FORBIDDEN', 'Only the HOD sees the whole department.')
    res.json(absenceReport(await loadCtx()))
  } catch (err) { next(err) }
})

// GET /api/leave/scoreboard -> HOD: every teacher's leave taken and classes covered for others
leaveRouter.get('/leave/scoreboard', requireAuth, async (req, res, next) => {
  try {
    if (!isHod(req)) return fail(res, 403, 'FORBIDDEN', 'Only the HOD sees the whole department.')
    const ctx = await loadCtx()
    const rows = ctx.faculty.map(f => { const s = summaryFor(ctx, f.id); return { facultyId: f.id, name: f.name, leaveRequests: s.leaves.requests, leaveDays: s.leaves.days, periodsMissed: s.leaves.periodsMissed, periodsCovered: s.covering.periods } })
      .filter(r => r.leaveRequests || r.periodsCovered)
      .sort((a, b) => b.periodsCovered - a.periodsCovered || b.leaveDays - a.leaveDays || a.name.localeCompare(b.name))
    res.json(rows)
  } catch (err) { next(err) }
})

// GET /api/leave -> HOD: every request (optionally ?status=PENDING); a teacher: her own
leaveRouter.get('/leave', requireAuth, async (req, res, next) => {
  try {
    const ctx = await loadCtx()
    const status = typeof req.query.status === 'string' ? req.query.status : null
    let rows = ctx.leaves.filter(l => (isHod(req) || l.facultyId === req.auth!.facultyId) && (!status || l.status === status))
    rows = [...rows].sort((a, b) => (a.status === 'PENDING' ? 0 : 1) - (b.status === 'PENDING' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt))
    res.json(rows.map(l => { const { slots, ...rest } = present(ctx, l, false); return { ...rest, classes: slots.length } }))
  } catch (err) { next(err) }
})

// GET /api/leave/summary -> the figures for the Leave tab and the dashboard (?facultyId= for the HOD)
leaveRouter.get('/leave/summary', requireAuth, async (req, res, next) => {
  try {
    const who = isHod(req) && typeof req.query.facultyId === 'string' ? String(req.query.facultyId) : req.auth!.facultyId
    res.json(summaryFor(await loadCtx(), who))
  } catch (err) { next(err) }
})

async function mine(req: any, res: any): Promise<{ ctx: Ctx; leave: LeaveRequest } | null> {
  const ctx = await loadCtx()
  const leave = ctx.leaves.find(l => l.id === Number(req.params.id))
  if (!leave || (!isHod(req) && leave.facultyId !== req.auth!.facultyId)) { fail(res, 404, 'NOT_FOUND', 'Leave request not found.'); return null }
  return { ctx, leave }
}

// GET /api/leave/:id
leaveRouter.get('/leave/:id', requireAuth, async (req, res, next) => {
  try { const m = await mine(req, res); if (m) res.json(present(m.ctx, m.leave, isHod(req))) } catch (err) { next(err) }
})

const assignBody = z.object({ slotKey: z.string().min(1), facultyId: z.string().min(1) })

// POST /api/leave/:id/assign { slotKey, facultyId } -> HOD picks the substitute for one class
leaveRouter.post('/leave/:id/assign', requireAuth, async (req, res, next) => {
  try {
    if (!isHod(req)) return fail(res, 403, 'FORBIDDEN', 'Only the HOD assigns substitutes.')
    const p = assignBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', 'Choose the class and the teacher.')
    const m = await mine(req, res); if (!m) return
    const { ctx, leave } = m
    if (leave.status === 'REJECTED' || leave.status === 'CANCELLED') return fail(res, 409, 'CLOSED', `This leave was ${leave.status.toLowerCase()}.`)
    const slot = leave.slots.find(s => s.key === p.data.slotKey)
    if (!slot) return fail(res, 404, 'NO_SUCH_CLASS', 'That class is not part of this leave.')
    if (slot.date < todayIst()) return fail(res, 409, 'PAST', 'That class is already over.')
    const t = leaveTables()
    const existing = t.substitutions.find(s => s.leaveId === leave.id && s.slotKey === slot.key)
    const free = freeFor(ctx, slot, { requesterId: leave.facultyId, ignoreSubId: existing?.id })
    if (!free.some(c => c.facultyId === p.data.facultyId)) return fail(res, 409, 'NOT_FREE', 'That teacher is not free in this period (a class, another substitution or leave). Pick someone from the free list.')
    const wasPending = leave.status === 'PENDING'
    let sub: Substitution
    await runAtomic(async () => {
      const db = leaveTables()
      if (existing) db.substitutions = db.substitutions.filter(s => s.id !== existing.id)
      sub = { id: db.nextSubstitutionId, leaveId: leave.id, slotKey: slot.key, date: slot.date, day: slot.day, startPeriod: slot.startPeriod, endPeriod: slot.endPeriod, sectionId: slot.sectionId, subjectId: slot.subjectId, blockType: slot.blockType, originalFacultyId: leave.facultyId, substituteFacultyId: p.data.facultyId, assignedBy: req.auth!.facultyId, assignedAt: new Date().toISOString() }
      db.nextSubstitutionId += 1
      db.substitutions.push(sub)
      const l = db.leaveRequests.find(x => x.id === leave.id)!
      if (l.status === 'PENDING') { l.status = 'APPROVED'; l.decidedAt = new Date().toISOString() }   // assigning a substitute is the approval
      saveLocalDb()
    })
    const subjectName = ctx.subjects.find(x => x.id === slot.subjectId)?.name ?? slot.subjectId
    const who = ctx.faculty.find(f => f.id === leave.facultyId)?.name ?? leave.facultyId
    const me = req.auth!.facultyId
    await tell(me, p.data.facultyId, `Substitution class in place of ${who}`, `You have a substitution class in place of ${who}: ${fmtDate(slot.date)}, ${periodsText(slot)}, section ${slot.sectionId} (${subjectName}${slot.blockType === 'LAB' ? ', lab' : ''}).`)
    if (existing && existing.substituteFacultyId !== p.data.facultyId) await tell(me, existing.substituteFacultyId, 'Substitution cancelled', `The substitution class in place of ${who} on ${fmtDate(slot.date)}, ${periodsText(slot)}, section ${slot.sectionId} is no longer yours.`)
    if (wasPending) await tell(me, leave.facultyId, 'Your leave is approved', `Your leave ${fmtDate(leave.fromDate)}${leave.toDate !== leave.fromDate ? ' to ' + fmtDate(leave.toDate) : ''} is approved. The HOD is arranging substitutes for your classes; you can see who takes each one on the Leave tab.`)
    const fresh = await loadCtx()
    res.json(present(fresh, fresh.leaves.find(l => l.id === leave.id)!, true))
  } catch (err) { next(err) }
})

// DELETE /api/leave/:id/assign?slot=KEY -> HOD removes a substitute
leaveRouter.delete('/leave/:id/assign', requireAuth, async (req, res, next) => {
  try {
    if (!isHod(req)) return fail(res, 403, 'FORBIDDEN', 'Only the HOD assigns substitutes.')
    const m = await mine(req, res); if (!m) return
    const key = String(req.query.slot ?? '')
    const t = leaveTables()
    const sub = t.substitutions.find(s => s.leaveId === m.leave.id && s.slotKey === key)
    if (!sub) return fail(res, 404, 'NOT_FOUND', 'No substitute is assigned to that class.')
    t.substitutions = t.substitutions.filter(s => s.id !== sub.id)
    saveLocalDb()
    const who = m.ctx.faculty.find(f => f.id === m.leave.facultyId)?.name ?? m.leave.facultyId
    await tell(req.auth!.facultyId, sub.substituteFacultyId, 'Substitution cancelled', `The substitution class in place of ${who} on ${fmtDate(sub.date)}, ${periodsText(sub)}, section ${sub.sectionId} was cancelled. You do not need to take it.`)
    const fresh = await loadCtx()
    res.json(present(fresh, fresh.leaves.find(l => l.id === m.leave.id)!, true))
  } catch (err) { next(err) }
})

const decisionBody = z.object({ action: z.enum(['APPROVE', 'REJECT']), note: z.string().trim().max(300).optional() })

// POST /api/leave/:id/decision { action, note } -> HOD approves (even before every class is covered) or rejects
leaveRouter.post('/leave/:id/decision', requireAuth, async (req, res, next) => {
  try {
    if (!isHod(req)) return fail(res, 403, 'FORBIDDEN', 'Only the HOD decides on leave.')
    const p = decisionBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', 'Choose approve or reject.')
    const m = await mine(req, res); if (!m) return
    const l = leaveTables().leaveRequests.find(x => x.id === m.leave.id)!
    if (l.status === 'CANCELLED') return fail(res, 409, 'CLOSED', 'This leave was cancelled.')
    const t = leaveTables()
    const who = m.ctx.faculty.find(f => f.id === l.facultyId)?.name ?? l.facultyId
    if (p.data.action === 'REJECT') {
      const removed = t.substitutions.filter(s => s.leaveId === l.id)
      t.substitutions = t.substitutions.filter(s => s.leaveId !== l.id)
      l.status = 'REJECTED'
      for (const s of removed) await tell(req.auth!.facultyId, s.substituteFacultyId, 'Substitution cancelled', `The substitution class in place of ${who} on ${fmtDate(s.date)}, ${periodsText(s)}, section ${s.sectionId} was cancelled because the leave was not approved.`)
    } else l.status = 'APPROVED'
    l.hodNote = p.data.note || null
    l.decidedAt = new Date().toISOString()
    saveLocalDb()
    await tell(req.auth!.facultyId, l.facultyId, `Your leave was ${l.status === 'APPROVED' ? 'approved' : 'not approved'}`, `Your leave ${fmtDate(l.fromDate)}${l.toDate !== l.fromDate ? ' to ' + fmtDate(l.toDate) : ''} was ${l.status === 'APPROVED' ? 'approved' : 'not approved'}${l.hodNote ? `. Note from the HOD: ${l.hodNote}` : '.'}`)
    const fresh = await loadCtx()
    res.json(present(fresh, fresh.leaves.find(x => x.id === l.id)!, true))
  } catch (err) { next(err) }
})

// POST /api/leave/:id/cancel -> the teacher (or the HOD) withdraws the request; its substitutes are told
leaveRouter.post('/leave/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const m = await mine(req, res); if (!m) return
    const t = leaveTables()
    const l = t.leaveRequests.find(x => x.id === m.leave.id)!
    if (l.status === 'CANCELLED' || l.status === 'REJECTED') return fail(res, 409, 'CLOSED', `This leave is already ${l.status.toLowerCase()}.`)
    if (l.toDate < todayIst()) return fail(res, 409, 'PAST', 'This leave is already over.')
    const removed = t.substitutions.filter(s => s.leaveId === l.id)
    t.substitutions = t.substitutions.filter(s => s.leaveId !== l.id)
    l.status = 'CANCELLED'; l.decidedAt = new Date().toISOString()
    saveLocalDb()
    const who = m.ctx.faculty.find(f => f.id === l.facultyId)?.name ?? l.facultyId
    for (const s of removed) await tell(req.auth!.facultyId, s.substituteFacultyId, 'Substitution cancelled', `${who} cancelled the leave, so the substitution class on ${fmtDate(s.date)}, ${periodsText(s)}, section ${s.sectionId} is cancelled.`)
    const hod = await hodOf()
    if (hod && req.auth!.facultyId !== hod) await tell(req.auth!.facultyId, hod, `Leave cancelled by ${who}`, `${who} cancelled leave request #${l.id} (${fmtDate(l.fromDate)}${l.toDate !== l.fromDate ? ' to ' + fmtDate(l.toDate) : ''}).`, false)
    res.json({ ok: true })
  } catch (err) { next(err) }
})
