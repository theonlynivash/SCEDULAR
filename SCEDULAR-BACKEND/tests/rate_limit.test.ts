import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { resetRateLimits } from '../src/auth/rateLimit.js'

let server: Server, base = ''
const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('password guessing is slowed down', () => {
  it('locks an account after 8 failed attempts, still lets the right password in for other accounts, and clears on success', async () => {
    resetRateLimits()
    for (let i = 0; i < 8; i++) expect((await post('/api/auth/login', { facultyId: 'FAC-001', password: 'wrong' + i })).status).toBe(401)
    const locked = await post('/api/auth/login', { facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' })        // even the right password waits
    expect(locked.status).toBe(429)
    expect(((await locked.json()) as any).error).toBe('TOO_MANY_ATTEMPTS')
    // a different account from the same address is not locked
    expect((await post('/api/auth/login', { facultyId: 'FAC-002', password: 'wrong' })).status).toBe(401)   // answered normally, not 429
    resetRateLimits()
    for (let i = 0; i < 5; i++) await post('/api/auth/login', { facultyId: 'FAC-001', password: 'nope' })
    expect((await post('/api/auth/login', { facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' })).status).toBe(200)    // success ...
    for (let i = 0; i < 5; i++) await post('/api/auth/login', { facultyId: 'FAC-001', password: 'nope' })
    expect((await post('/api/auth/login', { facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' })).status).toBe(200)    // ... cleared the count
  })

  it('limits "forgot password" mails to 5 per 15 minutes per account', async () => {
    resetRateLimits()
    for (let i = 0; i < 5; i++) expect((await post('/api/auth/forgot', { identifier: 'FAC-002' })).status).toBe(200)
    expect((await post('/api/auth/forgot', { identifier: 'FAC-002' })).status).toBe(429)
    resetRateLimits()
  })

  it('a pending reset code survives a restart (it is stored with the data) and sessions expire after 30 days', async () => {
    resetRateLimits()
    const { getLocalDb } = await import('../src/db/localDb.js')
    const { listFaculty } = await import('../src/db/repo.js')
    const t = (await listFaculty()).find(f => f.role !== 'HOD')!
    getLocalDb().faculty.find((f: any) => f.id === t.id)!.email = 'keep.code@example.com'
    await post('/api/auth/forgot', { identifier: t.id })
    expect(getLocalDb().passwordResets?.[t.id]?.codeHash).toBeTruthy()
    const token = ((await (await post('/api/auth/login', { facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' })).json()) as any).token
    expect((await fetch(base + '/api/faculty', { headers: { authorization: `Bearer ${token}` } })).status).toBe(200)
    getLocalDb().sessions.find((s: any) => s.token === token)!.createdAt = new Date(Date.now() - 31 * 86_400_000).toISOString()
    expect((await fetch(base + '/api/faculty', { headers: { authorization: `Bearer ${token}` } })).status).toBe(401)
  })
})
