import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
const call = async (token: string | null, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any }
}
const login = async (facultyId: string, password: string) =>
  (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId, password }) })).json() as any).token as string
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
let hod = '', t1 = '', t2 = ''

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  hod = await login('FAC-001', 'SCEDULAR_AIDS')
  const { listFaculty } = await import('../src/db/repo.js')
  const { setFacultyPassword } = await import('../src/auth/passwords.js')
  const ts = (await listFaculty()).filter(f => f.role !== 'HOD').slice(0, 2)
  await setFacultyPassword(ts[0].id, 'Teacher-pass-A1'); await setFacultyPassword(ts[1].id, 'Teacher-pass-B1')
  t1 = await login(ts[0].id, 'Teacher-pass-A1'); t2 = await login(ts[1].id, 'Teacher-pass-B1')
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('reminders', () => {
  it('need a sign-in, and reject bad input and past dates', async () => {
    expect((await call(null, 'GET', '/reminders')).status).toBe(401)
    expect((await call(t1, 'POST', '/reminders', { date: addDays(3), title: '' })).status).toBe(400)
    expect((await call(t1, 'POST', '/reminders', { date: 'nonsense', title: 'x' })).status).toBe(400)
    expect((await call(t1, 'POST', '/reminders', { date: '2020-01-01', title: 'old' })).status).toBe(400)
    expect((await call(t1, 'POST', '/reminders', { date: addDays(3), title: 'x', time: '25:99' })).status).toBe(400)
  })

  it('are listed soonest first; private ones stay private; only the HOD can post one for everyone', async () => {
    const mk = (tok: string, date: string, title: string, extra: object = {}) => call(tok, 'POST', '/reminders', { date, title, ...extra })
    expect((await mk(t1, addDays(5), 'Event B')).status).toBe(201)
    expect((await mk(t1, addDays(2), 'Event A')).status).toBe(201)
    expect((await mk(t1, addDays(2), 'Event A early', { time: '09:00' })).status).toBe(201)
    expect((await mk(t2, addDays(1), 'Private of t2')).status).toBe(201)
    expect((await mk(t1, addDays(4), 'Notice', { audience: 'all' })).status).toBe(403)
    expect((await mk(hod, addDays(4), 'Faculty meeting', { audience: 'all' })).status).toBe(201)

    const mine = (await call(t1, 'GET', '/reminders')).json as any[]
    expect(mine.map(r => r.title)).toEqual(['Event A early', 'Event A', 'Faculty meeting', 'Event B'])   // by date, then time; the HOD's notice is shared
    expect(mine.some(r => r.title === 'Private of t2')).toBe(false)
    expect((await call(t2, 'GET', '/reminders')).json.map((r: any) => r.title)).toEqual(['Private of t2', 'Faculty meeting'])
    // a date range
    expect((await call(t1, 'GET', `/reminders?from=${addDays(3)}&to=${addDays(4)}`)).json.map((r: any) => r.title)).toEqual(['Faculty meeting'])
  })

  it('can be ticked off, edited and deleted only by their owner (the HOD may remove her notice)', async () => {
    const list = (await call(t1, 'GET', '/reminders')).json as any[]
    const a = list.find(r => r.title === 'Event A'), notice = list.find(r => r.title === 'Faculty meeting')
    expect((await call(t2, 'PUT', `/reminders/${a.id}`, { done: true })).status).toBe(404)          // not visible to t2
    expect((await call(t2, 'PUT', `/reminders/${notice.id}`, { title: 'hijack' })).status).toBe(403)  // visible but not theirs
    const up = await call(t1, 'PUT', `/reminders/${a.id}`, { done: true, title: 'Event A (moved)', date: addDays(6) })
    expect(up.status).toBe(200)
    expect(up.json.done).toBe(true)
    expect((await call(t1, 'GET', '/reminders')).json.at(-1).title).toBe('Event A (moved)')         // moved to the end
    expect((await call(t2, 'DELETE', `/reminders/${a.id}`)).status).toBe(404)
    expect((await call(t1, 'DELETE', `/reminders/${notice.id}`)).status).toBe(403)
    expect((await call(hod, 'DELETE', `/reminders/${notice.id}`)).status).toBe(200)
    expect((await call(t1, 'DELETE', `/reminders/${a.id}`)).status).toBe(200)
  })
})
