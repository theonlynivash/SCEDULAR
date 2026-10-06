import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Server } from 'node:http'

/**
 * Timetable generation under pressure. Every scenario starts from the same sample department (with every theory + lab pair
 * combined, as the HOD does), bends the data in a nasty way, generates, and then checks the answer with a checker of its OWN
 * (not the solver's validator): whatever comes back must be either a clash-free timetable that meets every requirement, or a
 * clear explanation. It must never crash and never claim GREEN while something is wrong.
 */
// impossible scenarios must still end quickly and honestly: cap each search at 15 seconds (the real default is 3 minutes)
process.env.SOLVER_TIME_LIMIT_MS = '15000'

let server: Server, base = '', token = '', pristine: any
const api = (path: string, init: any = {}) => fetch(base + '/api' + path, { ...init, headers: { 'content-type': 'application/json', connection: 'close', authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })

const BLOCKS = [[1, 3], [4, 5], [6, 8]]   // tea after P3, lunch after P5: a lab block never crosses them

beforeAll(async () => {
  const { app } = await import('../src/app.js')
  await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res() }) })
  token = ((await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyId: 'FAC-001', password: 'SCEDULAR_AIDS' }) })).json()) as any).token
  // combine every theory + lab pair, exactly like the Subjects tab does
  const pairs = (await (await api('/setup/subjects/merge-candidates')).json()) as any[]
  for (const p of pairs) expect((await api('/setup/subjects/merge-lab', { method: 'POST', body: JSON.stringify({ theoryId: p.theoryId, labId: p.labId }) })).status).toBe(200)
  const { getLocalDb } = await import('../src/db/localDb.js')
  pristine = structuredClone(getLocalDb())
})
afterAll(() => new Promise<void>(res => server.close(() => res())))
beforeEach(async () => {
  const { installState } = await import('../src/db/localDb.js')
  installState(structuredClone(pristine))
})

async function db() { return (await import('../src/db/localDb.js')).getLocalDb() as any }
async function readyScopes() {
  const { getSemesterReadinessStatus } = await import('../src/db/repo.js')
  return (await getSemesterReadinessStatus()).filter(r => r.canGenerate).map(r => ({ year: r.year, semester: r.semester }))
}
async function generate(scopes: { year: string; semester: string }[]) {
  const { generateTimetable } = await import('../src/solver/pipeline.js')
  const t0 = Date.now()
  const r = await generateTimetable(scopes)
  console.log(`GEN ${scopes.map(x => x.semester).join('+')} ${r.status} ${Date.now() - t0}ms`)
  return r
}

/** returns the list of everything wrong with a GREEN result (empty = perfect) */
async function audit(result: any, scopes: { semester: string }[]): Promise<string[]> {
  const d = await db(), bad: string[] = []
  const wantSem = new Set(scopes.map(s => s.semester))
  const A: any[] = result.assignments
  const seen = { section: new Map<string, string>(), teacher: new Map<string, string>(), room: new Map<string, string>() }
  const unavail = new Set((d.facultyUnavailability ?? []).map((u: any) => `${u.facultyId}|${u.day}|${u.period}`))
  const ssById = new Map<number, any>(d.sectionSubjects.map((s: any) => [s.id, s]))
  const roomsFor = (subjectId: string, sectionId: string) => d.labMappings.filter((m: any) => m.subjectId === subjectId && (m.sectionId === sectionId || !m.sectionId)).map((m: any) => m.labId)
  const placed = new Map<string, { theory: number; lab: number }>()
  for (const a of A) {
    const tag = `${a.sectionId}/${a.subjectId ?? a.courseId} ${a.day} P${a.startPeriod}-${a.endPeriod}`
    if (a.endPeriod < a.startPeriod) bad.push(`${tag}: backwards block`)
    if (a.blockType === 'LAB' && !BLOCKS.some(([s, e]) => a.startPeriod >= s && a.endPeriod <= e)) bad.push(`${tag}: lab crosses tea/lunch`)
    if (a.blockType === 'THEORY' && a.endPeriod !== a.startPeriod) bad.push(`${tag}: theory longer than one period`)
    for (let p = a.startPeriod; p <= a.endPeriod; p++) {
      const slot = `${a.day}|${p}`
      const clash = (m: Map<string, string>, key: string, what: string) => { if (m.has(key)) bad.push(`${what} clash at ${slot}: ${key} (${m.get(key)} vs ${tag})`); else m.set(key, tag) }
      clash(seen.section, `${a.sectionId}|${slot}`, 'section')
      clash(seen.teacher, `${a.facultyId}|${slot}`, 'teacher')
      if (a.labId) clash(seen.room, `${a.labId}|${slot}`, 'lab room')
      if (unavail.has(`${a.facultyId}|${a.day}|${p}`)) bad.push(`${tag}: ${a.facultyId} was marked unavailable`)
    }
    if (a.blockType === 'LAB') {
      if (!a.labId) bad.push(`${tag}: lab block without a room`)
      else if (!roomsFor(a.subjectId ?? a.courseId, a.sectionId).includes(a.labId)) bad.push(`${tag}: room ${a.labId} is not one of the rooms set for it`)
    }
    // the teacher placed must be the one assigned to that offering (theory and lab of a combined subject: the same person)
    const ss = a.sectionSubjectId != null ? ssById.get(a.sectionSubjectId) : undefined
    if (ss) {
      const owners = d.teachingAssignments.filter((t: any) => t.sectionSubjectId === ss.id && t.component === a.blockType).map((t: any) => t.facultyId)
      if (owners.length && !owners.includes(a.facultyId)) bad.push(`${tag}: ${a.facultyId} is not an assigned ${a.blockType} teacher (${owners.join('/')})`)
      const cur = placed.get(String(ss.id)) ?? { theory: 0, lab: 0 }
      const n = a.endPeriod - a.startPeriod + 1
      if (a.blockType === 'THEORY') cur.theory += n; else cur.lab += n
      placed.set(String(ss.id), cur)
    }
  }
  // every requirement of every generated section is met exactly
  const secById = new Map<string, any>(d.sections.map((s: any) => [s.id, s]))
  for (const ss of d.sectionSubjects) {
    const sec = secById.get(ss.sectionId)
    if (!sec || sec.active === false || !wantSem.has(sec.semester)) continue
    const got = placed.get(String(ss.id)) ?? { theory: 0, lab: 0 }
    if (got.theory !== (ss.theoryPeriods ?? 0)) bad.push(`${ss.sectionId}/${ss.subjectId}: theory ${got.theory} of ${ss.theoryPeriods}`)
    if (got.lab !== (ss.labPeriods ?? 0)) bad.push(`${ss.sectionId}/${ss.subjectId}: lab ${got.lab} of ${ss.labPeriods}`)
  }
  return bad
}

/** a non-GREEN answer must say why */
function expectExplained(r: any) {
  expect(['GREEN', 'YELLOW', 'RED']).toContain(r.status)
  if (r.status !== 'GREEN') expect(r.conflicts.length + r.unscheduled.length).toBeGreaterThan(0)
}

describe('combined theory + lab subjects', () => {
  it('Combine keeps every lab room, so every combined subject is ready and generates', async () => {
    const d = await db()
    const integrated = d.subjects.filter((s: any) => s.deliveryType === 'INTEGRATED')
    expect(integrated.length).toBeGreaterThan(0)
    for (const s of d.subjects.filter((x: any) => x.deliveryType === 'LAB')) {
      // no leftover separate lab for a combined pair
      expect(integrated.some((i: any) => i.name.replace(/\s*laborator(y|ies)|\s*lab$/i, '').trim() === s.name.replace(/\s*laborator(y|ies)|\s*lab$/i, '').trim() && i.semester === s.semester)).toBe(false)
    }
    const scopes = await readyScopes()
    expect(scopes.length).toBeGreaterThan(0)
  })
})

describe('every ready semester generates a perfect timetable', () => {
  it('each one on its own', async () => {
    const scopes = await readyScopes()
    for (const s of scopes) {
      const r = await generate([s])
      expect(r.status, `${s.year} ${s.semester}`).toBe('GREEN')
      expect(await audit(r, [s])).toEqual([])
    }
  }, 240_000)

  // The whole department in one run is the heaviest case (about a minute or two). Opt in with STRESS_FULL=1.
  it.skipIf(!process.env.STRESS_FULL)('all ready semesters together', async () => {
    const scopes = await readyScopes()
    process.env.SOLVER_TIME_LIMIT_MS = '170000'
    try {
      const all = await generate(scopes)
      expect(all.status).toBe('GREEN')
      expect(await audit(all, scopes)).toEqual([])
    } finally { process.env.SOLVER_TIME_LIMIT_MS = '15000' }
  }, 400_000)
})

describe('edge cases', () => {
  it('a section with no room for a combined subject is blocked with a message naming it', async () => {
    const d = await db()
    const integ = d.subjects.find((s: any) => s.deliveryType === 'INTEGRATED' && d.sections.some((x: any) => x.semester === s.semester && d.labMappings.some((m: any) => m.subjectId === s.id && m.sectionId === x.id)))
    const m = d.labMappings.find((x: any) => x.subjectId === integ.id && x.sectionId)
    d.labMappings = d.labMappings.filter((x: any) => !(x.subjectId === integ.id && x.sectionId === m.sectionId))
    const { getSemesterReadinessStatus } = await import('../src/db/repo.js')
    const rd = (await getSemesterReadinessStatus()).find(r => r.semester === integ.semester)!
    expect(rd.canGenerate).toBe(false)
    expect(rd.missingItems.join(' ')).toContain(m.sectionId)
    const res = await api('/timetable/generate', { method: 'POST', body: JSON.stringify({ year: rd.year, semester: rd.semester }) })
    expect(res.status).toBe(422)
  })

  it('teachers who are unavailable at many times: GREEN that honours it, or a clear explanation', async () => {
    const d = await db()
    const scopes = (await readyScopes()).filter(x => x.semester === 'III')
    const busy = [...new Set(d.teachingAssignments.map((t: any) => t.facultyId))].slice(0, 10) as string[]
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    d.facultyUnavailability = []
    for (const f of busy) for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI']) for (let p = 1; p <= 8; p++) if (rnd() < 0.25) d.facultyUnavailability.push({ facultyId: f, day, period: p })
    const r = await generate(scopes)
    expectExplained(r)
    if (r.status === 'GREEN') expect(await audit(r, scopes)).toEqual([])
  }, 240_000)

  it('a single room for every lab of a semester: no room is ever double-booked', async () => {
    const d = await db()
    const scopes = await readyScopes()
    const s = scopes.find(x => x.semester === 'III')!
    const subjIds = new Set(d.subjects.filter((x: any) => x.semester === s.semester).map((x: any) => x.id))
    const keep = d.labMappings.find((m: any) => subjIds.has(m.subjectId))?.labId
    d.labMappings = d.labMappings.map((m: any) => subjIds.has(m.subjectId) ? { ...m, labId: keep } : m)
    const r = await generate([s])
    expectExplained(r)
    if (r.status === 'GREEN') expect(await audit(r, [s])).toEqual([])
  }, 240_000)

  it('only one active section in a semester', async () => {
    const d = await db()
    const s = (await readyScopes()).find(x => x.semester === 'III')!
    const mine = d.sections.filter((x: any) => x.semester === s.semester)
    mine.slice(1).forEach((x: any) => { x.active = false })
    const r = await generate([s])
    expect(r.status).toBe('GREEN')
    expect(await audit(r, [s])).toEqual([])
  })

  it('teachers with a very low weekly limit: explained, never a bad GREEN', async () => {
    const d = await db()
    const scopes = (await readyScopes()).filter(x => x.semester === 'III')
    for (const f of d.faculty) f.maxWeeklyPeriods = 6
    const r = await generate(scopes)
    expectExplained(r)
    if (r.status === 'GREEN') expect(await audit(r, scopes)).toEqual([])
  }, 240_000)

  it('a lab block longer than a lab session can ever be (labBlockLength 9) is rejected clearly', async () => {
    const d = await db()
    const s = (await readyScopes()).find(x => x.semester === 'III')!
    const ss = d.sectionSubjects.find((x: any) => (x.labPeriods ?? 0) > 0 && d.sections.find((y: any) => y.id === x.sectionId)?.semester === s.semester)
    ss.labBlockLength = 9
    const r = await generate([s])
    expectExplained(r)
    expect(r.status).not.toBe('GREEN')
  })

  it('running generation twice gives the same kind of answer (deterministic)', async () => {
    const s = (await readyScopes()).find(x => x.semester === 'III')!
    const a = await generate([s]), b = await generate([s])
    expect(b.status).toBe(a.status)
    expect(b.assignments.length).toBe(a.assignments.length)
  })
})
