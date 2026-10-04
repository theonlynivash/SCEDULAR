/**
 * Generating a timetable takes about half a minute of pure computation. It must not freeze the server: this starts the REAL
 * server (as `npm run dev` does), starts a generation and keeps asking /api/health meanwhile.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let child: ChildProcess | null = null
const db = path.join(os.tmpdir(), `scedular-worker-${process.pid}.json`)
afterAll(() => { child?.kill(); for (const f of [db, `${db}.tmp`]) try { fs.unlinkSync(f) } catch { /* gone */ } })

describe('timetable generation runs off the main thread', () => {
  it('keeps the server responsive while generating, and the result is the same GREEN timetable', async () => {
    fs.copyFileSync(path.resolve(__dirname, 'fixtures/sample_db.json'), db)
    const port = 18090 + Math.floor(Math.random() * 500)
    child = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), SCEDULAR_DB_FILE: db, VITEST: '', SOLVER_INLINE: '', DATABASE_URL: '', MAIL_TRANSPORT: 'json' }, stdio: 'ignore' })
    const base = `http://127.0.0.1:${port}`
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 500)) }
    const login: any = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json()
    const token = login.token as string
    expect(token).toBeTruthy()

    let slowest = 0, polls = 0, done = false
    const gen = fetch(`${base}/api/timetable/generate`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' }).then(async r => { done = true; return { status: r.status, body: await r.json() as any } })
    await new Promise(r => setTimeout(r, 400))
    while (!done) {
      const t0 = Date.now(); await fetch(`${base}/api/health`); slowest = Math.max(slowest, Date.now() - t0); polls++
      await new Promise(r => setTimeout(r, 150))
    }
    const out = await gen
    expect(out.status).toBe(200)
    expect(out.body.status).toBe('GREEN')
    expect(polls).toBeGreaterThan(10)                    // many requests were answered during the run
    expect(slowest).toBeLessThan(1500)                   // none of them waited for the solver
    // the new run really was stored by the server
    const m: any = await (await fetch(`${base}/api/timetable/master`, { headers: { authorization: `Bearer ${token}` } })).json()
    expect(m.assignments.length).toBeGreaterThan(500)
  }, 240_000)
})
