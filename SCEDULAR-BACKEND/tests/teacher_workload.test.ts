import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = '', hod = ''
const get = (p: string, t: string) => fetch(base + p, { headers: { authorization: `Bearer ${t}` } })
beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  hod = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json() as any).token
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('Reports: full workload of each teacher', () => {
  it('lists subjects, sections, periods, class in-charge, preferences, results and the timetable load', async () => {
    const r = await (await get('/api/hod/teacher-workload', hod)).json() as any
    expect(r.cap).toBe(22)
    expect(r.teachers.length).toBeGreaterThan(10)
    const busy = r.teachers.filter((t: any) => t.load > 0)
    expect(busy.length).toBeGreaterThan(10)
    for (const t of busy) {
      expect(t.theoryPeriods + t.labPeriods).toBe(t.load)                                        // the parts add up to the load
      expect(t.subjects.reduce((n: number, s: any) => n + s.periods, 0)).toBe(t.load)
      expect(t.remaining).toBe(Math.max(0, t.max - t.load))
      for (const s of t.subjects) { expect(s.sections.length).toBeGreaterThan(0); expect(s.code).toBeTruthy(); expect(s.semester).toBeTruthy() }
      expect(t.sectionCount).toBe(new Set(t.subjects.flatMap((s: any) => s.sections)).size)
      if (t.timetable) expect(Object.values(t.timetable.byDay).reduce((a: number, b: any) => a + b, 0)).toBe(t.timetable.placedPeriods)
    }
    expect(r.teachers.some((t: any) => t.classIncharge.length > 0)).toBe(true)
    expect(r.teachers.some((t: any) => t.preferences.length > 0)).toBe(true)
  })

  it('is HOD only', async () => {
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const t = (await listFaculty()).find(f => f.role !== 'HOD')!
    await setFacultyPassword(t.id, 'Teacher-pass-1')
    const tok = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: t.id, password: 'Teacher-pass-1' }) })).json() as any).token
    expect((await get('/api/hod/teacher-workload', tok)).status).toBe(403)
    expect((await fetch(base + '/api/hod/teacher-workload')).status).toBe(401)
  })
})
