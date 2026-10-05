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

describe('theory + lab listed twice become ONE subject (xT + yL) with one teacher per class and the lab\'s rooms', () => {
  let theoryId = '', labId = '', secA = '', rooms: string[] = []
  const put = async (p: string, b: unknown) => { const r = await fetch(base + p, { method: 'PUT', headers: J(), body: JSON.stringify(b) }); return { status: r.status, body: await r.json() as any } }

  it('builds a theory + lab pair, gives them different teachers and rooms', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const db = getLocalDb()
    rooms = db.labs.map((x: any) => x.id)
    secA = db.sections.find((s: any) => s.semester === 'III' && s.active !== false).id
    const t = await post('/api/setup/subjects', { code: 'ZZ9001', name: 'Zeta Systems', semester: 'III', deliveryType: 'THEORY', theoryPeriods: 4, labPeriods: 0, credits: 3 })
    const l = await post('/api/setup/subjects', { code: 'ZZ9002', name: 'Zeta Systems Laboratory', semester: 'III', deliveryType: 'LAB', theoryPeriods: 0, labPeriods: 3, credits: 2, labIds: [rooms[0]] })
    expect([t.status, l.status]).toEqual([201, 201]); theoryId = t.body.id; labId = l.body.id
    const [a, b] = db.faculty.filter((f: any) => f.role !== 'HOD').slice(0, 2).map((f: any) => f.id)
    const n = db.sectionSubjects.filter((o: any) => o.subjectId === theoryId).length
    expect((await post('/api/hod/assign', { semester: 'III', subjectId: theoryId, facultyId: a, sectionCount: n, override: true })).status).toBe(201)
    expect((await post('/api/hod/assign', { semester: 'III', subjectId: labId, facultyId: b, sectionCount: n, override: true })).status).toBe(201)
    // lab rooms: room 0 for every section, room 1 fixed for section A only; the theory subject has a stray room 2
    expect((await put(`/api/setup/subjects/${labId}/lab-rooms`, { rooms: [{ labId: rooms[0] }, { labId: rooms[1], sectionId: secA }] })).status).toBe(200)
    expect((await put(`/api/setup/subjects/${theoryId}/lab-rooms`, { rooms: [{ labId: rooms[2] }] })).status).toBe(200)
    expect((await put(`/api/setup/subjects/${labId}/lab-rooms`, { rooms: [{ labId: 'NOPE' }] })).status).toBe(400)
    const pair = (await get('/api/setup/subjects/merge-candidates')).find((x: any) => x.theoryId === theoryId)
    expect(pair).toMatchObject({ semester: 'III', theoryPeriods: 4, labPeriods: 3, labId })
  })

  it('merges: one INTEGRATED subject, same teacher for theory and lab of each class, the LAB subject\'s rooms', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const db = getLocalDb()
    const [a] = db.faculty.filter((f: any) => f.role !== 'HOD').slice(0, 1).map((f: any) => f.id)
    const r = await post('/api/setup/subjects/merge-lab', { theoryId, labId })
    expect(r.status).toBe(200)
    expect(db.subjects.find((s: any) => s.id === theoryId)).toMatchObject({ deliveryType: 'INTEGRATED', theoryPeriods: 4, labPeriods: 3, credits: 5 })
    expect(db.subjects.some((s: any) => s.id === labId)).toBe(false)
    const offs = db.sectionSubjects.filter((o: any) => o.subjectId === theoryId)
    expect(offs.length).toBeGreaterThan(1)
    expect(offs.every((o: any) => o.theoryPeriods === 4 && o.labPeriods === 3)).toBe(true)
    for (const o of offs) {
      const tas = db.teachingAssignments.filter((t: any) => t.sectionSubjectId === o.id)
      expect(tas.map((t: any) => `${t.component}:${t.facultyId}`).sort()).toEqual([`LAB:${a}`, `THEORY:${a}`])      // theory teacher takes both
    }
    // the combined subject uses exactly the rooms that were set for the lab subject (global AND the one fixed for a section)
    const mine = db.labMappings.filter((m: any) => m.subjectId === theoryId).map((m: any) => `${m.labId}|${m.sectionId ?? ''}`).sort()
    expect(mine).toEqual([`${rooms[0]}|`, `${rooms[1]}|${secA}`].sort())
    expect(db.labMappings.some((m: any) => m.subjectId === labId)).toBe(false)
    expect(db.generationRuns).toHaveLength(0)
    expect((await get('/api/setup/subjects/merge-candidates')).some((x: any) => x.theoryId === theoryId)).toBe(false)
    expect((await post('/api/setup/subjects/merge-lab', { theoryId, labId })).status).toBe(404)
  })
})
