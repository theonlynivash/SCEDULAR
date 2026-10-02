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
})
