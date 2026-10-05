import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
const call = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
const login = async (id: string, pw: string) => ((await (await call('POST', '/api/auth/login', undefined, { facultyId: id, password: pw })).json()) as any).token as string

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

const READS = ['/api/faculty', '/api/faculty/FAC-001', '/api/sections', '/api/subjects', '/api/courses', '/api/labs', '/api/config', '/api/section-subjects', '/api/workload/requirements',
  '/api/timetable/master', '/api/timetable/section/Y2-A', '/api/timetable/export?semester=III', '/api/import/master/status', '/api/readiness', '/api/labs/subject-mapping']
const WRITES: [string, string][] = [['POST', '/api/timetable/generate'], ['POST', '/api/timetable/regenerate'], ['POST', '/api/sections'], ['POST', '/api/subjects'], ['POST', '/api/labs'],
  ['PUT', '/api/config'], ['POST', '/api/faculty'], ['POST', '/api/import/master/commit'], ['POST', '/api/workload/requirements'], ['DELETE', '/api/subjects/SUB-X'], ['POST', '/api/ai/explain-generation-failure']]

describe('nothing is reachable without signing in', () => {
  it('every data route answers 401 to an anonymous caller', async () => {
    for (const p of READS) expect((await call('GET', p)).status, `GET ${p}`).toBe(401)
    for (const [m, p] of WRITES) expect((await call(m, p, undefined, {})).status, `${m} ${p}`).toBe(401)
  })
  it('only health and the sign-in routes are public', async () => {
    expect((await call('GET', '/api/health')).status).toBe(200)
    expect((await call('POST', '/api/auth/login', undefined, { facultyId: 'x', password: 'y' })).status).toBe(401)   // reachable, just wrong
    expect((await call('POST', '/api/auth/forgot', undefined, { identifier: 'nobody' })).status).toBe(200)
  })
})

describe('teachers may read but not change department data', () => {
  it('a teacher gets 403 on every write and can still read lists', async () => {
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const t = (await listFaculty()).find(f => f.role !== 'HOD')!
    await setFacultyPassword(t.id, 'Teacher-pass-1')
    const teacher = await login(t.id, 'Teacher-pass-1')
    for (const [m, p] of WRITES.filter(([, p]) => !p.includes('explain-generation'))) expect((await call(m, p, teacher, {})).status, `${m} ${p}`).toBe(403)
    for (const p of ['/api/sections', '/api/subjects', '/api/labs', '/api/config', '/api/timetable/section/Y2-A']) expect((await call('GET', p, teacher)).status, `GET ${p}`).not.toBe(403)
    expect((await call('GET', '/api/sections', teacher)).status).toBe(200)
  })

  it('teachers do not see each other\'s email or phone; the HOD does', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const [a, b] = (await listFaculty()).filter(f => f.role !== 'HOD')
    getLocalDb().faculty.find((f: any) => f.id === b.id)!.email = 'private.person@example.com'
    getLocalDb().faculty.find((f: any) => f.id === b.id)!.phone = '9000000000'
    await setFacultyPassword(a.id, 'Teacher-pass-1')
    const teacher = await login(a.id, 'Teacher-pass-1'), hod = await login('FAC-001', 'SCEDULAR_AIDS')
    const asTeacher = await (await call('GET', '/api/faculty', teacher)).json() as any[]
    expect(JSON.stringify(asTeacher)).not.toContain('private.person@example.com')
    expect(asTeacher.every(f => !f.email && !f.phone)).toBe(true)
    const one = await (await call('GET', `/api/faculty/${b.id}`, teacher)).json() as any
    expect(one.email).toBeNull()
    const asHod = await (await call('GET', '/api/faculty', hod)).json() as any[]
    expect(asHod.find(f => f.id === b.id).email).toBe('private.person@example.com')
  })

  it('a teacher can still update their own experience but not another teacher\'s', async () => {
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const [a, b] = (await listFaculty()).filter(f => f.role !== 'HOD')
    await setFacultyPassword(a.id, 'Teacher-pass-1')
    const teacher = await login(a.id, 'Teacher-pass-1')
    expect((await call('PATCH', `/api/faculty/${a.id}/experience`, teacher, { previousExperience: 4 })).status).toBe(200)
    expect((await call('PATCH', `/api/faculty/${b.id}/experience`, teacher, { previousExperience: 4 })).status).toBe(403)
  })
})
