import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
const call = async (path: string, token: string | null, method = 'GET', body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: await r.json().catch(() => ({})) as any }
}
beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('HOD <-> teacher messages', () => {
  it('delivers both ways, counts unread, restricts teachers to the HOD and deletes after 30 days', async () => {
    const { listFaculty, setFacultyPasswordForTest } = await import('../src/db/repo.js') as any
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const { getLocalDb } = await import('../src/db/localDb.js')
    getLocalDb().messages = []   // the private DB copy may already hold real messages
    const fac = await listFaculty()
    const hod = fac.find((f: any) => f.role === 'HOD'), t1 = fac.find((f: any) => f.role !== 'HOD'), t2 = fac.filter((f: any) => f.role !== 'HOD')[1]
    void setFacultyPasswordForTest
    await setFacultyPassword(t1.id, 'Teacher-pass-1')
    const hodTok = (await call('/api/auth/login', null, 'POST', { facultyId: hod.id, password: 'SCEDULAR_AIDS' })).body.token
    const tTok = (await call('/api/auth/login', null, 'POST', { facultyId: t1.id, password: 'Teacher-pass-1' })).body.token

    expect((await call('/api/messages/unread', null)).status).toBe(401)
    expect((await call('/api/messages', hodTok, 'POST', { toId: t1.id, text: 'Please submit your results' })).status).toBe(201)
    expect((await call('/api/messages/unread', tTok)).body.count).toBe(1)
    const th = await call(`/api/messages/thread/${hod.id}`, tTok)
    expect(th.body.map((m: any) => m.text)).toEqual(['Please submit your results'])
    expect((await call('/api/messages/unread', tTok)).body.count).toBe(0)
    expect((await call('/api/messages', tTok, 'POST', { toId: hod.id, text: 'Done, sir' })).status).toBe(201)
    expect((await call('/api/messages', tTok, 'POST', { toId: t2.id, text: 'hi' })).status).toBe(403)
    const threads = await call('/api/messages/threads', hodTok)
    expect(threads.body.find((x: any) => x.id === t1.id)).toMatchObject({ unread: 1, lastText: 'Done, sir' })

    // age the first message past 30 days: it disappears on the next read
    const db = getLocalDb()
    db.messages[0].sentAt = new Date(Date.now() - 31 * 86_400_000).toISOString()
    const after = await call(`/api/messages/thread/${t1.id}`, hodTok)
    expect(after.body.map((m: any) => m.text)).toEqual(['Done, sir'])
  })
})
