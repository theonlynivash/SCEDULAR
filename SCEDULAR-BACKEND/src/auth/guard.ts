import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { requireAuth, requireRole } from './middleware.js'

/** The only API calls that work without signing in. Everything else needs a valid session. */
const PUBLIC: Record<string, true> = {
  'GET /health': true,
  'POST /auth/login': true,
  'POST /auth/forgot': true,
  'POST /auth/reset': true,
  'POST /auth/logout': true,
}

/** Mounted on /api before every router: refuses anonymous requests (401) except the public list above. */
export const apiGuard: RequestHandler = (req, res, next) => {
  if (PUBLIC[`${req.method} ${req.path}`]) return next()
  return requireAuth(req, res, next)
}

const hodOnly = requireRole('HOD')

/**
 * For the older data routers (sections, subjects, labs, config, workload, import, timetable, faculty ...): any signed-in user
 * may READ (teachers need the lists to see timetables), but creating, changing or deleting is HOD only.
 * `selfServe` lists the few write paths a teacher may use (their own routes check who they are).
 */
export const hodWrites = (selfServe: RegExp[] = []): RequestHandler => (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  if (selfServe.some(rx => rx.test(`${req.method} ${req.path}`))) return next()
  return hodOnly(req, res, next)
}

/** Teachers see names, designations and timetable data, but not each other's email or phone. */
export function forRole<T extends { email?: string | null; phone?: string | null }>(f: T, role: string | undefined): T {
  return role === 'HOD' ? f : { ...f, email: null, phone: null }
}

/** Basic hardening headers for every API response. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
  next()
}
