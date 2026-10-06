import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
const call = async (token: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any, type: r.headers.get('content-type') ?? '' }
}
const login = async (facultyId: string, password: string) =>
  (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId, password }) })).json() as any).token as string

let hod = '', A = '', B = '', tokA = '', tokB = ''

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  hod = await login('FAC-001', 'SCEDULAR_AIDS')
  const { getSemesterReadinessStatus, getAssignmentsForRun, getLatestValidRun } = await import('../src/db/repo.js')
  const { generateTimetable } = await import('../src/solver/pipeline.js')
  const ready = (await getSemesterReadinessStatus()).filter(r => r.canGenerate)
  await generateTimetable([{ year: ready[0].year, semester: ready[0].semester }])
  const asg = await getAssignmentsForRun((await getLatestValidRun())!.id)
  const ids = [...new Set(asg.map(a => a.facultyId))].filter(x => x !== 'FAC-001')
  A = ids[0]; B = ids[1]
  const { setFacultyPassword } = await import('../src/auth/passwords.js')
  await setFacultyPassword(A, 'Teacher-pass-A1'); await setFacultyPassword(B, 'Teacher-pass-B1')
  tokA = await login(A, 'Teacher-pass-A1'); tokB = await login(B, 'Teacher-pass-B1')
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

const setLimit = async (on: boolean) => {
  const cur = (await call(hod, 'GET', '/hod/allocation-settings')).json.config
  expect((await call(hod, 'POST', '/hod/allocation-settings', { config: { ...cur, facultyCanSeeOtherTimetables: on } })).status).toBe(200)
}

describe('HOD setting: may teachers see other teachers\' timetables?', () => {
  it('on (the default): a teacher can open anyone\'s timetable and download class and lab sheets', async () => {
    await setLimit(true)
    expect((await call(tokA, 'GET', '/timetable/visibility')).json).toEqual({ canSeeOthers: true, canDownloadSheets: true })
    expect((await call(tokA, 'GET', `/timetable/faculty/${B}`)).status).toBe(200)
    expect((await call(tokA, 'GET', '/timetable/export?semester=all')).type).toContain('application/pdf')
    expect((await call(tokA, 'GET', '/timetable/export/labs?lab=all')).status).not.toBe(403)
  })

  it('off: a teacher sees only her own under Faculty and can download only her own PDF, but still sees class and lab timetables', async () => {
    await setLimit(false)
    expect((await call(tokA, 'GET', '/timetable/visibility')).json).toEqual({ canSeeOthers: false, canDownloadSheets: false })
    expect((await call(tokA, 'GET', `/timetable/faculty/${B}`)).status).toBe(403)
    expect((await call(tokA, 'GET', `/timetable/faculty/${A}`)).status).toBe(200)
    expect((await call(tokA, 'GET', `/timetable/export/faculty/${A}`)).type).toContain('application/pdf')
    expect((await call(tokA, 'GET', `/timetable/export/faculty/${B}`)).status).toBe(403)
    expect((await call(tokA, 'GET', '/timetable/export?semester=all')).status).toBe(403)
    expect((await call(tokA, 'GET', '/timetable/export/labs?lab=all')).status).toBe(403)
    // class and lab timetables stay visible
    expect((await call(tokA, 'GET', '/timetable/master')).status).toBe(200)
    expect((await call(tokA, 'GET', '/timetable/section/Y2-A')).status).not.toBe(403)
    // the HOD is never limited
    expect((await call(hod, 'GET', `/timetable/faculty/${B}`)).status).toBe(200)
    expect((await call(hod, 'GET', '/timetable/export?semester=all')).type).toContain('application/pdf')
    expect((await call(hod, 'GET', '/timetable/visibility')).json.canSeeOthers).toBe(true)
    await setLimit(true)
  })
})

describe('absence report and calendar', () => {
  const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  let leaveId = 0
  it('the HOD sees how many periods each teacher did not attend; a teacher cannot', async () => {
    const { getAssignmentsForRun, getLatestValidRun } = await import('../src/db/repo.js')
    const asg = await getAssignmentsForRun((await getLatestValidRun())!.id)
    const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    let date = ''
    for (let i = 1; i < 14 && !date; i++) { const d = addDays(i); if (asg.some(a => a.facultyId === A && a.day === DAYS[new Date(d + 'T00:00:00Z').getUTCDay()])) date = d }
    const r = await call(tokA, 'POST', '/leave', { fromDate: date, toDate: date, reason: 'a medical check-up' })
    expect(r.status).toBe(201); leaveId = r.json.id
    // not approved yet: nothing counted
    expect((await call(hod, 'GET', '/leave/absence')).json.rows.length).toBe(0)
    expect((await call(hod, 'POST', `/leave/${leaveId}/decision`, { action: 'APPROVE' })).status).toBe(200)
    const rep = (await call(hod, 'GET', '/leave/absence')).json
    const row = rep.rows.find((x: any) => x.facultyId === A)
    expect(row.leaveRequests).toBe(1)
    expect(row.leaveDays).toBe(1)
    expect(row.periodsMissed).toBe(0)                  // the day has not come yet
    expect(row.periodsUpcoming).toBeGreaterThan(0)
    expect(row.leaves[0].id).toBe(leaveId)
    expect((await call(tokA, 'GET', '/leave/absence')).status).toBe(403)
  })

  it('the calendar shows leave days and substitutions: everything for the HOD, only her own for a teacher', async () => {
    const detail = (await call(hod, 'GET', `/leave/${leaveId}`)).json
    const slot = detail.slots.find((s: any) => s.candidates.length > 0)
    expect((await call(hod, 'POST', `/leave/${leaveId}/assign`, { slotKey: slot.key, facultyId: slot.candidates[0].facultyId })).status).toBe(200)
    const month = slot.date.slice(0, 7)
    const h = (await call(hod, 'GET', `/leave/calendar?month=${month}`)).json
    expect(h.days[slot.date].leaves.some((l: any) => l.facultyId === A)).toBe(true)
    expect(h.days[slot.date].substitutions.length).toBe(1)
    expect(h.days[slot.date].substitutions[0].originalId).toBe(A)
    // an unrelated teacher sees nothing of it
    const other = (await call(tokB, 'GET', `/leave/calendar?month=${month}`)).json
    const involved = slot.candidates[0].facultyId === B
    expect(other.days[slot.date]?.leaves?.length ?? 0).toBe(0)
    expect(other.days[slot.date]?.substitutions?.length ?? 0).toBe(involved ? 1 : 0)
    // the teacher on leave sees her own
    expect((await call(tokA, 'GET', `/leave/calendar?month=${month}`)).json.days[slot.date].substitutions.length).toBe(1)
    expect((await call(tokA, 'GET', '/leave/calendar?month=nonsense')).status).toBe(400)
  })
})
