import { Router } from 'express'
import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { listFaculty } from '../db/repo.js'
import { setFacultyPassword } from '../auth/passwords.js'
import { sendMail } from '../mail/mailer.js'
import { notifyPasswordChanged } from '../mail/notify.js'

export const passwordResetRouter = Router()

const TTL_MS = 15 * 60_000
const MAX_ATTEMPTS = 5
const MIN_GAP_MS = 60_000

interface Pending { codeHash: string; expires: number; attempts: number; sentAt: number }
const pending = new Map<string, Pending>()

const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, (_m, a, b) => `${a}***${b}`)

// POST /api/auth/forgot { identifier } - mails a 6-digit code to the address on file for an approved teacher.
// The reply never says whether the account exists.
passwordResetRouter.post('/auth/forgot', async (req: Request, res: Response) => {
  const id = String(req.body?.identifier ?? req.body?.facultyId ?? '').trim().toLowerCase()
  if (!id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Enter your Faculty ID or email.' })
  const generic = { success: true, message: 'If that account has an email on file, a 6-digit code has been sent to it.' }

  const f = (await listFaculty()).find(x => x.id.toLowerCase() === id || (x.email && String(x.email).toLowerCase() === id))
  if (!f || !f.email) return res.json(generic)
  const prev = pending.get(f.id)
  if (prev && Date.now() - prev.sentAt < MIN_GAP_MS) return res.json(generic)

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  try {
    await sendMail({
      to: f.email,
      subject: 'SCEDULAR password reset code',
      text: `Hello ${f.name},\n\nYour SCEDULAR password reset code is ${code}. It is valid for 15 minutes.\nIf you did not ask for this, ignore this mail.\n\n— SCEDULAR`,
    })
  } catch (e: any) {
    return res.status(503).json({ error: 'MAIL_UNAVAILABLE', message: 'Could not send the email right now. Please ask the HOD to reset your password.' })
  }
  pending.set(f.id, { codeHash: await bcrypt.hash(code, 8), expires: Date.now() + TTL_MS, attempts: 0, sentAt: Date.now() })
  return res.json({ ...generic, sentTo: maskEmail(f.email) })
})

// POST /api/auth/reset { identifier, code, newPassword }
passwordResetRouter.post('/auth/reset', async (req: Request, res: Response) => {
  const id = String(req.body?.identifier ?? '').trim().toLowerCase()
  const code = String(req.body?.code ?? '').trim()
  const pw = String(req.body?.newPassword ?? '')
  const bad = () => res.status(400).json({ error: 'INVALID_CODE', message: 'That code is wrong or has expired.' })
  if (!id || !code) return bad()
  if (pw.length < 8) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters.' })

  const f = (await listFaculty()).find(x => x.id.toLowerCase() === id || (x.email && String(x.email).toLowerCase() === id))
  const p = f && pending.get(f.id)
  if (!f || !p || p.expires < Date.now() || p.attempts >= MAX_ATTEMPTS) { if (f) pending.delete(f.id); return bad() }
  p.attempts++
  if (!(await bcrypt.compare(code, p.codeHash))) return bad()
  pending.delete(f.id)
  await setFacultyPassword(f.id, pw)
  await notifyPasswordChanged(f.id, 'reset')
  return res.json({ success: true, message: 'Password changed. You can sign in now.' })
})
