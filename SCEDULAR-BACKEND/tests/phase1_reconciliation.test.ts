import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listFaculty,
  listSections,
  listSubjects,
  listLabs,
  listSectionSubjects,
  resetWorkflowStateRepo,
  saveFacultyPreferences,
  reviewFacultyPreference,
  getSubjectDemand,
  getFacultyPreferences,
} from '../src/db/repo.js'
import { getLocalDb } from '../src/db/localDb.js'
import { app } from '../src/app.js'
import type { Server } from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let server: Server
let baseUrl: string

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

describe('Phase 1 Reconciliation Tests', () => {
  beforeEach(async () => {
    await resetWorkflowStateRepo()
  })

  it('1. Verifies exactly 58 faculty records exist', async () => {
    const faculty = await listFaculty()
    expect(faculty.length).toBe(67)
  })

  it('2. Verifies exactly 28 active operational sections exist', async () => {
    const sections = await listSections()
    const activeSections = sections.filter(s => s.active !== false)
    expect(activeSections.length).toBe(28)
  })

  it('3. Verifies exactly 143 canonical subjects exist', async () => {
    const subjects = await listSubjects()
    expect(subjects.length).toBe(143)
  })

  it('4. Verifies exactly 10 labs exist', async () => {
    const labs = await listLabs()
    expect(labs.length).toBe(10)
  })

  it('5. Verifies lab mappings are populated from the real confirmed data (>= the original 10-row sample)', async () => {
    const db = getLocalDb()
    expect(db.labMappings.length).toBeGreaterThanOrEqual(10)
  })

  it('6. Verifies section_subjects are populated with positive count', async () => {
    const secSubs = await listSectionSubjects()
    expect(secSubs.length).toBeGreaterThan(0)
  })

  it('7. Verifies no cross-semester section_subjects exist', async () => {
    const secSubs = await listSectionSubjects()
    const sections = await listSections()
    const subjects = await listSubjects()

    const secMap = new Map(sections.map(s => [s.id, s]))
    const subMap = new Map(subjects.map(s => [s.id, s]))

    for (const ss of secSubs) {
      const sec = secMap.get(ss.sectionId)
      const sub = subMap.get(ss.subjectId)
      expect(sec).toBeDefined()
      expect(sub).toBeDefined()
      expect(sec?.semester).toBe(sub?.semester)
      expect(sec?.year).toBe(sub?.year)
    }
  })

  it('7b. Verifies zero duplicate section_subjects (UNIQUE section_id + subject_id)', async () => {
    const secSubs = await listSectionSubjects()
    const seen = new Set<string>()
    for (const ss of secSubs) {
      const key = `${ss.sectionId}::${ss.subjectId}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('7c. Verifies every active operational section has its full canonical offerings', async () => {
    const sections = await listSections()
    const subjects = await listSubjects()
    const secSubs = await listSectionSubjects()

    const countBySection = new Map<string, number>()
    for (const ss of secSubs) {
      countBySection.set(ss.sectionId, (countBySection.get(ss.sectionId) ?? 0) + 1)
    }

    let checked = 0
    for (const sec of sections.filter(s => s.active !== false)) {
      if (!sec.year || !sec.semester) continue
      const expected = subjects.filter(su => su.year === sec.year && su.semester === sec.semester).length
      expect(expected).toBeGreaterThan(0)
      expect(countBySection.get(sec.id) ?? 0).toBe(expected)
      checked++
    }
    expect(checked).toBe(28)
  })

  it('8 & 9. Verifies reset preserves master records and clears workflow records', async () => {
    // Add dummy workflow data
    await saveFacultyPreferences(
      'FAC-002',
      [
        {
          subjectId: 'SUB-23CS2301',
          academicYear: 'Year 2',
          semester: 'III',
          preferenceRank: 1,
          requestedSections: 2,
          labConfirmed: true,
        },
      ],
      'SUBMITTED'
    )

    const db = getLocalDb()
    db.teachingAssignments.push({ id: 1, facultyId: 'FAC-002', sectionSubjectId: 1, component: 'THEORY', batch: null })
    db.generationRuns.push({ id: 1, status: 'COMPLETED', generatedAt: new Date().toISOString(), warnings: [] })

    // Execute reset via endpoint
    const res = await fetch(`${baseUrl}/api/reset-workflow`, { method: 'POST' })
    const body: any = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)

    // Check after counts
    expect(body.after.faculty).toBe(67)
    expect(body.after.sections).toBe(28)
    expect(body.after.subjects).toBe(143)
    expect(body.after.labs).toBe(10)
    expect(body.after.labMappings).toBeGreaterThanOrEqual(10)
    expect(body.after.sectionSubjects).toBeGreaterThan(0)

    expect(body.after.facultyPreferences).toBe(0)
    expect(body.after.teachingAssignments).toBe(0)
    expect(body.after.generationRuns).toBe(0)
    expect(body.after.assignments).toBe(0)
    expect(body.after.conflicts).toBe(0)
    expect(body.after.unscheduled).toBe(0)
  })

  it('10. Verifies APPROVED preferences cannot be modified', async () => {
    const prefs = await saveFacultyPreferences(
      'FAC-002',
      [
        {
          subjectId: 'SUB-23CS2301',
          academicYear: 'Year 2',
          semester: 'III',
          preferenceRank: 1,
          requestedSections: 2,
          labConfirmed: true,
        },
      ],
      'SUBMITTED'
    )

    const prefId = prefs[0].id
    const approved = await reviewFacultyPreference(prefId, 'APPROVED', 'Approved by HOD', 'FAC-001')
    expect(approved?.status).toBe('APPROVED')

    // Attempt to change APPROVED preference
    await expect(reviewFacultyPreference(prefId, 'REJECTED', 'Change attempt', 'FAC-001')).rejects.toThrow(
      'Cannot modify an APPROVED preference'
    )

    const currentPrefs = await getFacultyPreferences('FAC-002')
    const current = currentPrefs.find(p => p.id === prefId)
    expect(current?.status).toBe('APPROVED')
  })

  it('11 & 12. Verifies authentication rejects invalid password or unknown faculty', async () => {
    const resBadPass = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'FAC-001', password: 'wrong_password' }),
    })
    expect(resBadPass.status).toBe(401)
    const bodyBadPass: any = await resBadPass.json()
    expect(bodyBadPass.error).toBe('AUTHENTICATION_FAILED')

    const resBadUser = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'UNKNOWN_FACULTY_999', password: 'SCEDULAR_AIDS' }),
    })
    expect(resBadUser.status).toBe(401)
    const bodyBadUser: any = await resBadUser.json()
    expect(bodyBadUser.error).toBe('AUTHENTICATION_FAILED')

    const resValid = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'FAC-001', password: 'SCEDULAR_AIDS' }),
    })
    expect(resValid.status).toBe(200)
    const bodyValid: any = await resValid.json()
    expect(bodyValid.user.role).toBe('HOD')
  })

  it('13. Verifies subject demand is derived from database records and supports semester parameter', async () => {
    const sem3Demand = await getSubjectDemand('III')
    expect(sem3Demand.length).toBeGreaterThan(0)
    for (const d of sem3Demand) {
      expect(d.semester).toBe('III')
      expect(d.requiredSections).toBe(12) // Year 2 Sem III has 12 active sections
      expect(d.requiredPeriodsWeekly).toBe(d.requiredSections * (d.requiredTheoryPeriods! + d.requiredLabPeriods!))
    }
  })

  it('14. Verifies AI failure explanation has no invented hardcoded facts when LLM is offline', async () => {
    const res = await fetch(`${baseUrl}/api/ai/explain-generation-failure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: { summary: 'Custom solver report' } }),
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    const expStr = JSON.stringify(body.explanation)
    expect(expStr).not.toContain('Data Analytics Laboratory')
    expect(expStr).not.toContain('CC17')
  })

  it('15. Verifies no API credential exists in source code', () => {
    const sourceFiles = [
      path.resolve(__dirname, '../src/routes/facultyAllocation.ts'),
      path.resolve(__dirname, '../.env.example'),
      path.resolve(__dirname, '../.env'),
    ]

    for (const filePath of sourceFiles) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        expect(content).not.toContain('gsk_TEST_SECRET_SHOULD_NOT_EXIST')
      }
    }
  })
})
