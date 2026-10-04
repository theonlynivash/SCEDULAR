import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = '', hod = ''
const J = () => ({ 'content-type': 'application/json', authorization: `Bearer ${hod}` })
const post = async (p: string, body: unknown) => { const r = await fetch(base + p, { method: 'POST', headers: J(), body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as any } }
const board = async () => await (await fetch(base + '/api/hod/assign-board?semester=VII', { headers: J() })).json() as any

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  hod = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json() as any).token
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('editable plan, change teacher and the teacher picker data', () => {
  it('applies a plan only when it covers exactly the open sections', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const db = getLocalDb()
    const b0 = await board()
    const subj = b0.subjects.find((s: any) => s.sectionCount >= 4)!
    const ssIds = new Set(db.sectionSubjects.filter((o: any) => o.subjectId === subj.subjectId).map((o: any) => o.id))
    db.teachingAssignments = db.teachingAssignments.filter((t: any) => !ssIds.has(t.sectionSubjectId))     // make every section of it open
    const n = subj.sectionCount
    const [a, b, c] = db.faculty.filter((f: any) => f.role !== 'HOD').slice(0, 3).map((f: any) => f.id)

    // board data for the picker: free / assigned teachers with preferences and remaining load
    const b1 = await board()
    const row = b1.teachers.find((t: any) => t.facultyId === a)
    expect(row).toMatchObject({ facultyId: a })
    expect(typeof row.remaining).toBe('number')
    expect(Array.isArray(row.assigned)).toBe(true)
    expect(Array.isArray(row.prefs)).toBe(true)
    expect(b1.teachers.some((t: any) => t.free === true) || b1.teachers.some((t: any) => t.free === false)).toBe(true)

    // too few / too many sections -> refused, nothing saved
    const before = db.teachingAssignments.length
    const few = await post('/api/hod/apply-plan', { semester: 'VII', subjectId: subj.subjectId, allocations: [{ facultyId: a, sectionCount: n - 1 }], override: true })
    expect(few.status).toBe(409); expect(few.body.error).toBe('PLAN_NOT_BALANCED'); expect(few.body.message).toMatch(/1 section/)
    const many = await post('/api/hod/apply-plan', { semester: 'VII', subjectId: subj.subjectId, allocations: [{ facultyId: a, sectionCount: n }, { facultyId: b, sectionCount: 1 }], override: true })
    expect(many.status).toBe(409); expect(many.body.message).toMatch(/1 section more/)
    expect(db.teachingAssignments.length).toBe(before)

    // an exactly balanced plan (HOD edited 3 + rest) is saved
    const ok = await post('/api/hod/apply-plan', { semester: 'VII', subjectId: subj.subjectId, allocations: [{ facultyId: a, sectionCount: 2 }, { facultyId: b, sectionCount: n - 2 }], override: true })
    expect(ok.status).toBe(201)
    const after = (await board()).subjects.find((s: any) => s.subjectId === subj.subjectId)
    expect(after.assignedCount).toBe(n)
    expect(after.teachers.map((t: any) => [t.facultyId, t.sectionIds.length]).sort()).toEqual([[a, 2], [b, n - 2]].sort())

    // "change teacher": move a's sections to c in one step
    const mv = await post('/api/hod/reassign', { subjectId: subj.subjectId, fromFacultyId: a, toFacultyId: c, override: true })
    expect(mv.status).toBe(200)
    const moved = (await board()).subjects.find((s: any) => s.subjectId === subj.subjectId)
    expect(moved.teachers.find((t: any) => t.facultyId === a)).toBeUndefined()
    expect(moved.teachers.find((t: any) => t.facultyId === c).sectionIds.length).toBe(2)
    expect((await post('/api/hod/reassign', { subjectId: subj.subjectId, fromFacultyId: a, toFacultyId: c })).status).toBe(404)
  })

  it('reports a teacher who would pass the weekly cap, in one message, unless overridden', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const db = getLocalDb()
    const b0 = await board()
    const subj = b0.subjects.find((s: any) => s.sectionCount >= 3)!
    const ssIds = new Set(db.sectionSubjects.filter((o: any) => o.subjectId === subj.subjectId).map((o: any) => o.id))
    db.teachingAssignments = db.teachingAssignments.filter((t: any) => !ssIds.has(t.sectionSubjectId))
    const a = db.faculty.find((f: any) => f.role !== 'HOD').id
    const saved = db.allocationSettings
    db.allocationSettings = { ...(saved ?? {}), maxWeeklyPeriods: 1 } as any
    try {
      const r = await post('/api/hod/apply-plan', { semester: 'VII', subjectId: subj.subjectId, allocations: [{ facultyId: a, sectionCount: subj.sectionCount }] })
      expect(r.status).toBe(409); expect(r.body.error).toBe('FACULTY_CAPACITY_EXCEEDED'); expect(r.body.over).toHaveLength(1)
    } finally { db.allocationSettings = saved }
  })
})
