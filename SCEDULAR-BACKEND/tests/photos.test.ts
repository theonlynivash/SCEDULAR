import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

let server: Server, base = ''
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const call = async (p: string, tok: string, method = 'GET', body?: unknown) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, type: r.headers.get('content-type') ?? '', buf: Buffer.from(await r.arrayBuffer()) }
}
const json = (r: { buf: Buffer }) => JSON.parse(r.buf.toString() || '{}')
beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('profile pictures', () => {
  it('a teacher sets their own picture; others see it; only the HOD can change someone else\'s', async () => {
    const { listFaculty } = await import('../src/db/repo.js')
    const { setFacultyPassword } = await import('../src/auth/passwords.js')
    const [a, b] = (await listFaculty()).filter(f => f.role !== 'HOD')
    await setFacultyPassword(a.id, 'Teacher-pass-1'); await setFacultyPassword(b.id, 'Teacher-pass-2')
    const login = async (id: string, pw: string) => (json(await (async () => { const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: id, password: pw }) }); return { buf: Buffer.from(await r.arrayBuffer()) } })()).token as string)
    const ta = await login(a.id, 'Teacher-pass-1'), tb = await login(b.id, 'Teacher-pass-2')
    const hod = await login('FAC-001', 'SCEDULAR_AIDS')

    expect((await call(`/api/faculty/${a.id}/photo`, ta)).status).toBe(404)                          // none yet
    expect((await call(`/api/faculty/${a.id}/photo`, ta, 'PUT', { image: 'not an image' })).status).toBe(400)
    expect((await call(`/api/faculty/${a.id}/photo`, tb, 'PUT', { image: PNG })).status).toBe(403)   // not someone else's
    const put = await call(`/api/faculty/${a.id}/photo`, ta, 'PUT', { image: PNG })
    expect(put.status).toBe(200)
    const at = json(put).photoAt
    expect(at).toBeTruthy()

    const img = await call(`/api/faculty/${a.id}/photo`, tb)                                           // another teacher can see it (chat, lists)
    expect(img.status).toBe(200); expect(img.type).toBe('image/png'); expect(img.buf[1]).toBe(0x50)    // 'P' of PNG
    expect((await call(`/api/faculty/${a.id}/photo`, '')).status).toBe(401)

    // lists carry only the time, never the image data
    const list = json(await call('/api/faculty', hod)) as any[]
    expect(list.find(f => f.id === a.id).photoAt).toBe(at)
    expect(list.find(f => f.id === b.id).photoAt).toBeNull()
    expect(JSON.stringify(list).length).toBeLessThan(2_000_000)
    expect(json(await call('/api/faculty/me', ta)).photoAt).toBe(at)

    // the HOD can set / remove anyone's; the chat thread list shows the picture time
    expect((await call(`/api/faculty/${b.id}/photo`, hod, 'PUT', { image: PNG })).status).toBe(200)
    const threads = json(await call('/api/messages/threads', hod)) as any[]
    expect(threads.find(t => t.id === b.id).photoAt).toBeTruthy()
    expect((await call(`/api/faculty/${b.id}/photo`, hod, 'DELETE')).status).toBe(200)
    expect((await call(`/api/faculty/${b.id}/photo`, hod)).status).toBe(404)

    // too large
    const big = 'data:image/jpeg;base64,' + Buffer.alloc(320 * 1024, 1).toString('base64')
    expect((await call(`/api/faculty/${a.id}/photo`, ta, 'PUT', { image: big })).status).toBe(400)
  })
})
