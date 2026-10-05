import type { Request } from 'express'
import { createSessionRecord, getSessionFacultyId as repoGetSessionFacultyId, destroySessionRecord } from '../db/repo.js'

// Sessions are persisted (local JSON file or Postgres, via db/repo.ts) rather
// than kept in an in-memory Map, so logins survive a backend restart. A
// session only records WHICH faculty id authenticated; the authoritative
// role is always re-read from the faculty table (the database is the
// identity source), never cached here.

export async function createSession(facultyId: string): Promise<string> {
  const record = await createSessionRecord(facultyId)
  return record.token
}

export async function getSessionFacultyId(token?: string | null): Promise<string | null> {
  return repoGetSessionFacultyId(token)
}

export async function destroySession(token?: string | null): Promise<void> {
  await destroySessionRecord(token)
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}
