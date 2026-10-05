import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { verifyFacultyPassword } from '../auth/passwords.js'
import { erasePreferences, eraseAllocation, eraseSummary } from '../db/repo.js'

/**
 * The only two "erase" actions SCEDULAR offers (Settings -> Dataset). Teachers, sections and the syllabus can never be
 * erased in bulk; they are changed one at a time from their own screens.
 */
export const dataEraseRouter = Router()

dataEraseRouter.use('/hod/erase', requireAuth, requireRole('HOD'))

// GET /api/hod/erase/summary -> what each action would remove
dataEraseRouter.get('/hod/erase/summary', async (_req, res, next) => {
  try { res.json(await eraseSummary()) } catch (err) { next(err) }
})

async function confirmed(req: any, res: any): Promise<boolean> {
  if (!(await verifyFacultyPassword(req.auth.facultyId, String(req.body?.password ?? '')))) {
    res.status(403).json({ error: 'WRONG_PASSWORD', message: 'Your password is incorrect. Nothing was erased.' })
    return false
  }
  return true
}

// POST /api/hod/erase/preferences { password } -> removes all teacher preferences (submitted or draft)
dataEraseRouter.post('/hod/erase/preferences', async (req, res, next) => {
  try {
    if (!(await confirmed(req, res))) return
    res.json({ success: true, erasedPreferences: await erasePreferences() })
  } catch (err) { next(err) }
})

// POST /api/hod/erase/allocation { password } -> removes assignments + generated timetables, keeps preferences
dataEraseRouter.post('/hod/erase/allocation', async (req, res, next) => {
  try {
    if (!(await confirmed(req, res))) return
    res.json({ success: true, erased: await eraseAllocation() })
  } catch (err) { next(err) }
})
