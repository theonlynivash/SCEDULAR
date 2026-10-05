import { getFaculty } from '../db/repo.js'
import { sendMail } from './mailer.js'

export type PasswordEvent = 'reset' | 'issued' | 'created' | 'set-by-hod'

const WHAT: Record<PasswordEvent, string> = {
  reset: 'Your SCEDULAR password was just changed using "Forgot password".',
  issued: 'The HOD has issued you a new SCEDULAR password. They will hand it to you separately.',
  'set-by-hod': 'The HOD has set a new password on your SCEDULAR account. They will tell you what it is.',
  created: 'A SCEDULAR login has been created for you. The HOD will hand you your password separately.',
}

/**
 * Tell a teacher by email that their password changed (never includes the password itself).
 * Best effort: a mail problem must not undo or block the password change, so errors are only logged.
 */
export async function notifyPasswordChanged(facultyId: string, event: PasswordEvent): Promise<boolean> {
  try {
    const f = await getFaculty(facultyId)
    if (!f?.email) return false
    const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short', hour12: true })
    await sendMail({
      to: f.email,
      subject: 'Your SCEDULAR password was changed',
      text: `Hello ${f.name},\n\n${WHAT[event]}\n\nLogin ID: ${f.id}\nTime: ${when} (IST)\n\nIf you did not expect this, please contact the HOD right away.\n\n— SCEDULAR`,
    })
    return true
  } catch (err) {
    console.warn('[mail] password-change notice failed:', (err as Error)?.message)
    return false
  }
}
