import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { app } from '../src/app.js'
import { getLocalDb, saveLocalDbSync } from '../src/db/localDb.js'
import type { Server } from 'node:http'

let server: Server
let baseUrl: string

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') baseUrl = `http://localhost:${addr.port}`
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (server) server.close(() => resolve())
    else resolve()
  })
})

const PASSWORD = 'SCEDULAR_AIDS'

async function login(facultyId: string, password: string = PASSWORD) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ facultyId, password }),
  })
  const body: any = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function authed(path: string, token: string | null, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  const body: any = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

describe('Phase 2 — Authentication, Session, Role Authorization, Faculty Profile', () => {
  it('A: FAC-001 + password authenticates as HOD with a session token', async () => {
    const { status, body } = await login('FAC-001')
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(0)
    expect(body.user.facultyId).toBe('FAC-001')
    expect(body.user.role).toBe('HOD')
    expect(body.user.name).toBe('Dr.S.MALATHI')
  })

  it('B: FAC-002 + password authenticates as FACULTY', async () => {
    const { status, body } = await login('FAC-002')
    expect(status).toBe(200)
    expect(body.user.facultyId).toBe('FAC-002')
    expect(body.user.role).toBe('FACULTY')
  })

  it('C: FAC-058 + password authenticates', async () => {
    const { status, body } = await login('FAC-058')
    expect(status).toBe(200)
    expect(body.user.facultyId).toBe('FAC-058')
  })

  it('D: wrong password is rejected with 401', async () => {
    const { status, body } = await login('FAC-001', 'definitely_wrong')
    expect(status).toBe(401)
    expect(body.error).toBe('AUTHENTICATION_FAILED')
  })

  it('E: unknown faculty id is rejected with 401', async () => {
    const { status, body } = await login('FAC-999')
    expect(status).toBe(401)
    expect(body.error).toBe('AUTHENTICATION_FAILED')
  })

  it('empty credentials produce a 400 validation error (not a silent login)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facultyId: '', password: '' }),
    })
    const body: any = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('VALIDATION_ERROR')
  })

  it('an arbitrary non-empty password is never accepted', async () => {
    const { status } = await login('FAC-002', 'anything')
    expect(status).toBe(401)
  })

  it('F: a FACULTY session is forbidden from HOD endpoints (403)', async () => {
    const { body } = await login('FAC-002')
    const res = await authed('/api/hod/preferences', body.token)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('G: an HOD session is allowed on HOD endpoints (200)', async () => {
    const { body } = await login('FAC-001')
    const res = await authed('/api/hod/preferences', body.token)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.preferences)).toBe(true)
  })

  it('HOD endpoints reject requests with no/invalid session (401)', async () => {
    const noToken = await authed('/api/hod/preferences', null)
    expect(noToken.status).toBe(401)
    const badToken = await authed('/api/hod/preferences', 'not-a-real-token')
    expect(badToken.status).toBe(401)
  })

  it('H: /auth/me resolves the session identity, and logout invalidates it', async () => {
    const { body } = await login('FAC-002')
    const token = body.token

    const me = await authed('/api/auth/me', token)
    expect(me.status).toBe(200)
    expect(me.body.facultyId).toBe('FAC-002')
    expect(me.body.role).toBe('FACULTY')

    const logout = await authed('/api/auth/logout', token, { method: 'POST' })
    expect(logout.status).toBe(200)
    expect(logout.body.success).toBe(true)

    const afterLogout = await authed('/api/auth/me', token)
    expect(afterLogout.status).toBe(401)

    const hodAfterLogout = await authed('/api/hod/preferences', token)
    expect(hodAfterLogout.status).toBe(401)
  })

  it('role is read from the database, not hardcoded per id', async () => {
    const db = getLocalDb()
    const f1 = db.faculty.find(f => f.id === 'FAC-001')
    const f2 = db.faculty.find(f => f.id === 'FAC-002')
    expect(f1?.role).toBe('HOD')
    expect(f2?.role).toBe('FACULTY')

    const l1 = await login('FAC-001')
    const l2 = await login('FAC-002')
    expect(l1.body.user.role).toBe(f1?.role)
    expect(l2.body.user.role).toBe(f2?.role)
  })

  it('profile retrieval returns database values', async () => {
    const res = await authed('/api/faculty/FAC-002', null)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('FAC-002')
    expect(res.body.name).toBe('Dr.A.JOSHI')
    expect(res.body.department).toBe('AI & DS')
    expect(res.body.role).toBe('FACULTY')
  })

  it('experience update persists each concept separately (self-service, authenticated as that faculty)', async () => {
    const session = await login('FAC-002')
    const token = session.body.token
    const update = await authed('/api/faculty/FAC-002/experience', token, {
      method: 'PATCH',
      body: JSON.stringify({ previousExperience: 5, currentExperience: 3, allocationExperience: 7 }),
    })
    expect(update.status).toBe(200)
    expect(update.body.previousExperience).toBe(5)
    expect(update.body.currentExperience).toBe(3)
    expect(update.body.allocationExperience).toBe(7)

    // Re-read through the API: database → API reflects persisted values.
    const reread = await authed('/api/faculty/FAC-002', null)
    expect(reread.body.previousExperience).toBe(5)
    expect(reread.body.currentExperience).toBe(3)
    expect(reread.body.allocationExperience).toBe(7)

    // Allocation experience is independent — not inferred from designation.
    expect(reread.body.allocationExperience).not.toBe(reread.body.previousExperience)

    // Restore pristine seed state (these fields were unset originally).
    const db = getLocalDb()
    const f = db.faculty.find(x => x.id === 'FAC-002')
    if (f) {
      delete f.previousExperience
      delete f.currentExperience
      delete f.allocationExperience
    }
    saveLocalDbSync()
  })

  it('experience update rejects invalid input', async () => {
    const session = await login('FAC-002')
    const res = await authed('/api/faculty/FAC-002/experience', session.body.token, {
      method: 'PATCH',
      body: JSON.stringify({ previousExperience: -4 }),
    })
    expect(res.status).toBe(400)
  })

  it('experience update for an unknown faculty returns 403 (only self or HOD may edit)', async () => {
    const session = await login('FAC-002')
    const res = await authed('/api/faculty/FAC-999/experience', session.body.token, {
      method: 'PATCH',
      body: JSON.stringify({ previousExperience: 1 }),
    })
    expect(res.status).toBe(403)
  })

  it('a faculty member cannot edit another faculty member\'s experience', async () => {
    const session = await login('FAC-002')
    const res = await authed('/api/faculty/FAC-003/experience', session.body.token, {
      method: 'PATCH',
      body: JSON.stringify({ allocationExperience: 20 }),
    })
    expect(res.status).toBe(403)
  })

  it('the HOD can edit any faculty member\'s experience', async () => {
    const hod = await login('FAC-001')
    const res = await authed('/api/faculty/FAC-003/experience', hod.body.token, {
      method: 'PATCH',
      body: JSON.stringify({ allocationExperience: 11 }),
    })
    expect(res.status).toBe(200)
    expect(res.body.allocationExperience).toBe(11)

    // Restore pristine seed state.
    const db = getLocalDb()
    const f = db.faculty.find(x => x.id === 'FAC-003')
    if (f) delete f.allocationExperience
    saveLocalDbSync()
  })

  it('experience update without a session is rejected (401)', async () => {
    const res = await authed('/api/faculty/FAC-002/experience', null, {
      method: 'PATCH',
      body: JSON.stringify({ previousExperience: 1 }),
    })
    expect(res.status).toBe(401)
  })
})
