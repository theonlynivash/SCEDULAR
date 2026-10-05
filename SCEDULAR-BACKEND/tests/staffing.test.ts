import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { computeStaffing, staffingPolicy, subjectQuota } from '../src/utils/staffing.js'

const fac = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `T${i + 1}`, name: `Teacher ${i + 1}`, role: 'FACULTY', designation: null, maxDailyPeriods: 6, maxWeeklyPeriods: 24 }) as any)
const world = (teachers: number) => {
  const sections = Array.from({ length: 12 }, (_, i) => ({ id: `S${i + 1}`, name: `S${i + 1}`, year: 'Year 2', semester: 'III', active: true }) as any)
  const subjects = ['A', 'B', 'C'].map(c => ({ id: c, code: c, name: `Subject ${c}`, semester: 'III', deliveryType: 'THEORY', category: 'CORE' }) as any)
  let id = 1
  const sectionSubjects = sections.flatMap((s: any) => subjects.map((sub: any) => ({ id: id++, sectionId: s.id, subjectId: sub.id, theoryPeriods: 4, labPeriods: 0, labBlockLength: null })))
  return { semesters: ['III'], faculty: fac(teachers), sections, subjects, sectionSubjects, teachingAssignments: [], preferences: [], policy: staffingPolicy() }
}

describe('weightage arithmetic', () => {
  it('a subject wants one teacher per ~3 sections', () => {
    expect(subjectQuota(10, 3)).toBe(4)        // maths: 10 sections x 4T = 40T -> 4 teachers
    expect(subjectQuota(12, 3)).toBe(4)
    expect(subjectQuota(3, 3)).toBe(1)
    expect(subjectQuota(1, 3)).toBe(1)
    expect(subjectQuota(0, 3)).toBe(0)
  })

  it('12 sections x 3 subjects x 4T = 144 periods; at 28 a week that needs 6 teachers', () => {
    const r = computeStaffing(world(12))
    expect(r.totalDemandPeriods).toBe(144)
    expect(r.teachersNeeded).toBe(6)
    expect(r.moreTeachersNeeded).toBe(0)
    expect(r.enough).toBe(true)
    expect(r.subjects.every(s => s.teachersWanted === 4)).toBe(true)   // 12 sections / 3 = 4 per subject = 12 teachers in all
  })

  it('shows "need more teachers" when the teachers cannot carry the demand', () => {
    const r = computeStaffing(world(4))          // 4 x 28 = 112 < 144
    expect(r.enough).toBe(false)
    expect(r.moreTeachersNeeded).toBe(2)         // 32 periods short -> 2 more teachers at 28
    expect(r.message).toMatch(/Need 2 more teachers/)
  })

  it('counts what is already assigned when asking for more teachers', () => {
    const w: any = world(5)                       // capacity 140, demand 144 -> short by 4 periods -> 1 more
    expect(computeStaffing(w).moreTeachersNeeded).toBe(1)
    w.teachingAssignments = w.sectionSubjects.slice(0, 7).map((o: any, i: number) => ({ id: i + 1, facultyId: 'T1', sectionSubjectId: o.id, component: 'THEORY', batch: null }))  // T1 now at 28
    const r = computeStaffing(w)
    expect(r.assignedPeriods).toBe(28)
    expect(r.openPeriods).toBe(116)
    expect(r.moreTeachersNeeded).toBe(1)          // free capacity 4 x 28 = 112 < 116
  })
})

describe('preferences are accepted only up to the subject quota', () => {
  let server: Server, base = ''
  beforeAll(async () => {
    const { app } = await import('../src/app.js')
    await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  })
  afterAll(() => new Promise<void>(res => server.close(() => res())))

  it('refuses a choice once the subject has all the teachers it needs', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const db = getLocalDb()
    const cycle = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json() as any).token
    void cycle
    // pick a Year-3 subject of the odd cycle (semester V) and compute its quota
    const sub = db.subjects.find((s: any) => s.semester === 'V' && s.year === 'Year 3')!
    const secIds = new Set(db.sections.filter((s: any) => s.active !== false && s.semester === 'V').map((s: any) => s.id))
    const n = db.sectionSubjects.filter((o: any) => o.subjectId === sub.id && secIds.has(o.sectionId)).length
    const quota = subjectQuota(n, 3)
    expect(quota).toBeGreaterThan(0)

    const teachers = db.faculty.filter((f: any) => f.role !== 'HOD')
    const me = teachers[teachers.length - 1]
    me.allocationExperience = 15
    const others = teachers.slice(0, quota)
    db.facultyPreferences = db.facultyPreferences.filter((p: any) => p.subjectId !== sub.id && p.facultyId !== me.id)
    let pid = Math.max(0, ...db.facultyPreferences.map((p: any) => p.id)) + 1
    for (const o of others) db.facultyPreferences.push({ id: pid++, facultyId: o.id, subjectId: sub.id, academicYear: 'Year 3', semester: 'V', preferenceRank: 1, requestedSections: 1, status: 'SUBMITTED', labConfirmed: true, submittedAt: new Date().toISOString() } as any)

    await setFacultyPassword(me.id, 'Teacher-pass-1')
    const tok = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: me.id, password: 'Teacher-pass-1' }) })).json() as any).token
    const submit = () => fetch(base + '/api/faculty/preferences/submit', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify({ items: [{ subjectId: sub.id, preferenceRank: 1 }] }) })

    const full = await submit()
    expect(full.status).toBe(409)
    expect(((await full.json()) as any).error).toBe('SUBJECT_QUOTA_FULL')

    // a slot frees up -> accepted
    db.facultyPreferences = db.facultyPreferences.filter((p: any) => !(p.subjectId === sub.id && p.facultyId === others[0].id))
    expect((await submit()).status).toBe(200)

    // the teacher-facing demand numbers show the slots
    const demand = await (await fetch(base + '/api/faculty/subject-demand?semester=V', { headers: { authorization: `Bearer ${tok}` } })).json() as any
    const row = demand.demand.find((d: any) => d.subjectId === sub.id)
    expect(row.teachersWanted).toBe(quota)
    expect(row.slotsLeft).toBe(0)
  })
})
