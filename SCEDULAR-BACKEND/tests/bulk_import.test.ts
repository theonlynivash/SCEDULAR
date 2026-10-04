import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as XLSX from 'xlsx'
import type { Server } from 'node:http'

let server: Server, base = '', hod = ''
const J = (t: string) => ({ 'content-type': 'application/json', authorization: `Bearer ${t}` })
const post = async (p: string, body: unknown) => { const r = await fetch(base + p, { method: 'POST', headers: J(hod), body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as any } }
const sheetFile = (name: string, aoa: unknown[][]) => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  return new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })])
}
const upload = async (kind: string, file: Blob) => {
  const fd = new FormData(); fd.append('file', file, 'x.xlsx')
  const r = await fetch(`${base}/api/setup/import/${kind}/preview`, { method: 'POST', headers: { authorization: `Bearer ${hod}` }, body: fd })
  return { status: r.status, body: await r.json() as any }
}

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  hod = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json() as any).token
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('teacher import: stage -> fix -> commit', () => {
  const H = ['Faculty ID', 'Name *', 'Designation', 'Email', 'Phone', 'Experience (years) *']
  it('serves a template with the required columns', async () => {
    const r = await fetch(`${base}/api/setup/import/template/teachers`, { headers: J(hod) })
    expect(r.status).toBe(200)
    const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: 'buffer' })
    expect(wb.SheetNames).toContain('Teachers')
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Teachers, { header: 1 })[0]).toContain('Experience (years) *')
  })

  it('lists the exact missing items, lets the rows be fixed, then imports', async () => {
    const up = await upload('teachers', sheetFile('Teachers', [H,
      ['', 'Import One', 'Professor', 'import.one@example.com', '', '12'],
      ['', 'Import Two', '', 'bad-email', '', ''],                     // missing experience + invalid email + no designation
      ['', 'Import Three', 'Assistant Professor', 'import.one@example.com', '', '4'],   // email repeated in the file
    ]))
    expect(up.status).toBe(200)
    const rows = up.body.rows
    const two = rows[1].issues.map((i: any) => `${i.field}:${i.level}`)
    expect(two).toContain('experience:error')
    expect(two).toContain('email:error')
    expect(rows[1].issues.find((i: any) => i.field === 'experience').message).toMatch(/Experience \(years\) is missing/)
    expect(rows[2].issues.some((i: any) => i.field === 'email' && /row/.test(i.message))).toBe(true)
    expect(up.body.summary.errors).toBe(2)

    // commit refused while errors remain
    expect((await post('/api/setup/import/teachers/commit', { rows })).status).toBe(422)

    // the HOD fixes the cells on screen; revalidation clears the errors
    rows[1].values.experience = '8'; rows[1].values.email = 'import.two@example.com'
    rows[2].values.email = 'import.three@example.com'
    const fixed = await post('/api/setup/import/teachers/validate', { rows })
    expect(fixed.body.summary.errors).toBe(0)

    const done = await post('/api/setup/import/teachers/commit', { rows: fixed.body.rows })
    expect(done.status).toBe(200)
    expect(done.body.created).toBe(3)
    expect(done.body.logins).toHaveLength(3)
    expect(done.body.logins[0].password).toMatch(/^[a-z]{4}-\d{4}$/)

    // an imported teacher can sign in with the generated password and is ready to submit preferences (experience set)
    const l = done.body.logins[0]
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: l.facultyId, password: l.password }) })
    expect(login.status).toBe(200)
    const me = await (await fetch(base + '/api/faculty/me', { headers: J(((await login.json()) as any).token) })).json() as any
    expect(me.allocationExperience).toBe(12)
  })
})

describe('syllabus import', () => {
  const H = ['Semester *', 'Subject Code *', 'Subject Name *', 'Short Name', 'Type *', 'Theory periods/week *', 'Lab periods/week *', 'Credits', 'Category', 'Lab rooms', 'Sections']
  it('flags a missing lab room, an unknown room and a missing semester, then imports the fixed rows', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const lab = getLocalDb().labs[0].name
    const up = await upload('syllabus', sheetFile('Syllabus', [H,
      ['V', 'IMP1001', 'Import Theory', 'IMPT', 'THEORY', '4', '0', '3', 'CORE', '', ''],
      ['V', 'IMP1002', 'Import Integrated', '', 'INTEGRATED', '2', '2', '3', '', '', ''],        // lab but no room
      ['', 'IMP1003', 'No Semester', '', 'THEORY', '3', '0', '3', '', '', ''],                    // semester missing
      ['V', 'IMP1004', 'Wrong Room', '', 'LAB', '0', '3', '2', '', 'Nonexistent Lab', ''],
      ['V', 'IMP1005', 'Wrong Section', 'IMPS', 'THEORY', '4', '0', '3', '', '', 'Z'],
    ]))
    expect(up.status).toBe(200)
    const msg = (r: any, f: string) => r.issues.find((i: any) => i.field === f && i.level === 'error')?.message
    expect(msg(up.body.rows[1], 'labs')).toMatch(/needs at least one room/)
    expect(msg(up.body.rows[2], 'semester')).toMatch(/Semester is missing/)
    expect(msg(up.body.rows[3], 'labs')).toMatch(/Unknown lab room "Nonexistent Lab"/)
    expect(msg(up.body.rows[4], 'sections')).toMatch(/Section "Z" does not exist/)
    expect(up.body.lookups.labs).toContain(lab)

    const rows = up.body.rows
    rows[1].values.labs = lab
    rows[2].values.semester = 'V'
    rows[3].values.labs = lab
    rows[4].values.sections = 'A'
    const fixed = await post('/api/setup/import/syllabus/validate', { rows })
    expect(fixed.body.summary.errors).toBe(0)
    const done = await post('/api/setup/import/syllabus/commit', { rows: fixed.body.rows })
    expect(done.status).toBe(200)
    expect(done.body.created).toBe(5)

    const subs = await (await fetch(base + '/api/setup/subjects', { headers: J(hod) })).json() as any[]
    const integrated = subs.find(s => s.code === 'IMP1002')!
    expect(integrated).toMatchObject({ semester: 'V', deliveryType: 'INTEGRATED', theoryPeriods: 2, labPeriods: 2 })
    expect(integrated.labIds.length).toBe(1)
    expect(integrated.sectionIds.length).toBeGreaterThan(1)                                // blank sections = every section of the semester
    expect(subs.find(s => s.code === 'IMP1005')!.sectionIds.length).toBe(1)                // only section A

    // data check: nothing about the freshly imported subjects is left as an error
    const check = await (await fetch(base + '/api/setup/import/data-check', { headers: J(hod) })).json() as any
    expect(check.items.some((i: any) => i.level === 'error' && /IMP100/.test(i.message))).toBe(false)
  })

  it('re-importing an existing code updates it instead of duplicating', async () => {
    const up = await upload('syllabus', sheetFile('Syllabus', [H, ['V', 'IMP1001', 'Import Theory (renamed)', 'IMPT', 'THEORY', '5', '0', '3', 'CORE', '', '']]))
    expect(up.body.rows[0].action).toBe('update')
    const done = await post('/api/setup/import/syllabus/commit', { rows: up.body.rows })
    expect(done.body).toMatchObject({ created: 0, updated: 1 })
    const subs = await (await fetch(base + '/api/setup/subjects', { headers: J(hod) })).json() as any[]
    expect(subs.filter(s => s.code === 'IMP1001')).toHaveLength(1)
    expect(subs.find(s => s.code === 'IMP1001')).toMatchObject({ name: 'Import Theory (renamed)', theoryPeriods: 5 })
  })
})

describe('teacher import: replace all (another department)', () => {
  const H = ['Faculty ID', 'Name *', 'Designation', 'Email', 'Phone', 'Experience (years) *']
  it('rewrites the whole teacher list only with the HOD password and REPLACE, keeping the HOD', async () => {
    const { getLocalDb } = await import('../src/db/localDb.js')
    const { listFaculty } = await import('../src/db/repo.js')
    const db = getLocalDb()
    const before = (await listFaculty()).filter(f => f.role !== 'HOD')
    expect(before.length).toBeGreaterThan(5)
    const reusedEmail = before.find(f => f.email)!.email!          // an email that belongs to a teacher who is about to be replaced

    const up = await (async () => {
      const fd = new FormData(); fd.append('mode', 'replace')
      fd.append('file', sheetFile('Teachers', [H, ['FAC-777', 'New Dept One', 'Professor', reusedEmail, '', '11'], ['', 'New Dept Two', '', 'two@newdept.edu', '', '5']]), 'x.xlsx')
      const r = await fetch(`${base}/api/setup/import/teachers/preview`, { method: 'POST', headers: { authorization: `Bearer ${hod}` }, body: fd })
      return { status: r.status, body: await r.json() as any }
    })()
    expect(up.status).toBe(200)
    expect(up.body.summary.errors).toBe(0)                                   // reusing an old teacher's email is fine when replacing
    expect(up.body.rows[0].issues.some((i: any) => i.field === 'facultyId' && i.level === 'warning')).toBe(true)

    const rows = up.body.rows
    expect((await post('/api/setup/import/teachers/commit', { rows, mode: 'replace', password: 'SCEDULAR_AIDS' })).status).toBe(400)               // no REPLACE
    expect((await post('/api/setup/import/teachers/commit', { rows, mode: 'replace', confirm: 'REPLACE', password: 'wrong' })).status).toBe(403)    // wrong password
    expect((await listFaculty()).filter(f => f.role !== 'HOD').length).toBe(before.length)                                                           // nothing changed yet

    const done = await post('/api/setup/import/teachers/commit', { rows, mode: 'replace', confirm: 'REPLACE', password: 'SCEDULAR_AIDS' })
    expect(done.status).toBe(200)
    expect(done.body).toMatchObject({ created: 2, removed: before.length })
    const after = await listFaculty()
    expect(after.filter(f => f.role === 'HOD')).toHaveLength(1)               // the HOD survives
    expect(after.filter(f => f.role !== 'HOD').map(f => f.name).sort()).toEqual(['New Dept One', 'New Dept Two'])
    expect(db.generationRuns).toHaveLength(0)                                 // old timetables referred to removed teachers
    expect(db.teachingAssignments.every((t: any) => after.some(f => f.id === t.facultyId))).toBe(true)
    expect(db.sections.every((s: any) => !s.classIncharge || after.some(f => f.id === s.classIncharge))).toBe(true)
    // an old teacher can no longer sign in; a new one can
    const old = before[0]
    expect((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: old.id, password: 'SCEDULAR_AIDS' }) })).status).toBe(401)
    const nl = done.body.logins[0]
    expect((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: nl.facultyId, password: nl.password }) })).status).toBe(200)
  })
})

describe('syllabus import nudges towards one integrated subject', () => {
  it('warns when a lab-only row is really the lab of a theory subject in the file', async () => {
    const H = ['Semester *', 'Subject Code *', 'Subject Name *', 'Short Name', 'Type *', 'Theory periods/week *', 'Lab periods/week *', 'Credits', 'Category', 'Lab rooms', 'Sections']
    const { getLocalDb } = await import('../src/db/localDb.js')
    const lab = getLocalDb().labs[0].name
    const up = await upload('syllabus', sheetFile('Syllabus', [H,
      ['V', 'PAIR1', 'Computer Vision', 'CV', 'THEORY', '4', '0', '3', '', '', ''],
      ['V', 'PAIR2', 'Computer Vision Laboratory', 'CVL', 'LAB', '0', '3', '2', '', lab, '']]))
    const w = up.body.rows[1].issues.find((i: any) => i.field === 'type' && i.level === 'warning')
    expect(w.message).toMatch(/single INTEGRATED subject/)
  })
})
