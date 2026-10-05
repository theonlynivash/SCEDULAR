/**
 * Cloud mode (DATABASE_URL set), run against pg-mem, an in-memory PostgreSQL.
 * The department data is one versioned JSON document in the table app_state (profile pictures in faculty_photos).
 * Proves: first start creates it, every change is saved before the response, a "second server instance" sees changes made by the
 * first, a simultaneous save never overwrites newer data (409), a restart loses nothing, and database errors are reported.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Server } from 'node:http'

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/scedular'
delete process.env.USE_LOCAL_DB

const store = vi.hoisted(() => ({ db: null as any }))
vi.mock('pg', async () => {
  const { newDb } = await import('pg-mem')
  if (!store.db) store.db = newDb()
  const { Pool } = store.db.adapters.createPg()
  return { default: { Pool }, Pool }
})

let server: Server, base = '', hod = ''
let first: { getLocalDb: any; saveLocalDb: any; flush: any }   // the FIRST instance's modules (a module reset later creates new ones)
const call = async (method: string, path: string, body?: unknown, token = hod, origin = base) => {
  const r = await fetch(origin + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any }
}
const row = () => store.db.public.one('select version, state from app_state where id = 1') as { version: number; state: any }
const listen = async () => {
  const { app } = await import('../src/app.js')
  let s!: Server
  await new Promise<void>(res => { s = app.listen(0, () => res()) })
  return { s, url: `http://127.0.0.1:${(s.address() as any).port}` }
}

beforeAll(async () => {
  const l = await listen(); server = l.s; base = l.url
  first = { ...(await import('../src/db/localDb.js')), ...(await import('../src/db/sync.js')) }
}, 120_000)
afterAll(() => new Promise<void>(res => server.close(() => res())))

describe('PostgreSQL mode (versioned document store)', () => {
  it('creates the department data on first start and lets the HOD sign in', async () => {
    const login = await call('POST', '/api/auth/login', { facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }, '')
    expect(login.status).toBe(200)
    hod = login.body.token
    const r = row()
    expect(r.version).toBeGreaterThanOrEqual(1)
    expect((r.state.faculty as any[]).length).toBeGreaterThan(10)
    expect((await call('GET', '/api/faculty')).body.length).toBeGreaterThan(10)
  }, 120_000)

  it('saves every change before answering, as a new version', async () => {
    const before = row().version
    const t = await call('POST', '/api/setup/faculty', { name: 'Postgres Test Teacher', allocationExperience: 9, email: 'pg.test@example.com' })
    expect(t.status).toBe(201)
    const after = row()
    expect(after.version).toBeGreaterThan(before)
    expect((after.state.faculty as any[]).some(f => f.name === 'Postgres Test Teacher')).toBe(true)
    // the new teacher's one-time password works (its hash is in the stored document)
    expect((await call('POST', '/api/auth/login', { facultyId: t.body.facultyId, password: t.body.password }, '')).status).toBe(200)
    // a read does not write
    const v = row().version
    await call('GET', '/api/sections')
    expect(row().version).toBe(v)
  }, 60_000)

  it('profile pictures live in their own table', async () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    expect((await call('PUT', '/api/faculty/FAC-001/photo', { image: PNG })).status).toBe(200)
    expect(store.db.public.many('select faculty_id from faculty_photos').map((r: any) => r.faculty_id)).toContain('FAC-001')
    expect(JSON.stringify(row().state)).not.toContain('iVBORw0KGgo')            // not duplicated into the main document
    const img = await fetch(`${base}/api/faculty/FAC-001/photo`, { headers: { authorization: `Bearer ${hod}` } })
    expect(img.status).toBe(200)
  })

  it('a second server instance sees changes made by the first, and a restart loses nothing', async () => {
    vi.resetModules()                                    // a fresh instance of the app = a cold start / another serverless instance
    const second = await listen()
    try {
      const res = await call('GET', '/api/faculty', undefined, hod, second.url)   // the token still works: sessions are stored too
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200)
      const names = res.body.map((f: any) => f.name)
      expect(names).toContain('Postgres Test Teacher')
      // change something through the SECOND instance ...
      expect((await call('POST', '/api/setup/sections', { semester: 'I', count: 1 }, hod, second.url)).status).toBe(201)
      // ... the FIRST instance picks it up on its next request
      const secs = (await call('GET', '/api/sections', undefined, hod, base)).body.map((s: any) => s.id)
      expect(secs).toContain('Y1-A')
    } finally { await new Promise<void>(res => second.s.close(() => res())) }
  }, 120_000)

  it('never overwrites newer data: a save based on an old version is refused and the newer data is kept', async () => {
    const { getLocalDb, saveLocalDb, flush } = first
    // another instance saves a new version behind our back
    const r = row()
    const other = { ...r.state, sections: [...r.state.sections, { id: 'ZZ-OTHER', name: 'written by someone else', year: 'Year 1', semester: 'I', active: true }] }
    store.db.public.none(`update app_state set version = version + 1, state = '${JSON.stringify(other).replace(/'/g, "''")}'::jsonb where id = 1`)
    // we change something locally and try to save without having reloaded
    getLocalDb().sections.push({ id: 'ZZ-MINE', name: 'mine', year: 'Year 1', semester: 'I', active: true } as any)
    saveLocalDb()
    await expect(flush()).rejects.toThrow(/Someone else saved/)
    expect((row().state.sections as any[]).map(s => s.id)).toContain('ZZ-OTHER')       // their data survived
    expect((row().state.sections as any[]).map(s => s.id)).not.toContain('ZZ-MINE')    // ours was refused
    expect(getLocalDb().sections.some((s: any) => s.id === 'ZZ-OTHER')).toBe(true)    // and we reloaded theirs
    expect(getLocalDb().sections.some((s: any) => s.id === 'ZZ-MINE')).toBe(false)
  }, 60_000)

  it('reports a database error instead of pretending it worked', async () => {
    store.db.public.none('drop table app_state')
    const r = await call('POST', '/api/setup/faculty', { name: 'Must Not Be Saved', allocationExperience: 1 })
    expect(r.status).toBe(500)
    expect(r.body.error).toBe('SERVER_ERROR')
  }, 60_000)
})
