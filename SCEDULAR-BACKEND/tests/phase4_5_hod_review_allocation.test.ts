import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { app } from '../src/app.js'
import { getLocalDb, saveLocalDbSync } from '../src/db/localDb.js'
import {
  resetWorkflowStateRepo,
  setCurrentAcademicCycle,
  saveFacultyPreferences,
} from '../src/db/repo.js'
import type { Server } from 'node:http'

let server: Server
let baseUrl: string

const PASSWORD = 'SCEDULAR_AIDS'
const HOD = 'FAC-001' // Dr.S.MALATHI — HOD
const FACULTY = 'FAC-002' // Dr.A.JOSHI — FACULTY
const FACULTY2 = 'FAC-003' // DR.T.KALAICHELVI — FACULTY (never approved in these tests)

// ── Real seed data (verified against data/scedular_local_db.json) ────────────
// The pristine seed carries a complete section-level curriculum ONLY for ODD
// semesters (sections + section_subjects reference Semester III/V/VII subjects).
// EVEN semesters have canonical SUBJECTS (so Phase 4 preference review works
// under the current EVEN cycle) but no section_subjects. Phase 5 section
// allocation is therefore exercised under the ODD cycle against real Semester III
// Year 2 data, and the cycle is always restored to EVEN afterwards.
const EVEN_SEM4_THEORY = 'SUB-23MA1405' // Year 2, Semester IV, THEORY (EVEN)
const EVEN_SEM4_ALT_THEORY = 'SUB-23AD1401' // Year 2, Semester IV, THEORY (EVEN) — edit target
const ODD_SEM3_THEORY = 'SUB-23MA1304' // Year 2, Semester III, THEORY (ODD)
const ODD_SEM3_LAB = 'SUB-23AD1311' // Year 2, Semester III, LAB (ODD)
const ODD_SEM5_THEORY = 'SUB-23AD1501' // Year 3, Semester V, THEORY (cross-semester probe)

// section_subject ids for ODD_SEM3_THEORY (sections Y2-A .. Y2-L), 12 offerings.
// (Recomputed after 23MC1002 was corrected to Year 2/Semester III in the
// canonical curriculum — see curriculumRoster.ts — which added a 10th
// section_subject per Y2 section and shifted every id after it.)
const THEORY_SS = [1, 13, 25, 37, 49, 61, 73, 85, 97, 109, 121, 133]
// section_subject ids for ODD_SEM3_LAB (sections Y2-A .. Y2-L), 12 offerings.
const LAB_SS = [6, 18, 30, 42, 54, 66, 78, 90, 102, 114, 126, 138]
// A Year 3 Semester V section_subject (section Y3-A) — never valid under III/Year 2.
const CROSS_SEMESTER_SS = 145

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
  await resetWorkflowStateRepo()
  await setCurrentAcademicCycle('EVEN')
})

afterAll(async () => {
  await resetWorkflowStateRepo()
  await setCurrentAcademicCycle('EVEN')
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
  return { status: res.status, body, token: body?.token as string }
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

/** Seed a preference directly through the repo (source of truth), returning it. */
async function seedPref(
  facultyId: string,
  subjectId: string,
  academicYear: string,
  semester: string,
  requestedSections: number,
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
  labConfirmed = false,
  preferenceRank = 1
) {
  const created = await saveFacultyPreferences(
    facultyId,
    [{ subjectId, academicYear, semester, preferenceRank, requestedSections, labConfirmed }],
    status
  )
  return created[0]
}

async function hodToken() {
  const { token } = await login(HOD)
  return token
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 — HOD Faculty Subject Preference Review (current cycle: EVEN)
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 4 — HOD Faculty Subject Preference Review', () => {
  it('1: a faculty SUBMITTED preference is visible to the HOD', async () => {
    await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    const token = await hodToken()
    const res = await authed('/api/hod/preferences?semester=IV', token)
    expect(res.status).toBe(200)
    const mine = res.body.preferences.find((p: any) => p.facultyId === FACULTY)
    expect(mine).toBeTruthy()
    expect(mine.status).toBe('SUBMITTED')
    expect(mine.subjectCode).toBe('23MA1405')
    expect(res.body.currentCycle).toBe('EVEN')
    expect(res.body.semester).toBe('IV')
  })

  it('2: a faculty DRAFT is never treated as approved', async () => {
    await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'DRAFT')
    const token = await hodToken()
    const res = await authed('/api/hod/preferences?semester=IV', token)
    const mine = res.body.preferences.find((p: any) => p.facultyId === FACULTY)
    expect(mine.status).toBe('DRAFT')
    const demand = res.body.demand.find((d: any) => d.subjectId === EVEN_SEM4_THEORY)
    expect(demand.approvedCapacity).toBe(0)
    expect(demand.approvedCount).toBe(0)
  })

  it('3: the HOD can APPROVE a submitted preference', async () => {
    const pref = await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    const token = await hodToken()
    const res = await authed(`/api/hod/preferences/${pref.id}/review`, token, {
      method: 'POST',
      body: JSON.stringify({ status: 'APPROVED', comment: 'ok' }),
    })
    expect(res.status).toBe(200)
    expect(res.body.preference.status).toBe('APPROVED')
    expect(res.body.preference.reviewedBy).toBe(HOD)
  })

  it('4: the HOD can REJECT a submitted preference', async () => {
    const pref = await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    const token = await hodToken()
    const res = await authed(`/api/hod/preferences/${pref.id}/review`, token, {
      method: 'POST',
      body: JSON.stringify({ status: 'REJECTED' }),
    })
    expect(res.status).toBe(200)
    expect(res.body.preference.status).toBe('REJECTED')
  })

  it('5: the HOD can REQUEST CHANGES on a submitted preference', async () => {
    const pref = await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    const token = await hodToken()
    const res = await authed(`/api/hod/preferences/${pref.id}/review`, token, {
      method: 'POST',
      body: JSON.stringify({ status: 'CHANGES_REQUESTED', comment: 'revise rank' }),
    })
    expect(res.status).toBe(200)
    expect(res.body.preference.status).toBe('CHANGES_REQUESTED')
  })

  it('6: an APPROVED preference is locked (cannot be re-reviewed or edited)', async () => {
    const pref = await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    const token = await hodToken()
    await authed(`/api/hod/preferences/${pref.id}/review`, token, {
      method: 'POST',
      body: JSON.stringify({ status: 'APPROVED' }),
    })
    const reReview = await authed(`/api/hod/preferences/${pref.id}/review`, token, {
      method: 'POST',
      body: JSON.stringify({ status: 'REJECTED' }),
    })
    expect(reReview.status).toBe(400)
    expect(reReview.body.error).toBe('LOCKED_PREFERENCE')

    const edit = await authed(`/api/hod/preferences/${pref.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ requestedSections: 3 }),
    })
    expect(edit.status).toBe(409)
    expect(edit.body.error).toBe('NOT_EDITABLE')
  })

  it('6b: the HOD can EDIT a submitted preference before approval', async () => {
    const pref = await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    const token = await hodToken()
    const res = await authed(`/api/hod/preferences/${pref.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ requestedSections: 3 }),
    })
    expect(res.status).toBe(200)
    expect(res.body.preference.requestedSections).toBe(3)
    expect(res.body.preference.status).toBe('SUBMITTED')
  })

  it('6c: the HOD EDIT covers the SUBJECT too (subject + requested capacity, not capacity-only)', async () => {
    const pref = await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    const token = await hodToken()
    const res = await authed(`/api/hod/preferences/${pref.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ subjectId: EVEN_SEM4_ALT_THEORY, requestedSections: 2 }),
    })
    expect(res.status).toBe(200)
    expect(res.body.preference.subjectId).toBe(EVEN_SEM4_ALT_THEORY)
    expect(res.body.preference.requestedSections).toBe(2)
    // The edited preference follows the new subject's canonical semester context.
    const view = await authed('/api/hod/preferences?semester=IV', token)
    const mine = view.body.preferences.find((p: any) => p.facultyId === FACULTY)
    expect(mine.subjectCode).toBe('23AD1401')
    expect(mine.requestedSections).toBe(2)
  })

  it('6d: the HOD review summary is DB-derived (total/submitted/pending/not submitted)', async () => {
    const token = await hodToken()
    const pristine = await authed('/api/hod/preferences?semester=IV', token)
    expect(pristine.body.summary).toEqual({ totalFaculty: 67, submitted: 0, pending: 0, notSubmitted: 67 })

    await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    await seedPref(FACULTY2, EVEN_SEM4_ALT_THEORY, 'Year 2', 'IV', 1, 'DRAFT')
    const after = await authed('/api/hod/preferences?semester=IV', token)
    expect(after.body.summary.totalFaculty).toBe(67)
    expect(after.body.summary.submitted).toBe(1)
    expect(after.body.summary.pending).toBe(1)
    expect(after.body.summary.notSubmitted).toBe(65)
  })

  it('7: a FACULTY cannot approve their own preference (403)', async () => {
    const pref = await seedPref(FACULTY, EVEN_SEM4_THEORY, 'Year 2', 'IV', 1, 'SUBMITTED')
    const { token } = await login(FACULTY)
    const res = await authed(`/api/hod/preferences/${pref.id}/review`, token, {
      method: 'POST',
      body: JSON.stringify({ status: 'APPROVED' }),
    })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('8: a FACULTY cannot access the HOD review endpoint (403)', async () => {
    const { token } = await login(FACULTY)
    const res = await authed('/api/hod/preferences?semester=IV', token)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('9: an invalid semester is rejected (400)', async () => {
    const token = await hodToken()
    const res = await authed('/api/hod/preferences?semester=FOO', token)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_SEMESTER')
  })

  it('10: an ODD semester is rejected while the current cycle is EVEN (400)', async () => {
    const token = await hodToken()
    const res = await authed('/api/hod/preferences?semester=III', token)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('CYCLE_MISMATCH')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5 — Section-Level Faculty Allocation (exercised under the ODD cycle)
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 5 — Section-Level Faculty Allocation', () => {
  beforeEach(async () => {
    // Real section_subject curriculum exists only for ODD semesters in the seed.
    await setCurrentAcademicCycle('ODD')
  })

  /** Seed an HOD-APPROVED preference for Semester III / Year 2. */
  function approve(facultyId: string, subjectId: string, requestedSections: number, labConfirmed = false) {
    return seedPref(facultyId, subjectId, 'Year 2', 'III', requestedSections, 'APPROVED', labConfirmed)
  }

  function commit(token: string, allocations: any[], year = 'Year 2', semester = 'III') {
    return authed('/api/teaching-assignments/commit-section-allocation', token, {
      method: 'POST',
      body: JSON.stringify({ year, semester, allocations }),
    })
  }

  function sectionAllocation(token: string, semester = 'III', year = 'Year 2') {
    return authed(`/api/teaching-assignments/section-allocation?semester=${semester}&year=${encodeURIComponent(year)}`, token)
  }

  it('11: an APPROVED faculty can be assigned to a real section', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 2)
    const token = await hodToken()
    const res = await commit(token, [{ facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' }])
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.assignedCount).toBe(1)

    const view = await sectionAllocation(token)
    const subj = view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY)
    expect(subj.assignedSections).toBe(1)
  })

  it('12: an UNAPPROVED faculty cannot be assigned a section (400)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 2) // FACULTY approved, FACULTY2 is NOT
    const token = await hodToken()
    const res = await commit(token, [{ facultyId: FACULTY2, sectionSubjectId: THEORY_SS[0], component: 'THEORY' }])
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('FACULTY_NOT_APPROVED')
  })

  it('13: the approved requested-section capacity is enforced (400)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 1) // capacity = 1
    const token = await hodToken()
    const res = await commit(token, [
      { facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' },
      { facultyId: FACULTY, sectionSubjectId: THEORY_SS[1], component: 'THEORY' },
    ])
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('FACULTY_CAPACITY_EXCEEDED')
  })

  it('14: a duplicate faculty+section+component assignment is rejected (400)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 2)
    const token = await hodToken()
    const res = await commit(token, [
      { facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' },
      { facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' },
    ])
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('DUPLICATE_ALLOCATION')
  })

  it('15: required section count is derived from real offerings (12), not hardcoded', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 1)
    const token = await hodToken()
    const view = await sectionAllocation(token)
    const subj = view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY)
    expect(subj.requiredSections).toBe(12)
    expect(subj.offerings.length).toBe(12)
  })

  it('16: a section from another semester is rejected (400)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 2)
    const token = await hodToken()
    const res = await commit(token, [{ facultyId: FACULTY, sectionSubjectId: CROSS_SEMESTER_SS, component: 'THEORY' }])
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_SECTION_SUBJECT')
  })

  it('17: a subject outside the selected semester is rejected as CROSS_SEMESTER (400)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 2)
    const token = await hodToken()
    // Transiently link a real Year 2 Semester III section (Y2-B) to a Semester V
    // subject so the structural check has something to reject; cleaned up after.
    const db = getLocalDb()
    const injectedId = 999001
    db.sectionSubjects.push({
      id: injectedId,
      sectionId: 'Y2-B',
      subjectId: ODD_SEM5_THEORY,
      theoryPeriods: 3,
      labPeriods: 0,
      labBlockLength: null,
    } as any)
    saveLocalDbSync()
    try {
      const res = await commit(token, [{ facultyId: FACULTY, sectionSubjectId: injectedId, component: 'THEORY' }])
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('CROSS_SEMESTER')
    } finally {
      const d = getLocalDb()
      d.sectionSubjects = d.sectionSubjects.filter((ss: any) => ss.id !== injectedId)
      saveLocalDbSync()
    }
  })

  it('18: removing an assignment restores faculty capacity', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 1)
    const token = await hodToken()
    await commit(token, [{ facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' }])
    let view = await sectionAllocation(token)
    let pool = view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY).approvedFacultyPool
    expect(pool.find((f: any) => f.facultyId === FACULTY).remainingCapacity).toBe(0)

    // Commit the empty desired state → clears the assignment (capacity returns).
    await commit(token, [])
    view = await sectionAllocation(token)
    pool = view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY).approvedFacultyPool
    expect(pool.find((f: any) => f.facultyId === FACULTY).remainingCapacity).toBe(1)
    expect(view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY).assignedSections).toBe(0)
  })

  it('19: PARTIAL allocation status is calculated correctly', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 3)
    const token = await hodToken()
    await commit(token, [{ facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' }])
    const view = await sectionAllocation(token)
    const subj = view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY)
    expect(subj.assignedSections).toBe(1)
    expect(subj.requiredSections).toBe(12)
    expect(subj.status).toBe('PARTIAL')
  })

  it('20: FULL allocation status is calculated correctly', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 12)
    const token = await hodToken()
    const allocations = THEORY_SS.map((ss) => ({ facultyId: FACULTY, sectionSubjectId: ss, component: 'THEORY' }))
    const res = await commit(token, allocations)
    expect(res.status).toBe(200)
    const view = await sectionAllocation(token)
    const subj = view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY)
    expect(subj.assignedSections).toBe(12)
    expect(subj.status).toBe('FULL')
    expect(subj.shortage).toBe(0)
  })

  it('21: shortage is derived (required − assigned)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 4)
    const token = await hodToken()
    let view = await sectionAllocation(token)
    expect(view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY).shortage).toBe(12)
    await commit(token, [{ facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' }])
    view = await sectionAllocation(token)
    expect(view.body.subjects.find((s: any) => s.subjectId === ODD_SEM3_THEORY).shortage).toBe(11)
  })

  it('22: LAB responsibility requires explicit lab confirmation', async () => {
    // Approved for the LAB subject but WITHOUT lab confirmation → LAB blocked.
    await approve(FACULTY, ODD_SEM3_LAB, 1, false)
    const token = await hodToken()
    const blocked = await commit(token, [{ facultyId: FACULTY, sectionSubjectId: LAB_SS[0], component: 'LAB' }])
    expect(blocked.status).toBe(400)
    expect(blocked.body.error).toBe('LAB_NOT_CONFIRMED')
  })

  it('22b: a lab-confirmed faculty CAN be assigned the LAB component', async () => {
    await approve(FACULTY, ODD_SEM3_LAB, 1, true)
    const token = await hodToken()
    const res = await commit(token, [{ facultyId: FACULTY, sectionSubjectId: LAB_SS[0], component: 'LAB' }])
    expect(res.status).toBe(200)
    expect(res.body.assignedCount).toBe(1)
  })

  it('22c: a THEORY component cannot be assigned to a LAB-only subject (400)', async () => {
    await approve(FACULTY, ODD_SEM3_LAB, 1, true)
    const token = await hodToken()
    const res = await commit(token, [{ facultyId: FACULTY, sectionSubjectId: LAB_SS[0], component: 'THEORY' }])
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_COMPONENT_FOR_SUBJECT')
  })

  it('23: an unknown/inactive faculty is rejected (400)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 2)
    const token = await hodToken()
    const res = await commit(token, [{ facultyId: 'FAC-999', sectionSubjectId: THEORY_SS[0], component: 'THEORY' }])
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INACTIVE_FACULTY')
  })

  it('23b: an inactive section is rejected (400)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 2)
    const token = await hodToken()
    const db = getLocalDb()
    const sec = db.sections.find((s: any) => s.id === 'Y2-A')!
    const prev = sec.active
    sec.active = false
    saveLocalDbSync()
    try {
      const res = await commit(token, [{ facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' }])
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('INACTIVE_SECTION')
    } finally {
      const d = getLocalDb()
      d.sections.find((s: any) => s.id === 'Y2-A')!.active = prev
      saveLocalDbSync()
    }
  })

  it('24: a mismatched year for the semester is rejected (400 YEAR_MISMATCH)', async () => {
    await approve(FACULTY, ODD_SEM3_THEORY, 2)
    const token = await hodToken()
    const res = await commit(token, [{ facultyId: FACULTY, sectionSubjectId: THEORY_SS[0], component: 'THEORY' }], 'Year 3', 'III')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('YEAR_MISMATCH')
  })

  it('24b: an EVEN semester is rejected while the cycle is ODD (400 CYCLE_MISMATCH)', async () => {
    const token = await hodToken()
    const res = await sectionAllocation(token, 'IV', 'Year 2')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('CYCLE_MISMATCH')
  })

  it('25: a FACULTY cannot access the section-allocation endpoints (403)', async () => {
    const { token } = await login(FACULTY)
    const view = await authed('/api/teaching-assignments/section-allocation?semester=III&year=Year%202', token)
    expect(view.status).toBe(403)
    const commitRes = await authed('/api/teaching-assignments/commit-section-allocation', token, {
      method: 'POST',
      body: JSON.stringify({ year: 'Year 2', semester: 'III', allocations: [] }),
    })
    expect(commitRes.status).toBe(403)
  })
})
