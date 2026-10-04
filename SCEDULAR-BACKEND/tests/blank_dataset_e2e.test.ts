/**
 * Proves the app runs end to end on data created INSIDE the app, with none of the PDF-derived seed data:
 * blank dataset -> sections -> syllabus -> teachers with logins -> preferences -> HOD approval ->
 * assignment -> readiness -> generated timetable. Uses its own database file.
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

const DB = path.join(os.tmpdir(), `scedular-blank-${process.pid}-${Date.now()}.json`)
process.env.SCEDULAR_DB_FILE = DB

let server: Server
let base = ''
let hod = ''

async function api(pathname: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${base}/api${pathname}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}
const post = (p: string, t: string, b: unknown) => api(p, t, { method: 'POST', body: JSON.stringify(b) })
const login = async (facultyId: string, password: string) => {
  const r = await post('/auth/login', '', { facultyId, password })
  return { status: r.status, token: r.body.token as string }
}

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(r => { server = app.listen(0, () => { base = `http://localhost:${(server.address() as any).port}`; r() }) })
  hod = (await login('FAC-001', 'SCEDULAR_AIDS')).token
  expect(hod).toBeTruthy()
})
afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()))
  for (const f of [DB, `${DB}.tmp`]) if (fs.existsSync(f)) fs.unlinkSync(f)
})

const SUBJECTS = [
  { code: 'T101', name: 'Data Structures', deliveryType: 'THEORY', theoryPeriods: 5, labPeriods: 0 },
  { code: 'T102', name: 'Operating Systems', deliveryType: 'THEORY', theoryPeriods: 4, labPeriods: 0 },
  { code: 'T103', name: 'Computer Networks', deliveryType: 'THEORY', theoryPeriods: 4, labPeriods: 0 },
  { code: 'I104', name: 'Databases', deliveryType: 'INTEGRATED', theoryPeriods: 4, labPeriods: 2 },
  { code: 'L105', name: 'Programming Lab', deliveryType: 'LAB', theoryPeriods: 0, labPeriods: 3 },
]
const created = { teachers: [] as { facultyId: string; password: string; token?: string }[], subjectIds: [] as string[] }

describe('blank dataset, everything built inside the app', () => {
  it('starts empty from a blank dataset (no bulk-erase endpoints exist)', async () => {
    // there is deliberately no HTTP endpoint that erases the dataset
    expect((await post('/setup/reset-blank', hod, { password: 'SCEDULAR_AIDS', confirm: 'ERASE' })).status).toBe(404)
    expect((await post('/import/master/reset', hod, {})).status).toBe(404)
    ;(await import('../src/db/localDb.js')).resetToBlankDb()
    expect((await api('/sections', hod)).body).toEqual([])
    expect((await api('/subjects', hod)).body).toEqual([])
    expect((await api('/faculty', hod)).body.map((f: any) => f.id)).toEqual(['FAC-001'])
    expect((await api('/labs', hod)).body.length).toBeGreaterThan(0) // lab rooms are kept
  })

  it('creates sections for the semester', async () => {
    const r = await post('/setup/sections', hod, { semester: 'III', count: 2 })
    expect(r.status).toBe(201)
    expect(r.body.created).toEqual(['Y2-A', 'Y2-B'])
    const more = await post('/setup/sections', hod, { semester: 'III', count: 1 })
    expect(more.body.created).toEqual(['Y2-C']) // continues the lettering
    await api('/setup/sections/Y2-C', hod, { method: 'DELETE' })
    expect((await api('/sections', hod)).body.map((s: any) => s.id)).toEqual(['Y2-A', 'Y2-B'])
  })

  it('adds the syllabus: validates, offers each subject to every section, rejects duplicates', async () => {
    expect((await post('/setup/subjects', hod, { ...SUBJECTS[0], semester: 'III', theoryPeriods: 0 })).status).toBe(400)
    expect((await post('/setup/subjects', hod, { ...SUBJECTS[3], semester: 'III', labPeriods: 0 })).status).toBe(400)
    const labs = (await api('/labs', hod)).body as any[]
    for (const s of SUBJECTS) {
      const r = await post('/setup/subjects', hod, { ...s, semester: 'III', labIds: s.labPeriods ? [labs[0].id] : [] })
      expect(r.status).toBe(201)
      created.subjectIds.push(r.body.id)
    }
    expect((await post('/setup/subjects', hod, { ...SUBJECTS[0], semester: 'III' })).status).toBe(409)
    const list = (await api('/setup/subjects', hod)).body as any[]
    expect(list).toHaveLength(5)
    expect(list.every(s => s.sectionIds.length === 2)).toBe(true)
    expect(list.find(s => s.code === 'L105').labIds).toEqual([labs[0].id])
  })

  it('adds teachers; each gets a generated ID and a one-time password that really logs in', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await post('/setup/faculty', hod, { name: `Teacher ${i + 1}`, allocationExperience: 12 })
      expect(r.status).toBe(201)
      expect(r.body.facultyId).toBe(`FAC-${String(i + 2).padStart(3, '0')}`)
      const l = await login(r.body.facultyId, r.body.password)
      expect(l.status).toBe(200)
      created.teachers.push({ facultyId: r.body.facultyId, password: r.body.password, token: l.token })
    }
    const patched = await api(`/setup/faculty/${created.teachers[1].facultyId}`, hod, { method: 'PATCH', body: JSON.stringify({ allocationExperience: 14, maxWeeklyPeriods: 20 }) })
    expect(patched.status).toBe(200)
    expect(patched.body.allocationExperience).toBe(14)
    expect(patched.body.maxWeeklyPeriods).toBe(20)
    expect(patched.body.name).toBe('Teacher 2') // untouched fields survive
    const reissued = await post(`/setup/faculty/${created.teachers[1].facultyId}/credentials`, hod, {})
    expect((await login(created.teachers[1].facultyId, created.teachers[1].password)).status).toBe(401) // old password dead
    created.teachers[1] = { ...created.teachers[1], password: reissued.body.password, token: (await login(created.teachers[1].facultyId, reissued.body.password)).token }
    await api(`/setup/faculty/${created.teachers[1].facultyId}`, hod, { method: 'PATCH', body: JSON.stringify({ allocationExperience: 12 }) })
    // the shared master password no longer opens an account that has a personal password
    expect((await login(created.teachers[0].facultyId, 'SCEDULAR_AIDS')).status).toBe(401)
    // a teacher cannot use the setup tools
    expect((await post('/setup/sections', created.teachers[0].token!, { semester: 'III', count: 1 })).status).toBe(403)
  })

  it('teachers choose subjects, the HOD approves, assigns from templates and the semester becomes ready', async () => {
    for (const [i, t] of created.teachers.entries()) {
      const r = await post('/faculty/preferences/submit', t.token!, { items: [{ subjectId: created.subjectIds[i], preferenceRank: 1 }] })
      expect(r.status).toBe(200)
    }
    const board0 = (await api('/hod/assign-board?semester=III', hod)).body
    expect(board0.subjects).toHaveLength(5)
    expect(board0.subjects.every((s: any) => s.interested.length === 1 && s.assignedCount === 0)).toBe(true)

    const prefs = (await api('/hod/preferences?semester=III', hod)).body.preferences as any[]
    for (const p of prefs) expect((await post(`/hod/preferences/${p.id}/review`, hod, { status: 'APPROVED' })).status).toBe(200)

    const preview = await post('/hod/auto-assign', hod, { semester: 'III', dryRun: true })
    expect(preview.body.assignedSections).toBe(10) // 5 subjects x 2 sections
    expect(preview.body.leftover).toEqual([])
    const run = await post('/hod/auto-assign', hod, { semester: 'III' })
    expect(run.body.assignedSections).toBe(10)

    const board = (await api('/hod/assign-board?semester=III', hod)).body
    expect(board.subjects.every((s: any) => s.assignedCount === s.sectionCount)).toBe(true)

    const readiness = (await api('/readiness', hod)).body
    const sem = (readiness.semesters ?? readiness.readiness).find((r: any) => r.semester === 'III')
    expect(sem.missingItems).toEqual([])
    expect(sem.canGenerate).toBe(true)
  })

  it('generates a conflict-free timetable from that data', async () => {
    const r = await post('/timetable/generate', hod, { year: 'Year 2', semester: 'III' })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('GREEN')
    expect(r.body.conflicts).toHaveLength(0)
    expect(r.body.unscheduled).toHaveLength(0)
    // every section gets exactly its weekly periods: (5+4+4+6+3) per section x 2 sections
    const periods = r.body.assignments.reduce((n: number, a: any) => n + (a.endPeriod - a.startPeriod + 1), 0)
    expect(periods).toBe((5 + 4 + 4 + 6 + 3) * 2)
  })

  it('exports the class timetables as a PDF in the printed format, one page per section', async () => {
    // printing details are set in-app: a class in-charge for a section and a short name for a subject
    expect((await api('/setup/sections/Y2-A', hod, { method: 'PATCH', body: JSON.stringify({ classIncharge: created.teachers[0].facultyId }) })).status).toBe(200)
    expect((await api('/setup/sections/Y2-A', hod, { method: 'PATCH', body: JSON.stringify({ classIncharge: 'FAC-999' }) })).status).toBe(400)
    const gen = await post('/timetable/generate', hod, {})
    expect(gen.body.status).toBe('GREEN')

    const res = await fetch(`${base}/api/timetable/export?semester=III`, { headers: { Authorization: `Bearer ${hod}` } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('Sem-III')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    const pages = (buf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length
    expect(pages).toBe(2) // Y2-A and Y2-B

    expect((await fetch(`${base}/api/timetable/export?semester=XX`, { headers: { Authorization: `Bearer ${hod}` } })).status).toBe(400)
    expect((await fetch(`${base}/api/timetable/export?semester=VII`, { headers: { Authorization: `Bearer ${hod}` } })).status).toBe(404) // not part of this timetable
    expect((await fetch(`${base}/api/timetable/export?semester=all`, { headers: { Authorization: `Bearer ${hod}` } })).status).toBe(200)
  })

  it('two semesters sharing a teacher are generated together without double-booking that teacher', async () => {
    // Semester V gets one section and one subject taught by a teacher who also teaches in Semester III.
    await post('/setup/sections', hod, { semester: 'V', count: 1 })
    const sub = await post('/setup/subjects', hod, { code: 'V501', name: 'Compilers', semester: 'V', deliveryType: 'THEORY', theoryPeriods: 6, labPeriods: 0 })
    expect(sub.status).toBe(201)
    const shared = created.teachers[2] // already teaches a Semester III subject
    expect((await post('/hod/assign', hod, { semester: 'V', subjectId: sub.body.id, facultyId: shared.facultyId, sectionCount: 1 })).status).toBe(201)

    const r = await post('/timetable/generate', hod, {})
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('GREEN')
    const sections = new Set(r.body.assignments.map((a: any) => a.sectionId))
    expect([...sections].sort()).toEqual(['Y2-A', 'Y2-B', 'Y3-A']) // both semesters are in the ONE run
    const slots = new Map<string, string>()
    for (const a of r.body.assignments) for (let p = a.startPeriod; p <= a.endPeriod; p++) {
      const k = `${a.facultyId}|${a.day}|${p}`
      if (slots.has(k) && slots.get(k) !== a.sectionId) throw new Error(`teacher double-booked: ${k}`)
      slots.set(k, a.sectionId)
    }
    // clean up so the later tests see the original three-section world
    await post('/hod/unassign', hod, { subjectId: sub.body.id, facultyId: shared.facultyId })
    await api(`/setup/subjects/${sub.body.id}`, hod, { method: 'DELETE' })
    await api('/setup/sections/Y3-A', hod, { method: 'DELETE' })
  })

  it('removing a teacher or a subject cleans up everything that depended on it', async () => {
    const gone = created.teachers[0]
    expect((await api(`/setup/faculty/${gone.facultyId}`, hod, { method: 'DELETE' })).status).toBe(200)
    expect((await login(gone.facultyId, gone.password)).status).toBe(401)           // login dead
    expect((await api('/faculty/preferences', gone.token!)).status).toBe(401)        // open session dead
    const after = (await api('/hod/assign-board?semester=III', hod)).body
    const orphaned = after.subjects.find((s: any) => s.subjectId === created.subjectIds[0])
    expect(orphaned.assignedCount).toBe(0)                                           // its sections are open again
    expect((await api('/hod/assign-board?semester=III', hod)).body.subjects.flatMap((s: any) => s.teachers).some((t: any) => t.facultyId === gone.facultyId)).toBe(false)

    expect((await api(`/setup/subjects/${created.subjectIds[1]}`, hod, { method: 'DELETE' })).status).toBe(200)
    const list = (await api('/setup/subjects', hod)).body as any[]
    expect(list.map(s => s.code)).not.toContain('T102')
    const prefs = (await api('/hod/preferences?semester=III', hod)).body.preferences as any[]
    expect(prefs.some(p => p.subjectId === created.subjectIds[1])).toBe(false)
    expect((await api('/setup/faculty/FAC-001', hod, { method: 'DELETE' })).status).toBe(400) // HOD is protected
  })

  it('the data survives a restart of the database layer (nothing is re-imposed from the seed files)', async () => {
    await new Promise(r => setTimeout(r, 400)) // saves are debounced
    const saved = JSON.parse(fs.readFileSync(DB, 'utf-8').length ? fs.readFileSync(DB, 'utf-8') : '{}')
    expect(saved.appOwned).toBe(true)
    expect(saved.subjects.length).toBe(4)
    expect(saved.faculty.some((f: any) => f.id === 'FAC-002')).toBe(false) // deleted teacher is not resurrected
  })
})
