import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { getFacultyPasswordHash, upsertFacultyPasswordHash } from '../db/repo.js'

function resolveMasterPassword(): string {
  const v = process.env.SCEDULAR_MASTER_PASSWORD
  if (v && v.trim().length > 0) return v.trim()
  return 'SCEDULAR_AIDS'
}
export const MASTER_PASSWORD = resolveMasterPassword()

/**
 * A teacher with a personal password can only log in with it. The shared master password is only a
 * bootstrap for accounts that have not been given a login yet (e.g. the first HOD login).
 */
export async function verifyFacultyPassword(facultyId: string, plain: string): Promise<boolean> {
  const stored = await getFacultyPasswordHash(facultyId)   // a database error must surface (503/500), never read as "no password"
  if (stored) return bcrypt.compare(plain, stored)
  return plain === MASTER_PASSWORD
}

export async function hasPersonalPassword(facultyId: string): Promise<boolean> {
  return Boolean(await getFacultyPasswordHash(facultyId))
}

/** Readable one-time password, e.g. "kemu-4827" (no look-alike characters). */
export function generatePassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz'
  const pick = (n: number, set: string) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('')
  return `${pick(4, letters)}-${pick(4, '23456789')}`
}

export async function setFacultyPassword(facultyId: string, plain: string): Promise<void> {
  await upsertFacultyPasswordHash(facultyId, await bcrypt.hash(plain, 10))
}
