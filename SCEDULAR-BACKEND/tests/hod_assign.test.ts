import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { app } from '../src/app.js'
import { getLocalDb, saveLocalDbSync } from '../src/db/localDb.js'
import { setCurrentAcademicCycle } from '../src/db/repo.js'
import type { Server } from 'node:http'

let server: Server
let baseUrl: string
const PASSWORD = 'SCEDULAR_AIDS'
const HOD = 'FAC-001'
const T1 = 'FAC-010'
const T2 = 'FAC-011'
let token = ''

beforeAll(async () => {
  await new Promise<void>(r => { server = app.listen(0, () => { baseUrl = `http://localhost:${(server.address() as any).port}`; r() }) })
  await setCurrentAcademicCycle('ODD')
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facultyId: HOD, password: PASSWORD }) })
  token = ((await res.json()) as any).token
})
afterAll(async () => { await new Promise<void>(r => server.close(() => r())) })

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}
const post = (p: string, b: any) => call(p, { method: 'POST', body: JSON.stringify(b) })

describe('HOD subject -> teacher -> sections assignment', () => {
  // Sem VII is fully staffed in the shipped data, so each test frees one subject first
  // and puts the original teachers back afterwards.
  let subjectId = ''
  let perSection = { theory: 0, lab: 0 }
  let original: { facultyId: string; sectionIds: string[] }[] = []

  beforeAll(async () => {
    const board = await call('/api/hod/assign-board?semester=VII')
    expect(board.status).toBe(200)
    const sub = board.body.subjects.find((s: any) => s.perSection.theory > 0 && s.perSection.lab > 0 && s.sectionCount >= 3)
    expect(sub).toBeDefined()
    subjectId = sub.subjectId
    perSection = sub.perSection
    original = sub.teachers.map((t: any) => ({ facultyId: t.facultyId, sectionIds: t.sectionIds }))
    for (const t of original) await post('/api/hod/unassign', { subjectId, facultyId: t.facultyId })
  })

  afterAll(async () => {
    await post('/api/hod/unassign', { subjectId, facultyId: T1 })
    await post('/api/hod/unassign', { subjectId, facultyId: T2 })
    for (const t of original) await post('/api/hod/assign', { semester: 'VII', subjectId, facultyId: t.facultyId, sectionIds: t.sectionIds, override: true })
  })

  it('splits an integrated subject between two teachers, theory+lab together, with remaining count', async () => {
    const open = db().teachingAssignments.length

    const a = await post('/api/hod/assign', { semester: 'VII', subjectId, facultyId: T1, sectionCount: 2, override: true })
    expect(a.status).toBe(201)
    expect(a.body.addedPeriods).toBe(2 * (perSection.theory + perSection.lab))
    expect(db().teachingAssignments.length).toBe(open + 4) // 2 sections x (theory + lab)

    const b = await post('/api/hod/assign', { semester: 'VII', subjectId, facultyId: T2, sectionCount: 1, override: true })
    expect(b.status).toBe(201)
    expect(b.body.assignedSectionIds.some((s: string) => a.body.assignedSectionIds.includes(s))).toBe(false)

    const after = (await call('/api/hod/assign-board?semester=VII')).body.subjects.find((s: any) => s.subjectId === subjectId)
    expect(after.assignedCount).toBe(3)
    expect(after.teachers.map((t: any) => t.sectionIds.length).sort()).toEqual([1, 2])

    const tooMany = await post('/api/hod/assign', { semester: 'VII', subjectId, facultyId: T2, sectionCount: after.sectionCount, override: true })
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.error).toBe('NOT_ENOUGH_SECTIONS')

    const un = await post('/api/hod/unassign', { subjectId, facultyId: T1 })
    expect(un.body.removed).toBe(4)
    await post('/api/hod/unassign', { subjectId, facultyId: T2 })
    expect(db().teachingAssignments.length).toBe(open)
  })

  it('auto-assign: previews, then splits open sections among the teachers who chose the subject', async () => {
    const before = db().teachingAssignments.length
    const dry = await post('/api/hod/auto-assign', { semester: 'VII', subjectId, dryRun: true })
    expect(dry.status).toBe(200)
    expect(dry.body.dryRun).toBe(true)
    expect(db().teachingAssignments.length).toBe(before) // preview writes nothing
    const wanted = original.reduce((n, t) => n + t.sectionIds.length, 0)
    expect(dry.body.assignedSections + dry.body.leftover.reduce((n: number, l: any) => n + l.remaining, 0)).toBe(wanted)
    expect(dry.body.plan.every((x: any) => x.loadAfter <= x.max)).toBe(true)

    const run = await post('/api/hod/auto-assign', { semester: 'VII', subjectId })
    expect(run.body.assignedSections).toBe(dry.body.assignedSections)
    for (const x of run.body.plan) await post('/api/hod/unassign', { subjectId, facultyId: x.facultyId })
    expect(db().teachingAssignments.length).toBe(before)
  })

  it('blocks assignment beyond the faculty weekly capacity unless overridden', async () => {
    // the weekly cap is now a department policy (Settings -> Policy & cycle -> staffing weightage), 22 by default
    const saved = db().allocationSettings
    db().allocationSettings = { ...(saved ?? {}), maxWeeklyPeriods: 1 } as any
    saveLocalDbSync()
    const r = await post('/api/hod/assign', { semester: 'VII', subjectId, facultyId: T1, sectionCount: 1 })
    db().allocationSettings = saved
    saveLocalDbSync()
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('FACULTY_CAPACITY_EXCEEDED')
  })

  it('HOD can change and remove any preference, including approved ones', async () => {
    const { getFacultyPreferences, saveFacultyPreferences } = await import('../src/db/repo.js')
    const subs = db().subjects.filter((x: any) => x.semester === 'VII')
    expect(subs.length).toBeGreaterThan(2)
    const existing = (await getFacultyPreferences('FAC-010')).filter((p: any) => p.status === 'APPROVED')
    const pref = existing[0]
    expect(pref).toBeDefined() // seeded as approved from the current allocation

    const other = subs.find((x: any) => x.id !== pref.subjectId && !existing.some((p: any) => p.subjectId === x.id))!
    const changed = await post(`/api/hod/preferences/${pref.id}/change`, { subjectId: other.id })
    expect(changed.status).toBe(200)
    expect(changed.body.preference.subjectId).toBe(other.id)
    expect(changed.body.preference.status).toBe('APPROVED') // approval is kept
    const dup = await post(`/api/hod/preferences/${pref.id}/change`, { subjectId: other.id })
    expect(dup.status).toBe(200) // changing to its own subject is a no-op, not a duplicate
    const wrongCycle = await post(`/api/hod/preferences/${pref.id}/change`, { subjectId: db().subjects.find((x: any) => x.semester === 'IV').id })
    expect(wrongCycle.status).toBe(400)

    const del = await call(`/api/hod/preferences/${pref.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)
    expect((await getFacultyPreferences('FAC-010')).some((p: any) => p.id === pref.id)).toBe(false)
    expect((await call(`/api/hod/preferences/${pref.id}`, { method: 'DELETE' })).status).toBe(404)
    void saveFacultyPreferences
  })

  it('rejects a semester outside the current cycle', async () => {
    const r = await call('/api/hod/assign-board?semester=IV')
    expect(r.status).toBe(400)
  })
})
function db() { return getLocalDb() }
