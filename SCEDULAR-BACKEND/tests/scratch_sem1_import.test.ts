/**
 * From scratch, Semester I: an empty dataset is filled ONLY by importing Sections, Syllabus and Teachers from Excel; teachers
 * then submit preferences, the HOD approves and assigns, and a conflict-free timetable is generated and exported.
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

const DB = path.join(os.tmpdir(), `scedular-sem1-${process.pid}-${Date.now()}.json`)
process.env.SCEDULAR_DB_FILE = DB

let server: Server, base = '', hod = ''
const call = async (p: string, token = '', init: RequestInit = {}) => {
  const r = await fetch(`${base}/api${p}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any }
}
const post = (p: string, t: string, b: unknown) => call(p, t, { method: 'POST', body: JSON.stringify(b) })
const upload = async (kind: string, file: Blob) => {
  const fd = new FormData(); fd.append('file', file, 'all.xlsx')
  const r = await fetch(`${base}/api/setup/import/${kind}/preview`, { method: 'POST', headers: { authorization: `Bearer ${hod}` }, body: fd })
  return { status: r.status, body: (await r.json()) as any }
}

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(r => { server = app.listen(0, () => { base = `http://localhost:${(server.address() as any).port}`; r() }) })
  hod = (await post('/auth/login', '', { facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' })).body.token
  ;(await import('../src/db/localDb.js')).resetToBlankDb()
})
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); for (const f of [DB, `${DB}.tmp`]) if (fs.existsSync(f)) fs.unlinkSync(f) })

describe('Semester I from scratch, by Excel import', () => {
  let logins: { facultyId: string; password: string }[] = []
  let workbook: Blob

  it('the all-in-one template has the three sheets', async () => {
    const r = await fetch(`${base}/api/setup/import/template/all`, { headers: { authorization: `Bearer ${hod}` } })
    expect(r.status).toBe(200)
    const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: 'buffer' })
    expect(wb.SheetNames).toEqual(expect.arrayContaining(['README', 'Sections', 'Syllabus', 'Teachers', 'Lists']))
  })

  it('imports sections, then syllabus, then teachers from ONE workbook, fixing what is missing on the way', async () => {
    const lab = (await call('/labs', hod)).body[0].name
    const wb = XLSX.utils.book_new()
    const sheet = (name: string, aoa: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
    sheet('Sections', [['Semester *', 'Section *', 'Students', 'Class In-charge'], ['I', 'A', '60', ''], ['I', 'B', '58', ''], ['1', 'C', '', '']])
    sheet('Syllabus', [['Semester *', 'Subject Code *', 'Subject Name *', 'Short Name', 'Type *', 'Theory periods/week *', 'Lab periods/week *', 'Credits', 'Category', 'Lab rooms', 'Sections'],
      ['I', '23MA1101', 'Matrices and Calculus', 'MAC', 'THEORY', '5', '0', '4', 'BASIC_SCIENCE', '', ''],
      ['I', '23PH1102', 'Engineering Physics', 'EPH', 'THEORY', '4', '0', '3', 'BASIC_SCIENCE', '', ''],
      ['I', '23EN1103', 'Technical English', 'TEN', 'THEORY', '3', '0', '3', 'HUMANITIES', '', ''],
      ['I', '23CS1104', 'Programming in C', 'PIC', 'INTEGRATED', '3', '2', '4', 'ENGINEERING_SCIENCE', '', '']])       // lab but no room yet
    sheet('Teachers', [['Faculty ID', 'Name *', 'Designation', 'Email', 'Phone', 'Experience (years) *'],
      ['', 'Dr.P.One', 'Professor', 'one@x.edu', '', '8'], ['', 'Mrs.Q.Two', 'Assistant Professor', 'two@x.edu', '', ''],
      ['', 'Mr.R.Three', 'Assistant Professor', 'three@x.edu', '', '4'], ['', 'Ms.S.Four', 'Assistant Professor', 'four@x.edu', '', '3']])  // one experience missing
    workbook = new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })])

    // 1 sections (Semester "1" is accepted as I)
    const s = await upload('sections', workbook)
    expect(s.status).toBe(200)
    expect(s.body.summary).toMatchObject({ total: 3, errors: 0 })
    expect((await post('/setup/import/sections/commit', hod, { rows: s.body.rows })).body).toMatchObject({ created: 3 })
    expect((await call('/sections', hod)).body.map((x: any) => x.id).sort()).toEqual(['Y1-A', 'Y1-B', 'Y1-C'])

    // 2 syllabus: the integrated subject has no lab room -> exact message; fix on screen
    const y = await upload('syllabus', workbook)
    expect(y.body.summary.errors).toBe(1)
    const bad = y.body.rows.find((r: any) => r.issues.some((i: any) => i.level === 'error'))
    expect(bad.values.code).toBe('23CS1104')
    expect(bad.issues.find((i: any) => i.level === 'error')).toMatchObject({ field: 'labs' })
    expect((await post('/setup/import/syllabus/commit', hod, { rows: y.body.rows })).status).toBe(422)
    bad.values.labs = lab
    const fixedY = (await post('/setup/import/syllabus/validate', hod, { rows: y.body.rows })).body
    expect(fixedY.summary.errors).toBe(0)
    expect((await post('/setup/import/syllabus/commit', hod, { rows: fixedY.rows })).body).toMatchObject({ created: 4 })
    const subs = (await call('/setup/subjects', hod)).body as any[]
    expect(subs.every(x => x.semester === 'I' && x.sectionIds.length === 3)).toBe(true)     // offered to every imported section

    // 3 teachers: one is missing experience -> fix it
    const t = await upload('teachers', workbook)
    expect(t.body.summary.errors).toBe(1)
    const missing = t.body.rows.find((r: any) => r.issues.some((i: any) => i.field === 'experience' && i.level === 'error'))
    expect(missing.issues.find((i: any) => i.field === 'experience').message).toMatch(/Experience \(years\) is missing/)
    missing.values.experience = '6'
    const fixedT = (await post('/setup/import/teachers/validate', hod, { rows: t.body.rows })).body
    const done = (await post('/setup/import/teachers/commit', hod, { rows: fixedT.rows })).body
    expect(done.created).toBe(4)
    logins = done.logins
  })

  it('the data check says the data is ready for preferences, and what still blocks the timetable (assignments)', async () => {
    const c = (await call('/setup/import/data-check', hod)).body
    expect(c.ready.preferences).toBe(true)
    expect(c.items.filter((i: any) => i.level === 'error')).toEqual([])
    expect(c.ready.timetable).toBe(false)
    expect(c.items.some((i: any) => i.area === 'assignment')).toBe(true)
  })

  it('teachers submit preferences, the HOD approves, assigns, and Semester I generates a clean timetable', async () => {
    const subs = (await call('/setup/subjects', hod)).body as any[]
    for (const [i, l] of logins.entries()) {
      const tok = (await post('/auth/login', '', { facultyId: l.facultyId, password: l.password })).body.token
      const r = await post('/faculty/preferences/submit', tok, { items: [{ subjectId: subs[i % subs.length].id, preferenceRank: 1 }] })
      expect(r.status).toBe(200)
    }
    const prefs = (await call('/hod/preferences?semester=I', hod)).body.preferences as any[]
    expect(prefs.length).toBe(4)
    for (const p of prefs) expect((await post(`/hod/preferences/${p.id}/review`, hod, { status: 'APPROVED' })).status).toBe(200)
    const run = await post('/hod/auto-assign', hod, { semester: 'I' })
    expect(run.body.leftover).toEqual([])
    const board = (await call('/hod/assign-board?semester=I', hod)).body
    expect(board.subjects.every((s: any) => s.assignedCount === s.sectionCount)).toBe(true)

    expect((await call('/setup/import/data-check', hod)).body.ready.timetable).toBe(true)
    const g = await post('/timetable/generate', hod, {})
    expect(g.status).toBe(200)
    expect(g.body.status).toBe('GREEN')
    expect(g.body.conflicts).toHaveLength(0)
    const periods = g.body.assignments.reduce((n: number, a: any) => n + (a.endPeriod - a.startPeriod + 1), 0)
    expect(periods).toBe((5 + 4 + 3 + 5) * 3)          // every section gets exactly its weekly periods

    const pdf = await fetch(`${base}/api/timetable/export?semester=I`, { headers: { Authorization: `Bearer ${hod}` } })
    expect(pdf.status).toBe(200)
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
  })
})
