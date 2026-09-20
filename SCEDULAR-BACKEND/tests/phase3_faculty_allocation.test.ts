import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { app } from '../src/app.js'
import { getLocalDb, saveLocalDbSync } from '../src/db/localDb.js'
import { resetWorkflowStateRepo, getCurrentAcademicCycle, setCurrentAcademicCycle } from '../src/db/repo.js'
import type { Server } from 'node:http'

let server: Server
let baseUrl: string

const PASSWORD = 'SCEDULAR_AIDS'
const FACULTY = 'FAC-002' // Dr.A.JOSHI — FACULTY
const HOD = 'FAC-001' // Dr.S.MALATHI — HOD

// Canonical seed subjects (verified against data/scedular_local_db.json).
// The current academic cycle is EVEN, so the allocation-workflow happy paths use
// EVEN-semester subjects (Sem IV = Year 2, Sem VI = Year 3). ODD subjects are
// only used to prove the cycle gate rejects them under the EVEN cycle.
const SEM4_Y2_THEORY_A = 'SUB-23MA1405' // Year 2, Semester IV, THEORY (EVEN)
const SEM4_Y2_THEORY_B = 'SUB-23AD1401' // Year 2, Semester IV, THEORY (EVEN)
const SEM6_Y3_THEORY = 'SUB-23AD1601' // Year 3, Semester VI, THEORY (EVEN)
const SEM4_Y2_INTEGRATED = 'SUB-23AD1404' // Year 2, Semester IV, INTEGRATED (EVEN)
const SEM3_Y2_THEORY_ODD = 'SUB-23MA1304' // Year 2, Semester III, THEORY (ODD)

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') baseUrl = `http://localhost:${addr.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  // Every test starts from a clean transactional state (no leftover preferences),
  // with FAC-002's allocation experience unset, and the academic cycle reset to
  // the canonical EVEN default so cycle-mutating tests never leak into others.
  await resetWorkflowStateRepo()
  await setCurrentAcademicCycle('EVEN')
  const db = getLocalDb()
  const f = db.faculty.find((x) => x.id === FACULTY)
  if (f) {
    delete (f as any).previousExperience
    delete (f as any).currentExperience
    delete (f as any).allocationExperience
  }
  saveLocalDbSync()
})

afterAll(async () => {
  // Restore the pristine seed: no test preferences, no injected experience, and
  // the academic cycle back to its canonical EVEN default.
  await resetWorkflowStateRepo()
  await setCurrentAcademicCycle('EVEN')
  const db = getLocalDb()
  for (const id of [FACULTY, HOD]) {
    const f = db.faculty.find((x) => x.id === id)
    if (f) {
      delete (f as any).previousExperience
      delete (f as any).currentExperience
      delete (f as any).allocationExperience
    }
  }
  saveLocalDbSync()
  await new Promise<void>((resolve) => {
    if (server) server.close(() => resolve())
    else resolve()
  })
})

async function login(facultyId: string, password: string = PASSWORD) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ facultyId, password }),
  })
  const body: any = await res.json().catch(() => ({}))
  return { status: res.status, body, token: body?.token as string | undefined }
}

async function authed(path: string, token: string | null | undefined, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  const body: any = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

/** Set allocation experience directly on the canonical DB record (source of truth). */
function setAllocationExperience(facultyId: string, years: number | null) {
  const db = getLocalDb()
  const f = db.faculty.find((x) => x.id === facultyId)
  if (!f) throw new Error(`faculty ${facultyId} missing from seed`)
  if (years === null) delete (f as any).allocationExperience
  else (f as any).allocationExperience = years
  saveLocalDbSync()
}

function item(subjectId: string, rank: number, requestedSections: number, extra: Record<string, any> = {}) {
  return { subjectId, preferenceRank: rank, requestedSections, ...extra }
}

describe('Phase 3 — Real Faculty Subject Allocation Workflow', () => {
  // 1. Authenticated faculty profile is resolved from the session, not a fallback.
  it('1: an authenticated faculty loads their real profile from the session', async () => {
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/me', token)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(FACULTY)
    expect(res.body.name).toBe('Dr.A.JOSHI')
    expect(res.body.role).toBe('FACULTY')

    // No session → no profile (identity is never defaulted).
    const anon = await authed('/api/faculty/me', null)
    expect(anon.status).toBe(401)
  })

  // 2. The subject catalog is filtered to the requested semester.
  it('2: GET /faculty/subjects returns only subjects for the requested semester', async () => {
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/subjects?semester=III', token)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.subjects)).toBe(true)
    expect(res.body.subjects.length).toBeGreaterThan(0)
    for (const s of res.body.subjects) {
      expect(s.semester).toBe('III')
    }
  })

  // 3. Semester III resolves to Year 2 and only Semester III subjects.
  it('3: Semester III maps to Year 2 and never leaks other semesters', async () => {
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/subjects?semester=III', token)
    expect(res.body.semester).toBe('III')
    expect(res.body.year).toBe('Year 2')
    expect(res.body.subjects.every((s: any) => s.semester === 'III' && s.year === 'Year 2')).toBe(true)
  })

  // 4. Semester IV resolves to Year 2 and only Semester IV subjects.
  it('4: Semester IV maps to Year 2 and returns only Semester IV subjects', async () => {
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/subjects?semester=IV', token)
    expect(res.status).toBe(200)
    expect(res.body.semester).toBe('IV')
    expect(res.body.year).toBe('Year 2')
    expect(res.body.subjects.every((s: any) => s.semester === 'IV')).toBe(true)
  })

  // 5. ODD / EVEN / BOTH are first-class academic-cycle contexts — accepted here
  //    and resolved to their specific semesters. A missing or nonsense value is
  //    still rejected.
  it('5: cycle values (BOTH/ODD/EVEN) resolve to subjects; missing/invalid are 400', async () => {
    const { token } = await login(FACULTY)

    const even = await authed('/api/faculty/subjects?semester=EVEN', token)
    expect(even.status).toBe(200)
    expect(even.body.cycle).toBe('EVEN')
    expect(even.body.semesters).toEqual(['II', 'IV', 'VI', 'VIII'])
    expect(even.body.subjects.length).toBeGreaterThan(0)
    expect(even.body.subjects.every((s: any) => ['II', 'IV', 'VI', 'VIII'].includes(s.semester))).toBe(true)

    const odd = await authed('/api/faculty/subjects?semester=ODD', token)
    expect(odd.status).toBe(200)
    expect(odd.body.subjects.every((s: any) => ['I', 'III', 'V', 'VII'].includes(s.semester))).toBe(true)

    const both = await authed('/api/faculty/subjects?semester=BOTH', token)
    expect(both.status).toBe(200)
    expect(both.body.subjects.every((s: any) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'].includes(s.semester))).toBe(true)

    const missing = await authed('/api/faculty/subjects', token)
    expect(missing.status).toBe(400)
    expect(missing.body.error).toBe('MISSING_SEMESTER')

    const nonsense = await authed('/api/faculty/subjects?semester=IX', token)
    expect(nonsense.status).toBe(400)
    expect(nonsense.body.error).toBe('INVALID_SEMESTER')
  })

  // 6. Policy band 0–9 years.
  it('6: 0–9 years allocation experience → Year 1/2 eligible, max 1 preference', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/allocation-policy', token)
    expect(res.status).toBe(200)
    expect(res.body.allocationExperience).toBe(5)
    expect(res.body.policy.eligibleYears).toEqual(expect.arrayContaining(['Year 1', 'Year 2']))
    expect(res.body.policy.eligibleYears).not.toContain('Year 3')
    expect(res.body.policy.eligibleYears).not.toContain('Year 4')
    expect(res.body.policy.maxTotalPreferences).toBe(1)
    expect(res.body.policy.maxPreferencesPerYear).toBe(1)
  })

  // 7. Policy band 10–<13 years.
  it('7: 10–<13 years → Year 2/3/4 eligible, Year 1 locked, max 2 (1 per year)', async () => {
    setAllocationExperience(FACULTY, 11)
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/allocation-policy', token)
    expect(res.body.policy.eligibleYears).toEqual(expect.arrayContaining(['Year 2', 'Year 3', 'Year 4']))
    expect(res.body.policy.eligibleYears).not.toContain('Year 1')
    expect(res.body.policy.lockedYears).toContain('Year 1')
    expect(res.body.policy.maxTotalPreferences).toBe(2)
    expect(res.body.policy.maxPreferencesPerYear).toBe(1)
  })

  // 8. Policy band 13+ years.
  it('8: 13+ years → Year 3/4 eligible, Year 1/2 locked, max 2 (1 per year)', async () => {
    setAllocationExperience(FACULTY, 15)
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/allocation-policy', token)
    expect(res.body.policy.eligibleYears).toEqual(expect.arrayContaining(['Year 3', 'Year 4']))
    expect(res.body.policy.eligibleYears).not.toContain('Year 1')
    expect(res.body.policy.eligibleYears).not.toContain('Year 2')
    expect(res.body.policy.maxTotalPreferences).toBe(2)
    expect(res.body.policy.maxPreferencesPerYear).toBe(1)
  })

  // 9. Total preference count is capped by policy on the backend.
  it('9: submitting more preferences than the band allows is rejected (400 POLICY_VIOLATION)', async () => {
    setAllocationExperience(FACULTY, 5) // maxTotal 1
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({
        items: [item(SEM4_Y2_THEORY_A, 1, 2), item(SEM4_Y2_THEORY_B, 2, 2)],
      }),
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('POLICY_VIOLATION')
  })

  // 10. At most one preference per academic year.
  it('10: two preferences in the same academic year are rejected (400 POLICY_VIOLATION)', async () => {
    setAllocationExperience(FACULTY, 11) // maxTotal 2, maxPerYear 1
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({
        items: [item(SEM4_Y2_THEORY_A, 1, 2), item(SEM4_Y2_THEORY_B, 2, 2)], // both Year 2
      }),
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('POLICY_VIOLATION')
  })

  // 10b. A valid cross-year batch within policy is accepted.
  it('10b: a valid two-year batch (Year 2 + Year 3) within policy is accepted', async () => {
    setAllocationExperience(FACULTY, 11)
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({
        items: [item(SEM4_Y2_THEORY_A, 1, 2), item(SEM6_Y3_THEORY, 2, 1)],
      }),
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DRAFT')
    expect(res.body.preferences).toHaveLength(2)
  })

  // 11. Requested section capacity is bounded on the backend.
  it('11: requested section capacity must be 1..maxSections (400 INVALID_REQUESTED_SECTIONS)', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)
    const tooMany = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 999)] }), // far above any real Year 2 Sem IV section count
    })
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.error).toBe('INVALID_REQUESTED_SECTIONS')

    const zero = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 0)] }),
    })
    expect(zero.status).toBe(400)
    expect(zero.body.error).toBe('INVALID_REQUESTED_SECTIONS')
  })

  // 12. INTEGRATED subjects require explicit lab confirmation.
  it('12: an INTEGRATED subject without lab confirmation is blocked, with it is accepted', async () => {
    setAllocationExperience(FACULTY, 5) // Year 2 eligible
    const { token } = await login(FACULTY)
    const blocked = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_INTEGRATED, 1, 1)] }),
    })
    expect(blocked.status).toBe(400)
    expect(blocked.body.error).toBe('INTEGRATED_LAB_REQUIRED')

    const ok = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_INTEGRATED, 1, 1, { labConfirmed: true })] }),
    })
    expect(ok.status).toBe(200)
    expect(ok.body.preferences[0].labConfirmed).toBe(true)
  })

  // 13. A DRAFT persists and survives a re-read (refresh).
  it('13: a saved DRAFT persists and is returned on re-read', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)
    const save = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 3)] }),
    })
    expect(save.status).toBe(200)
    expect(save.body.status).toBe('DRAFT')

    const read1 = await authed('/api/faculty/preferences', token)
    expect(read1.body.preferences).toHaveLength(1)
    expect(read1.body.preferences[0].status).toBe('DRAFT')
    expect(read1.body.preferences[0].subjectId).toBe(SEM4_Y2_THEORY_A)

    // Simulate a page refresh: a brand-new session for the same faculty.
    const { token: token2 } = await login(FACULTY)
    const read2 = await authed('/api/faculty/preferences', token2)
    expect(read2.body.preferences).toHaveLength(1)
    expect(read2.body.preferences[0].requestedSections).toBe(3)
  })

  // 14. Submitting transitions DRAFT → SUBMITTED.
  it('14: submitting a valid batch transitions it to SUBMITTED', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/preferences/submit', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 2)] }),
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('SUBMITTED')
    const read = await authed('/api/faculty/preferences', token)
    expect(read.body.preferences[0].status).toBe('SUBMITTED')
  })

  // 15. A SUBMITTED batch is locked against further editing.
  it('15: a SUBMITTED batch cannot be edited again (409 PREFERENCES_LOCKED)', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)
    await authed('/api/faculty/preferences/submit', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 2)] }),
    })
    const editDraft = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_B, 1, 2)] }),
    })
    expect(editDraft.status).toBe(409)
    expect(editDraft.body.error).toBe('PREFERENCES_LOCKED')

    const editSubmit = await authed('/api/faculty/preferences/submit', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_B, 1, 2)] }),
    })
    expect(editSubmit.status).toBe(409)
  })

  // 16. An APPROVED batch is locked against editing.
  it('16: an APPROVED preference cannot be edited by the faculty (409)', async () => {
    setAllocationExperience(FACULTY, 5)
    const fac = await login(FACULTY)
    const submit = await authed('/api/faculty/preferences/submit', fac.token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 2)] }),
    })
    const prefId = submit.body.preferences[0].id

    const hod = await login(HOD)
    const review = await authed(`/api/hod/preferences/${prefId}/review`, hod.token, {
      method: 'POST',
      body: JSON.stringify({ status: 'APPROVED', comment: 'ok', reviewerId: HOD }),
    })
    expect(review.status).toBe(200)
    expect(review.body.preference.status).toBe('APPROVED')

    const edit = await authed('/api/faculty/preferences/draft', fac.token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_B, 1, 2)] }),
    })
    expect(edit.status).toBe(409)
    expect(edit.body.error).toBe('PREFERENCES_LOCKED')
  })

  // 17. CHANGES_REQUESTED re-opens editing for the faculty.
  it('17: after CHANGES_REQUESTED the faculty may edit again (200)', async () => {
    setAllocationExperience(FACULTY, 5)
    const fac = await login(FACULTY)
    const submit = await authed('/api/faculty/preferences/submit', fac.token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 2)] }),
    })
    const prefId = submit.body.preferences[0].id

    const hod = await login(HOD)
    const review = await authed(`/api/hod/preferences/${prefId}/review`, hod.token, {
      method: 'POST',
      body: JSON.stringify({ status: 'CHANGES_REQUESTED', comment: 'revise', reviewerId: HOD }),
    })
    expect(review.status).toBe(200)

    const edit = await authed('/api/faculty/preferences/draft', fac.token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_B, 1, 4)] }),
    })
    expect(edit.status).toBe(200)
    expect(edit.body.status).toBe('DRAFT')
    expect(edit.body.preferences[0].subjectId).toBe(SEM4_Y2_THEORY_B)
  })

  // 18. Identity is enforced — a faculty cannot act as another faculty.
  it('18: a client-supplied facultyId that differs from the session is rejected (403)', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)
    const write = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ facultyId: 'FAC-003', items: [item(SEM4_Y2_THEORY_A, 1, 2)] }),
    })
    expect(write.status).toBe(403)
    expect(write.body.error).toBe('IDENTITY_MISMATCH')

    const read = await authed('/api/faculty/preferences?facultyId=FAC-003', token)
    expect(read.status).toBe(403)
    expect(read.body.error).toBe('IDENTITY_MISMATCH')
  })

  // 19. Interest counts are derived from real persisted preferences, names hidden.
  it('19: subject interest count is DB-derived and hides private faculty names', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)

    const before = await authed('/api/faculty/subject-demand?semester=IV', token)
    const beforeItem = before.body.demand.find((d: any) => d.subjectId === SEM4_Y2_THEORY_A)
    expect(beforeItem.interestCount).toBe(0)
    expect(beforeItem.interestedFacultyList).toBeUndefined()

    await authed('/api/faculty/preferences/submit', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 2)] }),
    })

    const after = await authed('/api/faculty/subject-demand?semester=IV', token)
    const afterItem = after.body.demand.find((d: any) => d.subjectId === SEM4_Y2_THEORY_A)
    expect(afterItem.interestCount).toBe(1)
    expect(afterItem.facultyInterestedCount).toBe(1)
    // Faculty-facing demand must never expose who is interested.
    expect(afterItem.interestedFacultyList).toBeUndefined()
  })

  // 20. The catalog is canonical DB data — no mock/static subjects.
  it('20: the subject catalog exactly matches canonical DB records (no mock data)', async () => {
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/subjects?semester=III', token)
    const apiIds = res.body.subjects.map((s: any) => s.id).sort()

    const db = getLocalDb()
    const dbIds = db.subjects
      .filter((s: any) => s.semester === 'III')
      .map((s: any) => s.id)
      .sort()

    expect(apiIds).toEqual(dbIds)
    expect(apiIds.length).toBeGreaterThan(0)
    // Every card exposes the canonical fields; none are fabricated lab duplicates.
    for (const s of res.body.subjects) {
      expect(s).toHaveProperty('code')
      expect(s).toHaveProperty('name')
      expect(s).toHaveProperty('deliveryType')
      expect((s as any).relatedLabCode).toBeUndefined()
      expect((s as any).relatedLabName).toBeUndefined()
    }
  })
})

// ── Phase 3 Correction: ODD / EVEN / BOTH academic cycle ──────────────────────
// The current cycle is DB-configurable and defaults to EVEN. The faculty
// allocation workflow must expose only the current cycle's specific semesters,
// the backend must enforce that gate (frontend filtering alone is not trusted),
// explicit specific-semester access is preserved, and canonical subject records
// are never duplicated per cycle.
describe('Phase 3 Correction — ODD/EVEN academic cycle', () => {
  // C1. The current cycle is EVEN by configuration, exposing II/IV/VI/VIII.
  it('C1: current cycle is EVEN and exposes exactly II, IV, VI, VIII', async () => {
    expect(await getCurrentAcademicCycle()).toBe('EVEN')
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/cycle-context', token)
    expect(res.status).toBe(200)
    expect(res.body.currentCycle).toBe('EVEN')
    expect(res.body.allowedSemesters).toEqual(['II', 'IV', 'VI', 'VIII'])
    expect(res.body.oddSemesters).toEqual(['I', 'III', 'V', 'VII'])
    expect(res.body.evenSemesters).toEqual(['II', 'IV', 'VI', 'VIII'])
    expect(res.body.allSemesters).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'])
  })

  // C2. allocation-policy carries the same cycle context the workflow renders from.
  it('C2: allocation-policy reports currentCycle EVEN and its allowed semesters', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/allocation-policy', token)
    expect(res.body.currentCycle).toBe('EVEN')
    expect(res.body.allowedSemesters).toEqual(['II', 'IV', 'VI', 'VIII'])
  })

  // C3. An ODD semester cannot accidentally enter the current EVEN allocation context.
  it('C3: an ODD-semester subject is rejected under the EVEN cycle (400 CYCLE_MISMATCH)', async () => {
    setAllocationExperience(FACULTY, 5) // Year 2 eligible, so only the cycle gate blocks it
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM3_Y2_THEORY_ODD, 1, 2)] }),
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('CYCLE_MISMATCH')
  })

  // C4. An EVEN semester remains fully available under the EVEN cycle.
  it('C4: an EVEN-semester subject is accepted under the EVEN cycle', async () => {
    setAllocationExperience(FACULTY, 5)
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/preferences/draft', token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 2)] }),
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DRAFT')
    expect(res.body.preferences[0].semester).toBe('IV')
  })

  // C5. Explicit specific-semester access is preserved regardless of cycle, and
  //     the response flags whether that semester is in the current cycle.
  it('C5: explicit GET /faculty/subjects?semester=III still works under EVEN and is flagged out-of-cycle', async () => {
    const { token } = await login(FACULTY)
    const res = await authed('/api/faculty/subjects?semester=III', token)
    expect(res.status).toBe(200)
    expect(res.body.semester).toBe('III')
    expect(res.body.currentCycle).toBe('EVEN')
    expect(res.body.cycle).toBe('ODD')
    expect(res.body.inCurrentCycle).toBe(false)

    const even = await authed('/api/faculty/subjects?semester=IV', token)
    expect(even.body.inCurrentCycle).toBe(true)
  })

  // C6. An explicit HOD academic-cycle context override switches the exposed semesters.
  it('C6: HOD can set the cycle to ODD (exposes I/III/V/VII) and to BOTH (exposes I–VIII)', async () => {
    const hod = await login(HOD)

    const toOdd = await authed('/api/hod/academic-cycle', hod.token, {
      method: 'POST',
      body: JSON.stringify({ cycle: 'ODD', password: 'SCEDULAR_AIDS' }),
    })
    expect(toOdd.status).toBe(200)
    expect(toOdd.body.currentCycle).toBe('ODD')
    expect(toOdd.body.allowedSemesters).toEqual(['I', 'III', 'V', 'VII'])
    expect(await getCurrentAcademicCycle()).toBe('ODD')

    // Under ODD, the previously-blocked ODD subject is now allowed and the EVEN one is not.
    setAllocationExperience(FACULTY, 5)
    const fac = await login(FACULTY)
    const oddOk = await authed('/api/faculty/preferences/draft', fac.token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM3_Y2_THEORY_ODD, 1, 2)] }),
    })
    expect(oddOk.status).toBe(200)
    await resetWorkflowStateRepo()
    const evenBlocked = await authed('/api/faculty/preferences/draft', fac.token, {
      method: 'POST',
      body: JSON.stringify({ items: [item(SEM4_Y2_THEORY_A, 1, 2)] }),
    })
    expect(evenBlocked.status).toBe(400)
    expect(evenBlocked.body.error).toBe('CYCLE_MISMATCH')

    const toBoth = await authed('/api/hod/academic-cycle', hod.token, {
      method: 'POST',
      body: JSON.stringify({ cycle: 'BOTH', password: 'SCEDULAR_AIDS' }),
    })
    expect(toBoth.body.currentCycle).toBe('BOTH')
    expect(toBoth.body.allowedSemesters).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'])

    // Restore the canonical EVEN cycle for the rest of the suite.
    const restore = await authed('/api/hod/academic-cycle', hod.token, {
      method: 'POST',
      body: JSON.stringify({ cycle: 'EVEN', password: 'SCEDULAR_AIDS' }),
    })
    expect(restore.body.currentCycle).toBe('EVEN')
  })

  // C7. An invalid cycle value is rejected by the HOD override.
  it('C7: an invalid cycle value is rejected (400 INVALID_CYCLE)', async () => {
    const hod = await login(HOD)
    const res = await authed('/api/hod/academic-cycle', hod.token, {
      method: 'POST',
      body: JSON.stringify({ cycle: 'SPRING', password: 'SCEDULAR_AIDS' }),
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_CYCLE')
    expect(await getCurrentAcademicCycle()).toBe('EVEN')
  })

  // C8. A non-HOD faculty cannot change the academic cycle.
  it('C8: a FACULTY cannot set the academic cycle (403)', async () => {
    const fac = await login(FACULTY)
    const res = await authed('/api/hod/academic-cycle', fac.token, {
      method: 'POST',
      body: JSON.stringify({ cycle: 'ODD' }),
    })
    expect(res.status).toBe(403)
    expect(await getCurrentAcademicCycle()).toBe('EVEN')
  })

  // C8b. Switching the academic cycle is password-gated -- it determines
  // which semester's subject syllabus faculty can submit preferences for.
  it('C8b: an HOD without the correct password cannot change the academic cycle (401)', async () => {
    const hod = await login(HOD)
    const wrongPassword = await authed('/api/hod/academic-cycle', hod.token, {
      method: 'POST',
      body: JSON.stringify({ cycle: 'ODD', password: 'wrong' }),
    })
    expect(wrongPassword.status).toBe(401)
    expect(wrongPassword.body.error).toBe('INVALID_PASSWORD')
    expect(await getCurrentAcademicCycle()).toBe('EVEN')

    const noPassword = await authed('/api/hod/academic-cycle', hod.token, {
      method: 'POST',
      body: JSON.stringify({ cycle: 'ODD' }),
    })
    expect(noPassword.status).toBe(401)
    expect(await getCurrentAcademicCycle()).toBe('EVEN')
  })

  // C9. Canonical subject records are never duplicated per cycle: a BOTH listing
  //     has unique ids, and every subject keeps a specific I–VIII semester.
  it('C9: cycle listing does not duplicate canonical subjects and never stores ODD/EVEN as a semester', async () => {
    const { token } = await login(FACULTY)
    const both = await authed('/api/faculty/subjects?semester=BOTH', token)
    const ids = both.body.subjects.map((s: any) => s.id)
    expect(new Set(ids).size).toBe(ids.length) // no duplicates

    const db = getLocalDb()
    // The BOTH listing is exactly the set of canonical subjects with a specific semester.
    const dbSpecific = db.subjects.filter((s: any) =>
      ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'].includes(s.semester)
    )
    expect(ids.length).toBe(dbSpecific.length)

    // No canonical record ever carries ODD/EVEN/BOTH as its semester.
    for (const s of db.subjects) {
      expect(['ODD', 'EVEN', 'BOTH']).not.toContain((s as any).semester)
    }

    // ODD ∪ EVEN == BOTH, with no overlap (each subject belongs to exactly one cycle).
    const odd = await authed('/api/faculty/subjects?semester=ODD', token)
    const even = await authed('/api/faculty/subjects?semester=EVEN', token)
    const oddIds = new Set(odd.body.subjects.map((s: any) => s.id))
    const evenIds = new Set(even.body.subjects.map((s: any) => s.id))
    expect(oddIds.size + evenIds.size).toBe(ids.length)
    for (const id of oddIds) expect(evenIds.has(id)).toBe(false)
  })
})
