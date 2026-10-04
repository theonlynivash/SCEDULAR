import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = '', hod = ''
const J = () => ({ 'content-type': 'application/json', authorization: `Bearer ${hod}` })
const get = async (p: string) => (await fetch(base + p, { headers: J() })).json() as Promise<any>
const post = async (p: string, b: unknown) => { const r = await fetch(base + p, { method: 'POST', headers: J(), body: JSON.stringify(b) }); return { status: r.status, body: await r.json() as any } }
beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  hod = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json() as any).token
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('theory + lab listed twice become ONE subject (xT + yL) with one teacher per class', () => {
  it('finds the pairs, merges them, and the same teacher handles theory and lab of each class', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const db = getLocalDb()
    const pairs = await get('/api/setup/subjects/merge-candidates')
    expect(pairs.length).toBeGreaterThanOrEqual(3)                       // AIES, OOP, DBMS in Semester III
    const aies = pairs.find((x: any) => /Expert Systems/.test(x.theoryName))
    expect(aies).toMatchObject({ semester: 'III', theoryPeriods: 5, labPeriods: 3 })

    const sectionsBefore = db.sectionSubjects.filter((o: any) => o.subjectId === aies.theoryId).length
    const r = await post('/api/setup/subjects/merge-lab', { theoryId: aies.theoryId, labId: aies.labId })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ theoryPeriods: 5, labPeriods: 3 })

    const merged = db.subjects.find((s: any) => s.id === aies.theoryId)
    expect(merged).toMatchObject({ deliveryType: 'INTEGRATED', theoryPeriods: 5, labPeriods: 3 })
    expect(db.subjects.some((s: any) => s.id === aies.labId)).toBe(false)               // the separate lab subject is gone
    const offs = db.sectionSubjects.filter((o: any) => o.subjectId === aies.theoryId)
    expect(offs).toHaveLength(sectionsBefore)
    expect(offs.every((o: any) => o.theoryPeriods === 5 && o.labPeriods === 3)).toBe(true)
    // one teacher per class for both components
    for (const o of offs) {
      const tas = db.teachingAssignments.filter((t: any) => t.sectionSubjectId === o.id)
      const th = tas.find((t: any) => t.component === 'THEORY'), lb = tas.find((t: any) => t.component === 'LAB')
      expect(th && lb && th.facultyId === lb.facultyId).toBe(true)
    }
    expect(db.generationRuns).toHaveLength(0)                                            // the old timetable no longer matches
    expect((await get('/api/setup/subjects/merge-candidates')).some((x: any) => x.theoryId === aies.theoryId)).toBe(false)
    expect((await post('/api/setup/subjects/merge-lab', { theoryId: aies.theoryId, labId: aies.labId })).status).toBe(404)
  })

  it('after merging the other pairs, every offering is staffed and a clean timetable generates', async () => {
    for (const p of await get('/api/setup/subjects/merge-candidates')) expect((await post('/api/setup/subjects/merge-lab', { theoryId: p.theoryId, labId: p.labId })).status).toBe(200)
    const g = await post('/api/timetable/generate', {})
    expect(g.status).toBe(200)
    expect(g.body.status).toBe('GREEN')
    expect(g.body.conflicts).toHaveLength(0)
  }, 180_000)
})
