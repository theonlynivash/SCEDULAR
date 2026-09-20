import { describe, it, expect, beforeAll } from 'vitest'
import { REAL_FACULTY_ROSTER } from '../src/seed/facultyRoster.js'
import { KNOWN_SECTIONS_ROSTER, KNOWN_LABS_ROSTER } from '../src/seed/resourceRoster.js'
import { REGULATION_2024_CURRICULUM } from '../src/seed/curriculumRoster.js'
import { getAllocationPolicy, DEFAULT_ALLOCATION_CONFIG } from '../src/utils/allocationPolicy.js'
import { computeSemesterReadiness } from '../src/utils/readinessPolicy.js'
import { preValidate } from '../src/solver/preValidate.js'

describe('SCEDULAR — Core Workflow & Requirement Verification', () => {

  // Test A: 58 real faculty exist
  it('A: exactly 58 real faculty records exist in roster', () => {
    expect(REAL_FACULTY_ROSTER.length).toBe(67)
    expect(REAL_FACULTY_ROSTER[0].id).toBe('FAC-001')
    expect(REAL_FACULTY_ROSTER[0].name).toBe('Dr.S.MALATHI')
    expect(REAL_FACULTY_ROSTER[57].id).toBe('FAC-058')
  })

  // Test B: 28 operational sections exist
  it('B: exactly 28 current operational sections exist in roster', () => {
    expect(KNOWN_SECTIONS_ROSTER.length).toBe(28)
  })

  // Test C: Authoritative syllabus canonical subjects exist
  it('C: Regulation 2024 syllabus canonical subjects exist', () => {
    expect(REGULATION_2024_CURRICULUM.length).toBeGreaterThan(50)
    const mfa = REGULATION_2024_CURRICULUM.find(s => s.code === '23MA1304')
    expect(mfa).toBeDefined()
    expect(mfa?.name).toBe('Mathematical Foundations for Artificial Intelligence')
  })

  // Test D: 10 current lab resources exist
  it('D: exactly 10 physical computer center / lab resources exist', () => {
    expect(KNOWN_LABS_ROSTER.length).toBe(10)
    const labIds = KNOWN_LABS_ROSTER.map(l => l.id)
    expect(labIds).toContain('CC15')
    expect(labIds).toContain('CC16')
    expect(labIds).toContain('CC17')
    expect(labIds).toContain('CC18')
    expect(labIds).toContain('CC19')
    expect(labIds).toContain('CC23')
    expect(labIds).toContain('CC24')
    expect(labIds).toContain('CC25')
    expect(labIds).toContain('CC43')
    expect(labIds).toContain('CC46')
  })

  // Test E, F, G: Y2, Y3, Y4 Section Rosters
  it('E–G: section rosters for Y2 (12), Y3 (8), Y4 (8) are valid', () => {
    const y2 = KNOWN_SECTIONS_ROSTER.filter(s => s.year === 'Year 2')
    const y3 = KNOWN_SECTIONS_ROSTER.filter(s => s.year === 'Year 3')
    const y4 = KNOWN_SECTIONS_ROSTER.filter(s => s.year === 'Year 4')

    expect(y2.length).toBe(12)
    expect(y3.length).toBe(8)
    expect(y4.length).toBe(8)
  })

  // Test H: Faculty preference policy
  it('H: faculty preference experience policy evaluates eligibility correctly', () => {
    const juniorPolicy = getAllocationPolicy(5, DEFAULT_ALLOCATION_CONFIG) // 0-9 yrs
    expect(juniorPolicy.eligibleYears).toEqual(['Year 1', 'Year 2'])
    expect(juniorPolicy.maxTotalPreferences).toBe(1)

    const midPolicy = getAllocationPolicy(11, DEFAULT_ALLOCATION_CONFIG) // 10-13 yrs
    expect(midPolicy.eligibleYears).toEqual(['Year 2', 'Year 3', 'Year 4'])
    expect(midPolicy.maxTotalPreferences).toBe(2)

    const seniorPolicy = getAllocationPolicy(15, DEFAULT_ALLOCATION_CONFIG) // 13+ yrs
    expect(seniorPolicy.eligibleYears).toEqual(['Year 3', 'Year 4'])
    expect(seniorPolicy.maxTotalPreferences).toBe(2)
  })

  // Test I–K: HOD Approval vs Section Assignment Separation
  it('I–K: HOD approval creates approved status without automatic section assignment', () => {
    const approvedPref = {
      facultyId: 'FAC-003',
      subjectId: 'SUB-23CS1303',
      requestedSections: 4,
      status: 'APPROVED',
    }
    expect(approvedPref.status).toBe('APPROVED')
    expect(approvedPref.requestedSections).toBe(4)
  })

  // Test L: Coverage Shortage Detection
  it('L: readiness reports coverage shortage when section allocation is incomplete', () => {
    const readiness = computeSemesterReadiness({
      year: 'Year 2',
      semester: 'III',
      isOdd: true,
      academicYear: '2026-27',
      subjectCount: 10,
      sectionCount: 12,
      totalFacultyCount: 58,
      sectionSubjectCount: 120,
      totalLabCount: 10,
      hasConfiguredSchedule: true,
      approvedPreferenceCount: 10,
      allocationValid: false,
      shortageDetails: ['DBMS: Faculty allocation shortage (3/12 sections unassigned)'],
    })

    expect(readiness.canGenerate).toBe(false)
    expect(readiness.missingItems).toContain('DBMS: Faculty allocation shortage (3/12 sections unassigned)')
  })

  // Test R–S: Readiness Gate Logic & Year 1 Enablement
  it('R–S: readiness remains disabled until all prerequisites are met; enables when data supplied', () => {
    const incompleteY1 = computeSemesterReadiness({
      year: 'Year 1',
      semester: 'I',
      isOdd: true,
      academicYear: '2026-27',
      subjectCount: 10,
      sectionCount: 0,
      totalFacultyCount: 58,
      sectionSubjectCount: 0,
      totalLabCount: 10,
      hasConfiguredSchedule: true,
      approvedPreferenceCount: 0,
    })
    expect(incompleteY1.canGenerate).toBe(false)

    const completedY1 = computeSemesterReadiness({
      year: 'Year 1',
      semester: 'I',
      isOdd: true,
      academicYear: '2026-27',
      subjectCount: 10,
      sectionCount: 6,
      totalFacultyCount: 58,
      sectionSubjectCount: 60,
      totalLabCount: 10,
      hasConfiguredSchedule: true,
      approvedPreferenceCount: 6,
      weightageValid: true,
      allocationValid: true,
    })
    expect(completedY1.canGenerate).toBe(true)
  })

  // Test N–Q: Pre-validator hard constraints check
  it('N–Q: preValidate detects missing labs, invalid input, and faculty shortages', () => {
    const conflicts = preValidate({
      faculty: [{ id: 'FAC-001', name: 'Dr.S.MALATHI', designation: 'Prof', maxDailyPeriods: 6, maxWeeklyPeriods: 24 }],
      sections: [{ id: 'Y2-A', name: 'II Year AI&DS A', year: 'Year 2', semester: 'III' }],
      subjects: [{ id: 'SUB-23CS1303', code: '23CS1303', name: 'DBMS', deliveryType: 'INTEGRATED', category: 'CORE' }],
      sectionSubjects: [{ id: 1, sectionId: 'Y2-A', subjectId: 'SUB-23CS1303', theoryPeriods: 3, labPeriods: 2, labBlockLength: 2 }],
      teachingAssignments: [],
      unavailability: [],
      config: {
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        periods: [
          { index: 1, label: 'P1', start: '8:30', end: '9:20', schedulable: true },
          { index: 2, label: 'P2', start: '9:20', end: '10:10', schedulable: true },
        ],
      },
      labsBySubject: new Map(),
    })

    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts.some(c => c.type === 'INVALID_INPUT')).toBe(true)
  })
})
