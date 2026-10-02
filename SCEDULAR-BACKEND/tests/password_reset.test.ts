import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'

process.env.MAIL_TRANSPORT = 'json'
let server: Server, base = ''
let capturedMail: { to: string; text: string }[], listFaculty: () => Promise<any[]>

const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => ({})) as any }
}

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  capturedMail = (await import('../src/mail/mailer.js')).capturedMail
  listFaculty = (await import('../src/db/repo.js')).listFaculty
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
})
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('forgot password', () => {
  it('mails a code to the address on file and resets with it', async () => {
    const f = (await listFaculty()).find(x => x.role !== 'HOD')!
    f.email = 'reset.test@example.com'
    capturedMail.length = 0
    expect((await post('/api/auth/forgot', { identifier: f.id })).status).toBe(200)
    const mail = capturedMail.find(m => m.to === f.email)!
    expect(mail).toBeTruthy()
    const code = /(\d{6})/.exec(mail.text)![1]
    expect((await post('/api/auth/reset', { identifier: f.id, code: '000000', newPassword: 'Newpass-123' })).status).toBe(400)
    expect((await post('/api/auth/reset', { identifier: f.email, code, newPassword: 'Newpass-123' })).status).toBe(200)
    expect((await post('/api/auth/login', { facultyId: f.id, password: 'Newpass-123' })).status).toBe(200)
    const notice = capturedMail.find(m => m.to === f.email && /password was changed/i.test((m as any).subject))
    expect(notice).toBeTruthy()
    expect(notice!.text).not.toContain('Newpass-123')   // the notice never contains the password
  })
  it('answers the same for unknown accounts', async () => {
    const r = await post('/api/auth/forgot', { identifier: 'nobody@nowhere.test' })
    expect(r.status).toBe(200)
    expect(r.body.sentTo).toBeUndefined()
  })
})
