import { describe, it, expect } from 'vitest'
import { getAllocationPolicy, DEFAULT_ALLOCATION_CONFIG } from '../src/utils/allocationPolicy.js'
import { resetWorkflowStateRepo, getFacultyPreferences, saveFacultyPreferences, reviewFacultyPreference, listSubjects, listSections, listLabs, listFaculty } from '../src/db/repo.js'

describe('SCEDULAR — Full Application Rebuild E2E Validation', () => {
  it('1–4: Canonical institutional entities meet exact counts', async () => {
    const fac = await listFaculty()
    const sec = await listSections()
    const subj = await listSubjects()
    const labs = await listLabs()

    expect(fac.length).toBe(67)
    expect(sec.length).toBe(28)
    expect(subj.length).toBe(143)
    expect(labs.length).toBe(10)
    expect(fac[0].id).toBe('FAC-001')
    expect(fac[0].role).toBe('HOD')
  })

  it('5: Reset workflow clears preferences & assignments while leaving master data intact', async () => {
    await resetWorkflowStateRepo()
    const prefs = await getFacultyPreferences()
    expect(prefs.length).toBe(0)

    const fac = await listFaculty()
    const subj = await listSubjects()
    expect(fac.length).toBe(67)
    expect(subj.length).toBe(143)
  })

  it('10: Allocation experience policy bands enforce rules accurately', () => {
    // 0-9 yrs
    const p1 = getAllocationPolicy(5, DEFAULT_ALLOCATION_CONFIG)
    expect(p1.eligibleYears).toEqual(['Year 1', 'Year 2'])
    expect(p1.maxTotalPreferences).toBe(1)

    // 10-13 yrs
    const p2 = getAllocationPolicy(11, DEFAULT_ALLOCATION_CONFIG)
    expect(p2.eligibleYears).toEqual(['Year 2', 'Year 3', 'Year 4'])
    expect(p2.maxTotalPreferences).toBe(2)

    // 13+ yrs
    const p3 = getAllocationPolicy(15, DEFAULT_ALLOCATION_CONFIG)
    expect(p3.eligibleYears).toEqual(['Year 3', 'Year 4'])
    expect(p3.maxTotalPreferences).toBe(2)
  })

  it('11–14: Faculty preference submission, HOD approval, and status propagation', async () => {
    await resetWorkflowStateRepo()

    // 1. Submit preference
    const submitted = await saveFacultyPreferences('FAC-002', [
      {
        subjectId: 'SUB-23AD1302',
        academicYear: 'Year 2',
        semester: 'III',
        preferenceRank: 1,
        requestedSections: 3,
        labConfirmed: true,
      }
    ], 'SUBMITTED')

    expect(submitted.length).toBe(1)
    expect(submitted[0].status).toBe('SUBMITTED')

    // 2. HOD Review & Approval
    const prefId = submitted[0].id
    const approved = await reviewFacultyPreference(prefId, 'APPROVED', 'Approved for 3 sections', 'FAC-001')
    expect(approved).toBeDefined()
    expect(approved?.status).toBe('APPROVED')
    expect(approved?.reviewedBy).toBe('FAC-001')

    // 3. Confirm approved state propagates
    const allPrefs = await getFacultyPreferences('FAC-002')
    expect(allPrefs[0].status).toBe('APPROVED')
  })
})
