import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
const call = async (path: string, token: string, method = 'GET', body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: await r.json().catch(() => ({})) as any }
}
beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('the two erase actions (Settings -> Dataset)', () => {
  it('erases preferences only, or the allocation only, and never teachers, sections or the syllabus', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const db = getLocalDb()
    const login = async (id: string, pw: string) => (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: id, password: pw }) })).json() as any).token as string
    const hod = await login('FAC-001', 'SCEDULAR_AIDS')
    const t = (await listFaculty()).find(f => f.role !== 'HOD')!
    await setFacultyPassword(t.id, 'Teacher-pass-1')
    const teacher = await login(t.id, 'Teacher-pass-1')

    const keep = { faculty: db.faculty.length, sections: db.sections.length, subjects: db.subjects.length, offerings: db.sectionSubjects.length }
    const prefs = db.facultyPreferences.length, tas = db.teachingAssignments.length
    expect(prefs).toBeGreaterThan(0); expect(tas).toBeGreaterThan(0)

    // guards
    expect((await call('/api/hod/erase/summary', teacher)).status).toBe(403)
    expect((await call('/api/hod/erase/allocation', hod, 'POST', { password: 'wrong' })).status).toBe(403)
    expect(db.teachingAssignments.length).toBe(tas)
    const sum = (await call('/api/hod/erase/summary', hod)).body
    expect(sum).toMatchObject({ preferences: prefs, teachingAssignments: tas })

    // allocation only: preferences stay
    const a = await call('/api/hod/erase/allocation', hod, 'POST', { password: 'SCEDULAR_AIDS' })
    expect(a.status).toBe(200)
    expect(db.teachingAssignments.length).toBe(0)
    expect(db.generationRuns.length).toBe(0)
    expect(db.assignments.length).toBe(0)
    expect(db.facultyPreferences.length).toBe(prefs)

    // preferences only
    const p = await call('/api/hod/erase/preferences', hod, 'POST', { password: 'SCEDULAR_AIDS' })
    expect(p.status).toBe(200)
    expect(p.body.erasedPreferences).toBe(prefs)
    expect(db.facultyPreferences.length).toBe(0)

    // the master data is untouched
    expect({ faculty: db.faculty.length, sections: db.sections.length, subjects: db.subjects.length, offerings: db.sectionSubjects.length }).toEqual(keep)
  })

  it('no bulk-erase endpoints exist any more (not even for the HOD)', async () => {
    const hod = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json() as any).token as string
    for (const path of ['/api/reset-workflow', '/api/setup/reset-blank', '/api/import/master/reset', '/api/hod/reset-allocation-cycle']) {
      expect((await call(path, hod, 'POST', { password: 'SCEDULAR_AIDS', confirm: 'ERASE' })).status).toBe(404)
    }
  })
})
