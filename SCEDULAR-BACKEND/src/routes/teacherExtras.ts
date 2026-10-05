/**
 * Teacher-side extras: past-semester class results, contact details, and the HOD's mail tools
 * (AI-assisted drafting, sending with optional login details, a send log).
 */
import { Router } from 'express'
import { z } from 'zod'
import {
  addFacultyResult, addMailLog, deleteFacultyResult, getFaculty, listFaculty, listFacultyResults, listMailLog, listSubjects, upsertFaculty,
} from '../db/repo.js'
import { saveLocalDb } from '../db/localDb.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { generatePassword, setFacultyPassword } from '../auth/passwords.js'
import { callLlm } from '../ai/llm.js'
import { MailError, capturedMail, mailStatus, sendMail, verifyMail } from '../mail/mailer.js'
import type { FacultyResult } from '../types.js'

export const teacherExtrasRouter = Router()
const fail = (res: any, status: number, error: string, message: string) => res.status(status).json({ error, message })
const SEMS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

// ───────────────────────── results ─────────────────────────
export function summarize(results: FacultyResult[]) {
  const n = results.length
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  const withCount = results.filter(r => r.studentsAppeared)
  const totalStudents = withCount.reduce((a, r) => a + (r.studentsAppeared ?? 0), 0)
  const bySemester = new Map<string, number[]>()
  for (const r of results) bySemester.set(`${r.academicYear} · Sem ${r.semester}`, [...(bySemester.get(`${r.academicYear} · Sem ${r.semester}`) ?? []), r.passPercent])
  return {
    count: n,
    average: mean(results.map(r => r.passPercent)),
    // weighted by the number of students who appeared, when every entry says how many
    weightedAverage: n > 0 && withCount.length === n && totalStudents > 0
      ? Math.round((withCount.reduce((a, r) => a + r.passPercent * (r.studentsAppeared ?? 0), 0) / totalStudents) * 10) / 10
      : null,
    best: n ? Math.max(...results.map(r => r.passPercent)) : null,
    lowest: n ? Math.min(...results.map(r => r.passPercent)) : null,
    bySemester: [...bySemester.entries()].map(([label, xs]) => ({ label, average: mean(xs)!, entries: xs.length })).sort((a, b) => a.label.localeCompare(b.label)),
  }
}

const resultBody = z.object({
  academicYear: z.string().regex(/^\d{4}-\d{2,4}$/, 'Academic year looks like 2025-26.'),
  semester: z.enum(SEMS as [string, ...string[]]),
  subjectId: z.string().nullable().optional(),
  subjectName: z.string().trim().min(2).max(120).optional(),
  subjectCode: z.string().trim().max(24).nullable().optional(),
  sectionsHandled: z.number().int().min(1).max(26).nullable().optional(),
  studentsAppeared: z.number().int().min(1).max(500).nullable().optional(),
  passPercent: z.number().min(0, 'Pass percentage must be between 0 and 100.').max(100, 'Pass percentage must be between 0 and 100.'),
})

teacherExtrasRouter.get('/faculty/results', requireAuth, async (req, res, next) => {
  try {
    const results = await listFacultyResults(req.auth!.facultyId)
    res.json({ results, summary: summarize(results) })
  } catch (err) { next(err) }
})

teacherExtrasRouter.post('/faculty/results', requireAuth, async (req, res, next) => {
  try {
    const p = resultBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Invalid result.')
    const b = p.data
    let subjectName = b.subjectName ?? '', subjectCode = b.subjectCode ?? null, subjectId: string | null = null
    if (b.subjectId) {
      const sub = (await listSubjects()).find(s => s.id === b.subjectId)
      if (!sub) return fail(res, 400, 'UNKNOWN_SUBJECT', 'That subject does not exist.')
      subjectId = sub.id; subjectName = sub.name; subjectCode = sub.code
    }
    if (!subjectName) return fail(res, 400, 'SUBJECT_REQUIRED', 'Choose a subject, or type its name.')
    const facultyId = req.auth!.facultyId
    const existing = await listFacultyResults(facultyId)
    if (existing.some(r => r.academicYear === b.academicYear && r.semester === b.semester && r.subjectName.toLowerCase() === subjectName.toLowerCase())) {
      return fail(res, 409, 'DUPLICATE_RESULT', `You already entered a result for ${subjectName} in ${b.academicYear}, Sem ${b.semester}. Delete it first to enter it again.`)
    }
    const row = await addFacultyResult({
      facultyId, academicYear: b.academicYear, semester: b.semester, subjectId, subjectCode, subjectName,
      sectionsHandled: b.sectionsHandled ?? null, studentsAppeared: b.studentsAppeared ?? null, passPercent: Math.round(b.passPercent * 10) / 10,
    })
    res.status(201).json(row)
  } catch (err) { next(err) }
})

teacherExtrasRouter.delete('/faculty/results/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const mine = (await listFacultyResults(req.auth!.facultyId)).some(r => r.id === id)
    if (!mine && req.auth!.role !== 'HOD') return fail(res, 403, 'NOT_YOURS', 'You can only delete your own results.')
    if (!(await deleteFacultyResult(id))) return fail(res, 404, 'NOT_FOUND', 'Result not found.')
    res.json({ success: true })
  } catch (err) { next(err) }
})

// HOD: everyone's average at a glance, and one teacher's entries
teacherExtrasRouter.get('/hod/faculty-results', requireAuth, requireRole('HOD'), async (_req, res, next) => {
  try {
    const all = await listFacultyResults()
    const by = new Map<string, FacultyResult[]>()
    for (const r of all) by.set(r.facultyId, [...(by.get(r.facultyId) ?? []), r])
    res.json(Object.fromEntries([...by.entries()].map(([id, rs]) => { const s = summarize(rs); return [id, { count: s.count, average: s.average, weightedAverage: s.weightedAverage }] })))
  } catch (err) { next(err) }
})

// HOD: every teacher's entries and summary in one go (for the Reports page)
teacherExtrasRouter.get('/hod/faculty-results-all', requireAuth, requireRole('HOD'), async (_req, res, next) => {
  try {
    const [all, faculty] = await Promise.all([listFacultyResults(), listFaculty()])
    const by = new Map<string, FacultyResult[]>()
    for (const r of all) by.set(r.facultyId, [...(by.get(r.facultyId) ?? []), r])
    const teachers = faculty.filter(f => by.has(f.id)).map(f => ({
      facultyId: f.id, name: f.name, designation: f.designation, results: by.get(f.id)!, summary: summarize(by.get(f.id)!),
    })).sort((a, b) => (b.summary.average ?? 0) - (a.summary.average ?? 0))
    res.json({ teachers, totalTeachers: faculty.filter(f => f.role !== 'HOD').length })
  } catch (err) { next(err) }
})

teacherExtrasRouter.get('/hod/faculty-results/:facultyId', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const results = await listFacultyResults(req.params.facultyId)
    res.json({ results, summary: summarize(results) })
  } catch (err) { next(err) }
})

// ───────────────────────── contact details ─────────────────────────
const contactBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(120).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
})

teacherExtrasRouter.patch('/faculty/me/contact', requireAuth, async (req, res, next) => {
  try {
    const p = contactBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Invalid details.')
    const me = await getFaculty(req.auth!.facultyId)
    if (!me) return fail(res, 404, 'NOT_FOUND', 'Account not found.')
    if (p.data.email) {
      const taken = (await listFaculty()).some(f => f.id !== me.id && f.email && f.email.toLowerCase() === p.data.email)
      if (taken) return fail(res, 409, 'EMAIL_TAKEN', 'That email is already used by another teacher.')
    }
    await upsertFaculty({
      ...me,
      ...(p.data.email !== undefined && { email: p.data.email || null }),
      ...(p.data.phone !== undefined && { phone: p.data.phone || null }),
    })
    saveLocalDb()
    const after = await getFaculty(me.id)
    res.json({ email: after?.email ?? null, phone: after?.phone ?? null })
  } catch (err) { next(err) }
})

// ───────────────────────── HOD mail ─────────────────────────
teacherExtrasRouter.get('/hod/mail/status', requireAuth, requireRole('HOD'), (_req, res) => res.json(mailStatus()))

// POST /hod/mail/check -> tries the mail login without sending anything
teacherExtrasRouter.post('/hod/mail/check', requireAuth, requireRole('HOD'), async (_req, res) => res.json(await verifyMail()))

teacherExtrasRouter.get('/hod/mail/log', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try { res.json(await listMailLog(req.query.facultyId ? String(req.query.facultyId) : undefined)) } catch (err) { next(err) }
})

const draftBody = z.object({ facultyId: z.string().min(1), prompt: z.string().trim().min(3).max(1200) })

/** Plain fallback when no language model is available: the HOD's words in a proper letter. */
function templateDraft(name: string, hodName: string, prompt: string) {
  const sentence = prompt.replace(/\s+/g, ' ').trim()
  const cap = sentence.charAt(0).toUpperCase() + sentence.slice(1)
  const subject = cap.length > 60 ? `${cap.slice(0, 57).trimEnd()}…` : cap.replace(/[.!?]+$/, '')
  return {
    subject,
    body: `Dear ${name},\n\n${cap}${/[.!?]$/.test(cap) ? '' : '.'}\n\nRegards,\n${hodName}\nHead of Department, AI & DS\nPanimalar Engineering College`,
  }
}

teacherExtrasRouter.post('/hod/mail/draft', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const p = draftBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', 'Tell the assistant what the mail should say (a few words is enough).')
    const teacher = await getFaculty(p.data.facultyId)
    if (!teacher) return fail(res, 404, 'NOT_FOUND', 'Teacher not found.')
    const hod = await getFaculty(req.auth!.facultyId)
    const hodName = hod?.name ?? 'Head of Department'

    const reply = await callLlm([
      {
        role: 'system',
        content:
          'You write short, warm, professional emails from the Head of Department of AI & DS, Panimalar Engineering College, to one faculty member. ' +
          'Reply with ONLY a JSON object {"subject": string, "body": string}. The body is plain text: start with "Dear <name>,", at most 120 words, and end with "Regards," then the HOD name and "Head of Department, AI & DS". ' +
          'Use only facts given in the request. Never invent dates, numbers, awards or promises. Never write a password or login details; those are added separately.',
      },
      { role: 'user', content: `Recipient: ${teacher.name}${teacher.designation ? ` (${teacher.designation})` : ''}\nSender (HOD): ${hodName}\nWhat the mail should say: ${p.data.prompt}` },
    ])
    if (reply) {
      try {
        const json = JSON.parse(reply.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
        if (typeof json?.subject === 'string' && typeof json?.body === 'string' && json.body.trim()) {
          return res.json({ subject: json.subject.trim().slice(0, 150), body: json.body.trim(), source: 'ai' })
        }
      } catch { /* fall through to the plain draft */ }
    }
    res.json({ ...templateDraft(teacher.name, hodName, p.data.prompt), source: 'template' })
  } catch (err) { next(err) }
})

const sendBody = z.object({
  facultyId: z.string().min(1),
  subject: z.string().trim().min(1, 'Add a subject line.').max(150),
  body: z.string().trim().min(1, 'The message is empty.').max(5000),
  credentials: z.enum(['none', 'id', 'new']).default('none'),
})

teacherExtrasRouter.post('/hod/mail/send', requireAuth, requireRole('HOD'), async (req, res, next) => {
  try {
    const p = sendBody.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'INVALID_INPUT', p.error.issues[0]?.message ?? 'Invalid mail.')
    const { facultyId, subject, body, credentials } = p.data
    const teacher = await getFaculty(facultyId)
    if (!teacher) return fail(res, 404, 'NOT_FOUND', 'Teacher not found.')
    if (!teacher.email) return fail(res, 400, 'NO_EMAIL', `${teacher.name} has no email address yet. Add one on the Teachers page first.`)

    let text = body
    let newPassword: string | null = null
    if (credentials === 'id') {
      text += `\n\n— Your SCEDULAR login —\nLogin ID: ${teacher.id}\n(Your password is unchanged.)`
    } else if (credentials === 'new') {
      newPassword = generatePassword()
      text += `\n\n— Your SCEDULAR login —\nLogin ID: ${teacher.id}\nNew password: ${newPassword}\n(This replaces your old password.)`
    }

    try {
      await sendMail({ to: teacher.email, subject, text })
    } catch (err) {
      if (err instanceof MailError) return fail(res, err.code === 'MAIL_NOT_CONFIGURED' ? 503 : 502, err.code, err.message)
      throw err
    }
    // The password only changes once the mail has really gone out, so a failed send can never lock a teacher out.
    if (newPassword) await setFacultyPassword(teacher.id, newPassword)
    await addMailLog({ facultyId: teacher.id, to: teacher.email, subject, credentials, sentBy: req.auth!.facultyId })
    res.json({ sent: true, to: teacher.email, credentials })
  } catch (err) { next(err) }
})

/** Test/demo helper: the mails captured while MAIL_TRANSPORT=json. */
teacherExtrasRouter.get('/hod/mail/outbox', requireAuth, requireRole('HOD'), (_req, res) => {
  if (process.env.MAIL_TRANSPORT !== 'json') return fail(res, 404, 'NOT_AVAILABLE', 'The outbox is only kept in demo mode.')
  res.json(capturedMail)
})
