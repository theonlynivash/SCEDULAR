import type { Request, Response, NextFunction } from 'express'
import { getFaculty } from '../db/repo.js'
import { extractBearerToken, getSessionFacultyId } from './session.js'
import type { UserRole } from '../types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { facultyId: string; role: UserRole }
    }
  }
}

/**
 * Resolves the authenticated identity from the session token, then re-reads the
 * faculty record so the role always comes from the database — never from a
 * cached value or a hardcoded id.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req)
  const facultyId = await getSessionFacultyId(token)
  if (!facultyId) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'A valid session is required.' })
  }
  const faculty = await getFaculty(facultyId)
  if (!faculty) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Session references an unknown faculty member.' })
  }
  req.auth = { facultyId: faculty.id, role: faculty.role || 'FACULTY' }
  next()
}

/**
 * Role gate. Must run after requireAuth. Authorization is decided by the
 * authenticated user's database role, not by hiding UI affordances.
 */
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'A valid session is required.' })
    }
    if (req.auth.role !== role) {
      return res.status(403).json({ error: 'FORBIDDEN', message: `${role} role is required for this action.` })
    }
    next()
  }
}
