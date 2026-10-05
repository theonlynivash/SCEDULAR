import nodemailer from 'nodemailer'

export type MailMode = 'smtp' | 'json' | 'fail' | 'off'

/** json = capture messages in memory (tests/demo), fail = always fail (tests), smtp = real delivery, off = not configured. */
export function mailMode(): MailMode {
  const t = process.env.MAIL_TRANSPORT
  if (t === 'json' || t === 'fail') return t
  return process.env.SMTP_USER && process.env.SMTP_PASS ? 'smtp' : 'off'
}

export function mailStatus() {
  const mode = mailMode()
  return {
    configured: mode !== 'off',
    mode,
    from: mode === 'smtp' ? fromAddress() : mode === 'json' ? 'captured in memory (no real delivery)' : null,
  }
}

function fromAddress(): string {
  return process.env.MAIL_FROM || `SCEDULAR <${process.env.SMTP_USER}>`
}

/** Messages captured while MAIL_TRANSPORT=json (for tests and demos). */
export const capturedMail: { to: string; subject: string; text: string }[] = []

export class MailError extends Error {
  constructor(public code: 'MAIL_NOT_CONFIGURED' | 'MAIL_SEND_FAILED', message: string) { super(message) }
}

/** Google shows app passwords as four groups of four; the spaces are not part of the password. */
const smtpPass = () => (process.env.SMTP_PASS ?? '').replace(/\s+/g, '')

function transport() {
  const port = Number(process.env.SMTP_PORT) || 465
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user: process.env.SMTP_USER, pass: smtpPass() },
  })
}

/** A plain-language reason for the failures people actually hit with Gmail. */
function explain(err: any): string {
  const code = err?.responseCode ?? err?.code
  if (code === 535 || code === 'EAUTH') {
    return 'Google rejected the login. Check that SMTP_USER is the full Gmail address and SMTP_PASS is a 16-letter App Password (Google Account → Security → 2-Step Verification → App passwords), not the normal Gmail password. If the app password was deleted, create a new one.'
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET') return 'Could not reach the mail server. Check the internet connection and SMTP_HOST / SMTP_PORT.'
  return err?.message || 'unknown error'
}

/** Logs in to the mail server without sending anything. */
export async function verifyMail(): Promise<{ ok: boolean; message: string }> {
  const mode = mailMode()
  if (mode === 'off') return { ok: false, message: 'Mail is not set up. Add SMTP_USER and SMTP_PASS to the backend .env file.' }
  if (mode === 'json') return { ok: true, message: 'Demo mode: messages are captured in memory, nothing is delivered.' }
  if (mode === 'fail') return { ok: false, message: 'Test mode: sending is set to fail.' }
  try { await transport().verify(); return { ok: true, message: `Logged in to the mail server as ${process.env.SMTP_USER}. Sending works.` } }
  catch (err) { return { ok: false, message: explain(err) } }
}

export async function sendMail(msg: { to: string; subject: string; text: string }): Promise<void> {
  const mode = mailMode()
  const subject = msg.subject.replace(/[\r\n]+/g, ' ').trim()
  if (mode === 'off') {
    throw new MailError('MAIL_NOT_CONFIGURED', 'Mail is not set up on the server. Add SMTP_USER and SMTP_PASS (a Gmail app password) to the backend .env file.')
  }
  if (mode === 'fail') throw new MailError('MAIL_SEND_FAILED', 'The mail server refused the message.')
  if (mode === 'json') {
    capturedMail.push({ to: msg.to, subject, text: msg.text })
    return
  }
  try {
    await transport().sendMail({ from: fromAddress(), to: msg.to, subject, text: msg.text })
  } catch (err: any) {
    throw new MailError('MAIL_SEND_FAILED', `The mail could not be sent. ${explain(err)}`)
  }
}
