import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('assistant route', () => {
  it('needs a session', async () => {
    const r = await fetch(base + '/api/assistant/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) })
    expect(r.status).toBe(401)
  })
  it('rejects a conversation that does not end with a question', async () => {
    const login = await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json() as any
    const r = await fetch(base + '/api/assistant/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` }, body: JSON.stringify({ messages: [{ role: 'assistant', content: 'hello' }] }) })
    expect(r.status).toBe(400)
  })
  it('the HOD toggle switches the assistant off for teachers only', async () => {
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const t = (await listFaculty()).find(f => f.role !== 'HOD')!
    await setFacultyPassword(t.id, 'Teacher-pass-1')
    const tok = async (id: string, pw: string) => (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: id, password: pw }) })).json() as any).token
    const [hod, teacher] = [await tok('FAC-001', 'SCEDULAR_AIDS'), await tok(t.id, 'Teacher-pass-1')]
    const h = (token: string) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` })
    const cur = await (await fetch(base + '/api/hod/allocation-settings', { headers: h(hod) })).json() as any
    const set = (on: boolean) => fetch(base + '/api/hod/allocation-settings', { method: 'POST', headers: h(hod), body: JSON.stringify({ config: { ...cur.config, facultyAiEnabled: on } }) })
    try {
      await set(false)
      expect((await (await fetch(base + '/api/assistant/status', { headers: h(teacher) })).json() as any).enabled).toBe(false)
      expect((await (await fetch(base + '/api/assistant/status', { headers: h(hod) })).json() as any).enabled).toBe(true)
      const r = await fetch(base + '/api/assistant/chat', { method: 'POST', headers: h(teacher), body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) })
      expect(r.status).toBe(403)
      await set(true)
      expect((await (await fetch(base + '/api/assistant/status', { headers: h(teacher) })).json() as any).enabled).toBe(true)
    } finally { await set(cur.config.facultyAiEnabled ?? true) }
  })
})
