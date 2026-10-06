import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
const login = async (facultyId: string, password: string) =>
  (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId, password }) })).json() as any).token as string
const get = (path: string, token?: string) => fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('faculty and master timetable PDFs', () => {
  it('a teacher downloads only their own timetable; the HOD any', async () => {
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const teachers = (await listFaculty()).filter(f => f.role !== 'HOD')
    await setFacultyPassword(teachers[0].id, 'Teacher-pass-1')
    const t = await login(teachers[0].id, 'Teacher-pass-1')
    const hod = await login('FAC-001', 'SCEDULAR_AIDS')

    expect((await get(`/api/timetable/export/faculty/${teachers[0].id}`)).status).toBe(401)
    const own = await get(`/api/timetable/export/faculty/${teachers[0].id}`, t)
    expect(own.status).toBe(200)
    expect(own.headers.get('content-type')).toContain('application/pdf')
    expect(Buffer.from(await own.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF')
    expect((await get(`/api/timetable/export/faculty/${teachers[1].id}`, t)).status).toBe(403)
    expect((await get(`/api/timetable/export/faculty/${teachers[1].id}`, hod)).status).toBe(200)
  })

  it('the master timetable is HOD only and covers every semester', async () => {
    const hod = await login('FAC-001', 'SCEDULAR_AIDS')
    expect((await get('/api/timetable/export/master?semester=all')).status).toBe(401)
    const r = await get('/api/timetable/export/master?semester=all', hod)
    expect(r.status).toBe(200)
    const buf = Buffer.from(await r.arrayBuffer())
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')
    expect(buf.length).toBeGreaterThan(20_000)
  })
})

describe('lab and all-teacher timetable PDFs', () => {
  const pdf = async (r: Response) => Buffer.from(await r.arrayBuffer())
  it('lab-room timetables: one room or all, for any signed-in user', async () => {
    const hod = await login('FAC-001', 'SCEDULAR_AIDS')
    expect((await get('/api/timetable/export/labs?lab=all')).status).toBe(401)
    const all = await get('/api/timetable/export/labs?lab=all', hod)
    expect(all.status).toBe(200)
    expect(all.headers.get('content-type')).toContain('application/pdf')
    const buf = await pdf(all)
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')
    const { getLocalDb } = await import('../src/db/localDb.js')
    const usedLab = getLocalDb().assignments.find(a => a.labId)?.labId
    if (usedLab) expect((await get(`/api/timetable/export/labs?lab=${usedLab}`, hod)).status).toBe(200)
    expect((await get('/api/timetable/export/labs?lab=NOPE', hod)).status).toBe(400)
  })

  it('all teachers in one file is HOD only', async () => {
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const t = (await listFaculty()).find(f => f.role !== 'HOD')!
    await setFacultyPassword(t.id, 'Teacher-pass-2')
    const tok = await login(t.id, 'Teacher-pass-2')
    const hod = await login('FAC-001', 'SCEDULAR_AIDS')
    expect((await get('/api/timetable/export/faculty-all?semester=all', tok)).status).toBe(403)
    const r = await get('/api/timetable/export/faculty-all?semester=all', hod)
    expect(r.status).toBe(200)
    expect((await pdf(r)).subarray(0, 4).toString()).toBe('%PDF')
  })
})
