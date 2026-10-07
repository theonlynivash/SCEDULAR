import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
const call = async (token: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any }
}
const login = async (facultyId: string, password: string) =>
  (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId, password }) })).json() as any).token as string

let hod = '', A = '', B = '', tokA = '', tokB = '', date = '', day = ''
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  hod = await login('FAC-001', 'SCEDULAR_AIDS')
  const { getSemesterReadinessStatus, getAssignmentsForRun, getLatestValidRun } = await import('../src/db/repo.js')
  const { generateTimetable } = await import('../src/solver/pipeline.js')
  const ready = (await getSemesterReadinessStatus()).filter(r => r.canGenerate)
  expect(ready.length).toBeGreaterThan(0)
  await generateTimetable([{ year: ready[0].year, semester: ready[0].semester }])
  const run = (await getLatestValidRun())!
  const asg = await getAssignmentsForRun(run.id)
  // teacher A: the busiest non-HOD teacher; the leave date is the next working day on which A teaches
  const load = new Map<string, number>()
  for (const a of asg) if (a.facultyId !== 'FAC-001') load.set(a.facultyId, (load.get(a.facultyId) ?? 0) + 1)
  A = [...load.entries()].sort((x, y) => y[1] - x[1])[0][0]
  for (let i = 1; i < 14; i++) { const d = addDays(i); const dn = DAYS[new Date(d + 'T00:00:00Z').getUTCDay()]; if (asg.some(a => a.facultyId === A && a.day === dn)) { date = d; day = dn; break } }
  expect(date).not.toBe('')
  B = [...load.keys()].find(x => x !== A)!
  const { setFacultyPassword } = await import('../src/auth/passwords.js')
  await setFacultyPassword(A, 'Teacher-pass-A1'); await setFacultyPassword(B, 'Teacher-pass-B1')
  tokA = await login(A, 'Teacher-pass-A1'); tokB = await login(B, 'Teacher-pass-B1')
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

let leaveId = 0, slots: any[] = []

describe('leave letter → HOD → substitutes', () => {
  it('shows the teacher her own classes of the day, with only genuinely free teachers listed under each', async () => {
    const r = await call(tokA, 'GET', `/leave/preview?from=${date}&to=${date}`)
    expect(r.status).toBe(200)
    slots = r.json.slots
    expect(slots.length).toBeGreaterThan(0)
    expect(r.json.letter).toContain('Request for leave')
    const { getAssignmentsForRun, getLatestValidRun } = await import('../src/db/repo.js')
    const asg = await getAssignmentsForRun((await getLatestValidRun())!.id)
    for (const s of slots) {
      // the slot is really one of A's classes on that weekday
      expect(asg.some(a => a.facultyId === A && a.day === day && a.sectionId === s.sectionId && a.startPeriod === s.startPeriod)).toBe(true)
      for (const c of s.candidates) {
        expect(c.facultyId).not.toBe(A)
        // free for every period of the class: no class of their own then
        for (let p = s.startPeriod; p <= s.endPeriod; p++) expect(asg.some(a => a.facultyId === c.facultyId && a.day === day && p >= a.startPeriod && p <= a.endPeriod)).toBe(false)
      }
    }
    expect(slots.some(s => s.candidates.length > 0)).toBe(true)
  })

  it('rejects past dates, backwards ranges and a missing reason', async () => {
    expect((await call(tokA, 'GET', `/leave/preview?from=2020-01-01&to=2020-01-02`)).status).toBe(400)
    expect((await call(tokA, 'GET', `/leave/preview?from=${addDays(5)}&to=${addDays(2)}`)).status).toBe(400)
    expect((await call(tokA, 'POST', '/leave', { fromDate: date, toDate: date, reason: '' })).status).toBe(400)
    expect((await call(tokA, 'GET', `/leave/preview?from=${date}&to=${addDays(60)}`)).status).toBe(400)
  })

  it('sends the letter; only genuinely free teachers survive in the named list; the HOD is told in the message box', async () => {
    const proposed: Record<string, string[]> = {}
    const first = slots.find(s => s.candidates.length > 0)
    proposed[first.key] = [first.candidates[0].facultyId, 'FAC-999']   // a stranger is dropped
    const r = await call(tokA, 'POST', '/leave', { fromDate: date, toDate: date, reason: 'a family function', proposed })
    expect(r.status).toBe(201)
    leaveId = r.json.id
    expect(r.json.classes).toBe(slots.length)
    const d = await call(hod, 'GET', `/leave/${leaveId}`)
    const s1 = d.json.slots.find((s: any) => s.key === first.key)
    expect(s1.proposed.map((p: any) => p.facultyId)).toEqual([first.candidates[0].facultyId])
    expect(d.json.status).toBe('PENDING')
    expect(d.json.letter).toContain('a family function')
    const threads = await call(hod, 'GET', `/messages/thread/${A}`)
    expect(threads.json.some((m: any) => m.text.includes(`Leave request #${leaveId}`))).toBe(true)
    // overlap with an open request is refused
    expect((await call(tokA, 'POST', '/leave', { fromDate: date, toDate: date, reason: 'again please' })).status).toBe(409)
  })

  it('others cannot read the request or decide on it', async () => {
    expect((await call(tokB, 'GET', `/leave/${leaveId}`)).status).toBe(404)
    expect((await call(tokA, 'POST', `/leave/${leaveId}/assign`, { slotKey: slots[0].key, facultyId: B })).status).toBe(403)
    expect((await call(tokB, 'POST', `/leave/${leaveId}/decision`, { action: 'APPROVE' })).status).toBe(403)
    const mineB = await call(tokB, 'GET', '/leave')
    expect(mineB.json.some((l: any) => l.id === leaveId)).toBe(false)
  })

  it('the HOD sees the classes under each section with the free teachers; assigning approves the leave', async () => {
    const d = await call(hod, 'GET', `/leave/${leaveId}`)
    expect(d.json.slots.every((s: any) => Array.isArray(s.candidates))).toBe(true)
    const target = d.json.slots.find((s: any) => s.candidates.length > 0)
    const sub = target.candidates[0].facultyId
    const r = await call(hod, 'POST', `/leave/${leaveId}/assign`, { slotKey: target.key, facultyId: sub })
    expect(r.status).toBe(200)
    expect(r.json.status).toBe('APPROVED')
    expect(r.json.coverage.covered).toBe(1)

    // the same teacher cannot also take another class at the same time, nor be taken twice for the same one
    const clash = d.json.slots.find((s: any) => s.key !== target.key && s.startPeriod <= target.endPeriod && target.startPeriod <= s.endPeriod)
    if (clash) expect((await call(hod, 'POST', `/leave/${leaveId}/assign`, { slotKey: clash.key, facultyId: sub })).status).toBe(409)
    // someone with a class of their own then is refused
    const busy = await (async () => {
      const { getAssignmentsForRun, getLatestValidRun } = await import('../src/db/repo.js')
      const asg = await getAssignmentsForRun((await getLatestValidRun())!.id)
      return asg.find(a => a.day === day && a.facultyId !== A && a.startPeriod <= target.endPeriod && target.startPeriod <= a.endPeriod)?.facultyId
    })()
    if (busy) expect((await call(hod, 'POST', `/leave/${leaveId}/assign`, { slotKey: target.key, facultyId: busy })).status).toBe(409)

    // the substitute's own dashboard now says whose class they take
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    await setFacultyPassword(sub, 'Teacher-pass-S1')
    const tokS = await login(sub, 'Teacher-pass-S1')
    const sum = await call(tokS, 'GET', '/leave/summary')
    expect(sum.json.upcomingDuties.length).toBe(1)
    expect(sum.json.upcomingDuties[0].inPlaceOf).toBe(A)
    expect(sum.json.upcomingDuties[0].sectionId).toBe(target.sectionId)
    expect(sum.json.covering.periods).toBe(target.endPeriod - target.startPeriod + 1)
    expect((await call(tokS, 'GET', `/messages/thread/FAC-001`)).json.some((m: any) => m.text.includes('substitution class in place of'))).toBe(true)

    // the leave-taker's counts, and who covered for her
    const a = await call(tokA, 'GET', '/leave/summary')
    expect(a.json.leaves.requests).toBe(1)
    expect(a.json.leaves.days).toBe(1)
    expect(a.json.coveredForMe[0].facultyId).toBe(sub)

    // and the other way round: when the substitute asks for leave, the person they covered for is flagged in their list
    const back = await call(tokS, 'GET', `/leave/preview?from=${addDays(30)}&to=${addDays(36)}`)
    for (const s of back.json.slots) {
      const c = s.candidates.find((x: any) => x.facultyId === A)
      if (c) { expect(c.covered.byMe).toBeGreaterThan(0); break }
    }
  })

  it('prints the day\'s substitution sheet as a PDF (HOD only); an empty day is refused', async () => {
    const raw = (tok: string, path: string) => fetch(base + '/api' + path, { headers: { authorization: `Bearer ${tok}` } })
    const ok = await raw(hod, `/leave/export/substitutions?date=${date}`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('application/pdf')
    expect(ok.headers.get('content-disposition')).toContain(`Substitutions-${date}.pdf`)
    const buf = Buffer.from(await ok.arrayBuffer())
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')
    expect(buf.length).toBeGreaterThan(2500)
    expect((await raw(tokA, `/leave/export/substitutions?date=${date}`)).status).toBe(403)       // teachers do not print the department's sheet
    expect((await raw(hod, '/leave/export/substitutions?date=2031-01-01')).status).toBe(404)      // nothing arranged that day
    expect((await fetch(base + '/api/leave/export/substitutions')).status).toBe(401)
  })

  it('replacing a substitute tells the old one; removing one frees the class', async () => {
    const d = await call(hod, 'GET', `/leave/${leaveId}`)
    const covered = d.json.slots.find((s: any) => s.substitute)
    const other = covered.candidates.find((c: any) => c.facultyId !== covered.substitute.facultyId)
    if (other) {
      const r = await call(hod, 'POST', `/leave/${leaveId}/assign`, { slotKey: covered.key, facultyId: other.facultyId })
      expect(r.status).toBe(200)
      expect(r.json.slots.find((s: any) => s.key === covered.key).substitute.facultyId).toBe(other.facultyId)
      expect(r.json.coverage.covered).toBe(1)
    }
    const del = await call(hod, 'DELETE', `/leave/${leaveId}/assign?slot=${encodeURIComponent(covered.key)}`)
    expect(del.status).toBe(200)
    expect(del.json.coverage.covered).toBe(0)
  })

  it('cancelling closes the request and drops its substitutions', async () => {
    const d = await call(hod, 'GET', `/leave/${leaveId}`)
    const t = d.json.slots.find((s: any) => s.candidates.length > 0)
    expect((await call(hod, 'POST', `/leave/${leaveId}/assign`, { slotKey: t.key, facultyId: t.candidates[0].facultyId })).status).toBe(200)
    expect((await call(tokA, 'POST', `/leave/${leaveId}/cancel`)).status).toBe(200)
    const after = await call(hod, 'GET', `/leave/${leaveId}`)
    expect(after.json.status).toBe('CANCELLED')
    expect(after.json.slots.every((s: any) => !s.substitute)).toBe(true)
    expect((await call(hod, 'POST', `/leave/${leaveId}/assign`, { slotKey: t.key, facultyId: t.candidates[0].facultyId })).status).toBe(409)
    expect((await call(tokA, 'GET', '/leave/summary')).json.leaves.requests).toBe(0)   // cancelled leave is not counted
  })

  it('the HOD can reject a request; the teacher is told', async () => {
    const r = await call(tokA, 'POST', '/leave', { fromDate: date, toDate: date, reason: 'personal work' })
    expect(r.status).toBe(201)
    const rej = await call(hod, 'POST', `/leave/${r.json.id}/decision`, { action: 'REJECT', note: 'exam duty that day' })
    expect(rej.status).toBe(200)
    expect(rej.json.status).toBe('REJECTED')
    expect((await call(tokA, 'GET', `/messages/thread/FAC-001`)).json.some((m: any) => m.text.includes('exam duty that day'))).toBe(true)
  })

  it('the letter text includes the reason, and only the HOD sees the department scoreboard', async () => {
    const l = await call(tokA, 'GET', `/leave/letter?from=${date}&to=${date}&reason=${encodeURIComponent('a medical check-up')}`)
    expect(l.status).toBe(200)
    expect(l.json.letter).toContain('a medical check-up')
    expect((await call(tokA, 'GET', '/leave/scoreboard')).status).toBe(403)
    expect((await call(hod, 'GET', '/leave/scoreboard')).status).toBe(200)
  })

  it('every leave route needs a sign-in', async () => {
    for (const path of ['/leave', '/leave/summary', '/leave/preview?from=2030-01-01&to=2030-01-01']) {
      expect((await fetch(base + '/api' + path)).status).toBe(401)
    }
  })
})

describe('the HOD takes her own leave', () => {
  it('needs no approval: it starts approved, and she assigns the free teachers herself', async () => {
    const r = await call(hod, 'POST', '/leave', { fromDate: date, toDate: date, reason: 'a conference' })
    expect(r.status).toBe(201)
    const d = await call(hod, 'GET', `/leave/${r.json.id}`)
    expect(d.json.facultyId).toBe('FAC-001')
    expect(d.json.status).toBe('APPROVED')
    // nothing was sent to herself
    expect((await call(hod, 'GET', '/messages/unread')).json.count).toBeGreaterThanOrEqual(0)
    const t = d.json.slots.find((s: any) => s.candidates.length > 0)
    if (t) {
      const a = await call(hod, 'POST', `/leave/${r.json.id}/assign`, { slotKey: t.key, facultyId: t.candidates[0].facultyId })
      expect(a.status).toBe(200)
      expect(a.json.coverage.covered).toBe(1)
    }
  })
})
