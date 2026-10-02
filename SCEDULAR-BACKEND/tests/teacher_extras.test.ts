/** Teacher results, contact details, and the HOD's mail tools. Own database file, mail captured in memory, no LLM calls. */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

const DB = path.join(os.tmpdir(), `scedular-extras-${process.pid}-${Date.now()}.json`)
process.env.SCEDULAR_DB_FILE = DB
process.env.MAIL_TRANSPORT = 'json'
for (const k of ['GROQ_API_KEY', 'GROK_API_KEY', 'XAI_API_KEY', 'LLM_API_KEY']) process.env[k] = '' // never call a real model in tests

let server: Server, base = '', hod = ''
async function call(p: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${base}/api${p}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}
const post = (p: string, t: string, b: unknown) => call(p, t, { method: 'POST', body: JSON.stringify(b) })
const login = async (id: string, pw: string) => { const r = await post('/auth/login', '', { facultyId: id, password: pw }); return { status: r.status, token: r.body.token as string } }

let a = { id: '', pw: '', token: '' }, b = { id: '', pw: '', token: '' }
beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(r => { server = app.listen(0, () => { base = `http://localhost:${(server.address() as any).port}`; r() }) })
  hod = (await login('FAC-001', 'SCEDULAR_AIDS')).token
  await post('/setup/reset-blank', hod, { password: 'SCEDULAR_AIDS', confirm: 'ERASE' })
  for (const [who, name] of [[a, 'Teacher A'], [b, 'Teacher B']] as const) {
    const t = await post('/setup/faculty', hod, { name, allocationExperience: 5 })
    who.id = t.body.facultyId; who.pw = t.body.password; who.token = (await login(who.id, who.pw)).token
  }
})
afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()))
  for (const f of [DB, `${DB}.tmp`]) if (fs.existsSync(f)) fs.unlinkSync(f)
})

describe('past-semester class results', () => {
  it('a teacher enters pass percentages for subjects they took and sees the average', async () => {
    await post('/setup/sections', hod, { semester: 'IV', count: 1 })
    const sub = await post('/setup/subjects', hod, { code: 'IV401', name: 'Operating Systems', semester: 'IV', deliveryType: 'THEORY', theoryPeriods: 4, labPeriods: 0 })

    const r1 = await post('/faculty/results', a.token, { academicYear: '2025-26', semester: 'IV', subjectId: sub.body.id, passPercent: 92.5, studentsAppeared: 60, sectionsHandled: 1 })
    expect(r1.status).toBe(201)
    expect(r1.body.subjectName).toBe('Operating Systems') // taken from the syllabus
    const r2 = await post('/faculty/results', a.token, { academicYear: '2025-26', semester: 'II', subjectName: 'Engineering Mathematics', passPercent: 80, studentsAppeared: 40 })
    expect(r2.status).toBe(201) // a subject that is not in the current syllabus can be typed in

    const mine = await call('/faculty/results', a.token)
    expect(mine.body.results).toHaveLength(2)
    expect(mine.body.summary.average).toBe(86.3)            // (92.5 + 80) / 2, one decimal
    expect(mine.body.summary.weightedAverage).toBe(87.5)    // weighted by students appeared: (92.5*60 + 80*40) / 100
    expect(mine.body.summary.best).toBe(92.5)
    expect(mine.body.summary.lowest).toBe(80)
    expect(mine.body.summary.bySemester).toHaveLength(2)
    expect((await call('/faculty/results', b.token)).body.results).toHaveLength(0) // private to each teacher
  })

  it('rejects bad input and duplicates', async () => {
    expect((await post('/faculty/results', a.token, { academicYear: '2025-26', semester: 'III', subjectName: 'X Subject', passPercent: 101 })).status).toBe(400)
    expect((await post('/faculty/results', a.token, { academicYear: '2025-26', semester: 'III', subjectName: 'X Subject', passPercent: -1 })).status).toBe(400)
    expect((await post('/faculty/results', a.token, { academicYear: '25/26', semester: 'III', subjectName: 'X Subject', passPercent: 50 })).status).toBe(400)
    expect((await post('/faculty/results', a.token, { academicYear: '2025-26', semester: 'III', passPercent: 50 })).status).toBe(400)           // no subject
    expect((await post('/faculty/results', a.token, { academicYear: '2025-26', semester: 'III', subjectId: 'SUB-NOPE', passPercent: 50 })).status).toBe(400)
    expect((await post('/faculty/results', a.token, { academicYear: '2025-26', semester: 'II', subjectName: 'engineering mathematics', passPercent: 70 })).status).toBe(409)
    expect((await post('/faculty/results', '', { academicYear: '2025-26', semester: 'III', subjectName: 'X Subject', passPercent: 50 })).status).toBe(401)
  })

  it('only the owner (or the HOD) can delete a result; the HOD sees every average', async () => {
    const id = (await call('/faculty/results', a.token)).body.results[0].id
    expect((await call(`/faculty/results/${id}`, b.token, { method: 'DELETE' })).status).toBe(403)
    const overview = await call('/hod/faculty-results', hod)
    expect(overview.body[a.id].count).toBe(2)
    expect(overview.body[a.id].average).toBe(86.3)
    expect(overview.body[b.id]).toBeUndefined()
    expect((await call('/hod/faculty-results', a.token)).status).toBe(403)
    const everyone = await call('/hod/faculty-results-all', hod)
    expect(everyone.body.teachers).toHaveLength(1)                       // only teachers who entered something
    expect(everyone.body.teachers[0].name).toBe('Teacher A')
    expect(everyone.body.teachers[0].results).toHaveLength(2)
    expect(everyone.body.totalTeachers).toBe(2)
    expect((await call('/hod/faculty-results-all', a.token)).status).toBe(403)
    expect((await call(`/faculty/results/${id}`, a.token, { method: 'DELETE' })).status).toBe(200)
    expect((await call('/faculty/results', a.token)).body.results).toHaveLength(1)
  })
})

describe('contact details', () => {
  it('a teacher sets their own email; invalid and duplicate emails are refused', async () => {
    expect((await call('/faculty/me/contact', a.token, { method: 'PATCH', body: JSON.stringify({ email: 'not-an-email' }) })).status).toBe(400)
    const ok = await call('/faculty/me/contact', a.token, { method: 'PATCH', body: JSON.stringify({ email: 'Teacher.A@Gmail.com', phone: '98400 12345' }) })
    expect(ok.status).toBe(200)
    expect(ok.body.email).toBe('teacher.a@gmail.com')
    expect((await call('/faculty/me/contact', b.token, { method: 'PATCH', body: JSON.stringify({ email: 'teacher.a@gmail.com' }) })).status).toBe(409)
    expect((await call(`/setup/faculty/${b.id}`, hod, { method: 'PATCH', body: JSON.stringify({ email: 'teacher.a@gmail.com' }) })).status).toBe(409)
  })
})

describe('HOD mail', () => {
  it('drafts a mail from a short prompt (plain letter when no model is available)', async () => {
    const d = await post('/hod/mail/draft', hod, { facultyId: a.id, prompt: 'congratulate you on the best paper award at the national conference' })
    expect(d.status).toBe(200)
    expect(d.body.source).toBe('template')
    expect(d.body.body).toContain('Dear Teacher A,')
    expect(d.body.body.toLowerCase()).toContain('best paper award')
    expect(d.body.subject.length).toBeGreaterThan(3)
    expect((await post('/hod/mail/draft', hod, { facultyId: a.id, prompt: 'hi' })).status).toBe(400)
    expect((await post('/hod/mail/draft', a.token, { facultyId: a.id, prompt: 'congratulate them please' })).status).toBe(403)
  })

  it('sends a mail, optionally with the login ID or a brand-new password', async () => {
    expect((await post('/hod/mail/send', hod, { facultyId: b.id, subject: 'Hello', body: 'Hi', credentials: 'none' })).body.error).toBe('NO_EMAIL')

    const plain = await post('/hod/mail/send', hod, { facultyId: a.id, subject: 'Congratulations', body: 'Well done on the award.', credentials: 'none' })
    expect(plain.status).toBe(200)
    const box = () => call('/hod/mail/outbox', hod).then(r => r.body as { to: string; subject: string; text: string }[])
    let last = (await box()).at(-1)!
    expect(last.to).toBe('teacher.a@gmail.com')
    expect(last.text).not.toContain('password')

    await post('/hod/mail/send', hod, { facultyId: a.id, subject: 'Your login', body: 'Your login ID is below.', credentials: 'id' })
    last = (await box()).at(-1)!
    expect(last.text).toContain(`Login ID: ${a.id}`)
    expect(last.text).toContain('unchanged')
    expect((await login(a.id, a.pw)).status).toBe(200) // old password still works

    await post('/hod/mail/send', hod, { facultyId: a.id, subject: 'New password', body: 'Here is a fresh password.', credentials: 'new' })
    last = (await box()).at(-1)!
    const newPw = /New password: (\S+)/.exec(last.text)![1]
    expect((await login(a.id, a.pw)).status).toBe(401)   // old one replaced
    expect((await login(a.id, newPw)).status).toBe(200)  // the emailed one works
    a.pw = newPw
  })

  it('never changes the password when the mail fails or mail is not set up', async () => {
    process.env.MAIL_TRANSPORT = 'fail'
    const failed = await post('/hod/mail/send', hod, { facultyId: a.id, subject: 'X', body: 'Y', credentials: 'new' })
    expect(failed.status).toBe(502)
    expect((await login(a.id, a.pw)).status).toBe(200) // still the same password

    delete process.env.MAIL_TRANSPORT
    const saved = [process.env.SMTP_USER, process.env.SMTP_PASS]
    delete process.env.SMTP_USER; delete process.env.SMTP_PASS
    const off = await post('/hod/mail/send', hod, { facultyId: a.id, subject: 'X', body: 'Y', credentials: 'new' })
    expect(off.status).toBe(503)
    expect(off.body.error).toBe('MAIL_NOT_CONFIGURED')
    expect((await call('/hod/mail/status', hod)).body.configured).toBe(false)
    expect((await login(a.id, a.pw)).status).toBe(200)
    process.env.MAIL_TRANSPORT = 'json'
    ;[process.env.SMTP_USER, process.env.SMTP_PASS] = saved as any
  })

  it('keeps a send log without bodies or passwords', async () => {
    const log = await call(`/hod/mail/log?facultyId=${a.id}`, hod)
    expect(log.body.length).toBe(3)
    expect(log.body.map((e: any) => e.credentials).sort()).toEqual(['id', 'new', 'none'])
    for (const e of log.body) expect(Object.keys(e).sort()).toEqual(['credentials', 'facultyId', 'id', 'sentAt', 'sentBy', 'subject', 'to']) // no body field
    expect(JSON.stringify(log.body)).not.toContain(a.pw)   // the emailed password is never stored
    expect(JSON.stringify(log.body)).not.toContain('Well done')
    expect((await call('/hod/mail/log', a.token)).status).toBe(403)
  })

  it('removing a teacher removes their results and mail log', async () => {
    expect((await call(`/setup/faculty/${a.id}`, hod, { method: 'DELETE' })).status).toBe(200)
    expect((await call('/hod/faculty-results', hod)).body[a.id]).toBeUndefined()
    expect((await call(`/hod/mail/log?facultyId=${a.id}`, hod)).body).toEqual([])
  })
})
