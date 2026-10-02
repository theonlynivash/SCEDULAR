import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Server } from 'node:http'
import { app } from '../src/app.js'
import { resetWorkflowStateRepo, listSubjects, listSections, listSectionSubjects } from '../src/db/repo.js'
import { getLocalDb } from '../src/db/localDb.js'

let server: Server
let baseUrl: string
let hodToken: string

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        baseUrl = `http://localhost:${addr.port}`
      }
      resolve()
    })
  })

  // Authenticate as HOD
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'FAC-001', password: 'SCEDULAR_AIDS' }),
  })
  const body: any = await res.json()
  hodToken = body.token
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve())
    } else {
      resolve()
    }
  })
})

describe('Phase 5 — HOD Workload Templates & Faculty Allocation System', () => {
  beforeEach(async () => {
    await resetWorkflowStateRepo()
  })

  it('1. Fetches default workload templates and allows custom template creation', async () => {
    const resGet = await fetch(`${baseUrl}/api/workload-templates`)
    expect(resGet.status).toBe(200)
    const templates: any = await resGet.json()
    expect(Array.isArray(templates)).toBe(true)
    expect(templates.length).toBeGreaterThanOrEqual(8)

    // Create custom template
    const resCreate = await fetch(`${baseUrl}/api/workload-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hodToken}`,
      },
      body: JSON.stringify({
        name: 'Custom 5T + 2L Package',
        theoryPeriodsPerSection: 5,
        labPeriodsPerSection: 2,
        description: 'Heavy theory package',
      }),
    })

    expect(resCreate.status).toBe(201)
    const created: any = await resCreate.json()
    expect(created.name).toBe('Custom 5T + 2L Package')
    expect(created.theoryPeriodsPerSection).toBe(5)
    expect(created.labPeriodsPerSection).toBe(2)
  })

  it('2. Calculates subject required workload dynamically from active SectionSubjects without hardcoding', async () => {
    const res = await fetch(`${baseUrl}/api/hod/workload-summary?semester=III`, {
      headers: { Authorization: `Bearer ${hodToken}` },
    })

    expect(res.status).toBe(200)
    const summary: any = await res.json()
    expect(summary.semester).toBe('III')
    expect(summary.activeSectionCount).toBe(12) // Year 2 Sem III has 12 active sections
    expect(summary.subjectSummaries.length).toBeGreaterThan(0)

    const db = getLocalDb()
    const sem3Subjects = db.subjects.filter(s => s.semester === 'III')

    for (const subSummary of summary.subjectSummaries) {
      const sub = sem3Subjects.find(s => s.id === subSummary.subjectId)
      expect(sub).toBeDefined()
      // Dynamic required calculation = count of sections offering this subject * periods per section
      expect(subSummary.requiredTheory).toBe(12 * (sub?.theoryPeriods || 0))
      expect(subSummary.requiredLab).toBe(12 * (sub?.labPeriods || 0))
    }
  })

  it('3. Enforces template-per-section semantics (e.g. 2 sections with 2T+2L template = 4T+4L total)', async () => {
    const db = getLocalDb()
    const sub = db.subjects.find(s => s.semester === 'VII' && s.theoryPeriods! > 0 && s.labPeriods! > 0)!
    const sec1 = db.sections.find(sec => sec.active !== false && sec.semester === sub.semester && sec.year === sub.year)!
    const sec2 = db.sections.find(sec => sec.active !== false && sec.semester === sub.semester && sec.year === sub.year && sec.id !== sec1.id)!

    const res = await fetch(`${baseUrl}/api/hod/allocate-workload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hodToken}`,
      },
      body: JSON.stringify({
        semester: sub.semester,
        subjectId: sub.id,
        templateId: 'WKL-T2L2', // 2T + 2L per section
        facultyId: 'FAC-023',
        assignedSectionIds: [sec1.id, sec2.id], // 2 sections
      }),
    })

    expect(res.status).toBe(201)
    const alloc: any = await res.json()
    expect(alloc.assignedSectionIds.length).toBe(2)
    expect(alloc.totalTheoryPeriods).toBe(4) // 2 * 2
    expect(alloc.totalLabPeriods).toBe(4)    // 2 * 2
  })

  it('4. Rejects invalid section-subject assignment (section that does not offer the subject)', async () => {
    const db = getLocalDb()
    const sem3Sub = db.subjects.find(s => s.semester === 'III')!

    // Try allocating a Sem III subject to a Sem V section ('Y3-A')
    const res = await fetch(`${baseUrl}/api/hod/allocate-workload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hodToken}`,
      },
      body: JSON.stringify({
        semester: 'III',
        subjectId: sem3Sub.id,
        templateId: 'WKL-T2L0',
        facultyId: 'FAC-002',
        assignedSectionIds: ['Y3-A'], // Invalid section for Sem III subject
      }),
    })

    expect(res.status).toBe(400)
    const body: any = await res.json()
    expect(body.error).toBe('INVALID_SECTION_SUBJECT')
  })

  it('5. Rejects lab allocation for theory-only subject and theory allocation for lab-only subject', async () => {
    const db = getLocalDb()
    const theoryOnlySub = db.subjects.find(s => s.semester === 'III' && s.theoryPeriods! > 0 && s.labPeriods === 0)!
    const labOnlySub = db.subjects.find(s => s.semester === 'III' && s.labPeriods! > 0 && s.theoryPeriods === 0)!

    // 1. Try applying 2T + 2L to theory-only subject
    const resTheoryFail = await fetch(`${baseUrl}/api/hod/allocate-workload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hodToken}`,
      },
      body: JSON.stringify({
        semester: 'III',
        subjectId: theoryOnlySub.id,
        templateId: 'WKL-T2L2', // Contains lab periods
        facultyId: 'FAC-002',
        assignedSectionIds: ['Y2-A'],
      }),
    })

    expect(resTheoryFail.status).toBe(400)
    const body1: any = await resTheoryFail.json()
    expect(body1.error).toBe('INVALID_COMPONENT_TYPE')

    // 2. Try applying 2T + 0L to lab-only subject
    const resLabFail = await fetch(`${baseUrl}/api/hod/allocate-workload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hodToken}`,
      },
      body: JSON.stringify({
        semester: 'III',
        subjectId: labOnlySub.id,
        templateId: 'WKL-T2L0', // Contains theory periods
        facultyId: 'FAC-002',
        assignedSectionIds: ['Y2-A'],
      }),
    })

    expect(resLabFail.status).toBe(400)
    const body2: any = await resLabFail.json()
    expect(body2.error).toBe('INVALID_COMPONENT_TYPE')
  })

  it('6. Rejects faculty capacity over-allocation (existing + new > maxWeeklyPeriods)', async () => {
    const db = getLocalDb()
    const fac = db.faculty.find(f => f.id === 'FAC-002')!
    const sem3Sub = db.subjects.find(s => s.semester === 'III' && s.theoryPeriods! >= 3)!

    // Create a template with 10T per section and assign to 3 sections (30 hours total > 18 max capacity)
    const resTmpl = await fetch(`${baseUrl}/api/workload-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hodToken}` },
      body: JSON.stringify({ name: 'Huge 10T Package', theoryPeriodsPerSection: 10, labPeriodsPerSection: 0 }),
    })
    const tmpl: any = await resTmpl.json()

    const resAlloc = await fetch(`${baseUrl}/api/hod/allocate-workload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hodToken}` },
      body: JSON.stringify({
        semester: 'III',
        subjectId: sem3Sub.id,
        templateId: tmpl.id,
        facultyId: fac.id,
        assignedSectionIds: ['Y2-A', 'Y2-B', 'Y2-C'], // 30 hours > 20 capacity
      }),
    })

    expect(resAlloc.status).toBe(400)
    const body: any = await resAlloc.json()
    expect(body.error).toBe('FACULTY_CAPACITY_EXCEEDED')
  })

  it('7. Approves staged allocation and syncs into canonical TeachingAssignments', async () => {
    const db = getLocalDb()
    const sub = db.subjects.find(s => s.semester === 'VII' && s.theoryPeriods! > 0 && s.labPeriods! > 0)!
    const sec = db.sections.find(s => s.active !== false && s.semester === sub.semester && s.year === sub.year)!

    // Stage allocation
    await fetch(`${baseUrl}/api/hod/allocate-workload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hodToken}` },
      body: JSON.stringify({
        semester: sub.semester,
        subjectId: sub.id,
        templateId: 'WKL-T2L2',
        facultyId: 'FAC-002',
        assignedSectionIds: [sec.id],
      }),
    })

    // Approve allocation
    const resApprove = await fetch(`${baseUrl}/api/hod/approve-workload-allocation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hodToken}` },
      body: JSON.stringify({ semester: sub.semester, subjectId: sub.id }),
    })

    expect(resApprove.status).toBe(200)
    const approveBody: any = await resApprove.json()
    expect(approveBody.success).toBe(true)
    expect(approveBody.approvedAllocationsCount).toBeGreaterThan(0)
    expect(approveBody.syncedTeachingAssignmentsCount).toBeGreaterThan(0)

    // Verify TeachingAssignments now contain canonical rows
    const ss = db.sectionSubjects.find(s => s.sectionId === sec.id && s.subjectId === sub.id)!
    const theoryAssignment = db.teachingAssignments.find(t => t.sectionSubjectId === ss.id && t.component === 'THEORY')
    const labAssignment = db.teachingAssignments.find(t => t.sectionSubjectId === ss.id && t.component === 'LAB')

    expect(theoryAssignment).toBeDefined()
    expect(theoryAssignment?.facultyId).toBe('FAC-002')
    expect(labAssignment).toBeDefined()
    expect(labAssignment?.facultyId).toBe('FAC-002')
  })

  it('8. Rejects duplicate section assignment when section component is already assigned to another teacher', async () => {
    const db = getLocalDb()
    const sub = db.subjects.find(s => s.semester === 'VII' && s.theoryPeriods! > 0 && s.labPeriods === 0)!

    // Step 1: Stage and approve an allocation for FAC-042 on Y4-A so that a canonical
    // TeachingAssignment exists for this section/subject/THEORY component.
    await fetch(`${baseUrl}/api/hod/allocate-workload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hodToken}` },
      body: JSON.stringify({
        semester: 'VII',
        subjectId: sub.id,
        templateId: 'WKL-T3L0',
        facultyId: 'FAC-042',
        assignedSectionIds: ['Y4-A'],
      }),
    })
    await fetch(`${baseUrl}/api/hod/approve-workload-allocation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hodToken}` },
      body: JSON.stringify({ semester: 'VII', subjectId: sub.id }),
    })

    // Step 2: Now attempt to allocate the same section/subject/THEORY to FAC-002 — must be rejected.
    const res = await fetch(`${baseUrl}/api/hod/allocate-workload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hodToken}` },
      body: JSON.stringify({
        semester: 'VII',
        subjectId: sub.id,
        templateId: 'WKL-T3L0',
        facultyId: 'FAC-002', // Different faculty
        assignedSectionIds: ['Y4-A'],
      }),
    })

    expect(res.status).toBe(400)
    const body: any = await res.json()
    expect(body.error).toBe('DUPLICATE_SECTION_ASSIGNMENT')
  })
})
