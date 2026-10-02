import { getLocalDb, type LocalDbState } from '../db/localDb.js'

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING'
  category:
    | 'UNKNOWN_FACULTY'
    | 'UNKNOWN_SUBJECT'
    | 'UNKNOWN_SECTION'
    | 'INVALID_SEMESTER_YEAR'
    | 'DUPLICATE_ASSIGNMENT'
    | 'INVALID_FACULTY_SUBJECT_ASSIGNMENT'
    | 'INCORRECT_COMPONENT'
    | 'WORKLOAD_OVER_ALLOCATION'
    | 'MISSING_REQUIRED_ASSIGNMENT'
    | 'INCONSISTENT_LAB_MAPPING'
  message: string
  details?: Record<string, any>
}

export interface ValidationReport {
  timestamp: string
  valid: boolean
  totalIssues: number
  errorsCount: number
  warningsCount: number
  issues: ValidationIssue[]
}

/**
 * Perform forensic data validation over current application state.
 * Reports discrepancies and errors without mutating or inventing corrections.
 */
export function validateData(state?: LocalDbState): ValidationReport {
  const db = state || getLocalDb()
  const issues: ValidationIssue[] = []

  const facultyMap = new Map(db.faculty.map(f => [f.id, f]))
  const subjectMap = new Map(db.subjects.map(s => [s.id, s]))
  const sectionMap = new Map(db.sections.map(sec => [sec.id, sec]))
  const labMap = new Map(db.labs.map(l => [l.id, l]))
  const sectionSubjectMap = new Map(db.sectionSubjects.map(ss => [ss.id, ss]))

  // 1. Unknown & Invalid Sections / Subjects / Semester-Year alignment in sectionSubjects
  for (const ss of db.sectionSubjects) {
    const sec = sectionMap.get(ss.sectionId)
    const sub = subjectMap.get(ss.subjectId)

    if (!sec) {
      issues.push({
        severity: 'ERROR',
        category: 'UNKNOWN_SECTION',
        message: `SectionSubject #${ss.id} references non-existent sectionId '${ss.sectionId}'.`,
        details: { sectionSubjectId: ss.id, sectionId: ss.sectionId },
      })
    }

    if (!sub) {
      issues.push({
        severity: 'ERROR',
        category: 'UNKNOWN_SUBJECT',
        message: `SectionSubject #${ss.id} references non-existent subjectId '${ss.subjectId}'.`,
        details: { sectionSubjectId: ss.id, subjectId: ss.subjectId },
      })
    }

    if (sec && sub) {
      if (sec.year !== sub.year || sec.semester !== sub.semester) {
        issues.push({
          severity: 'ERROR',
          category: 'INVALID_SEMESTER_YEAR',
          message: `SectionSubject #${ss.id} mismatch: Section ${sec.id} (${sec.year}/${sec.semester}) vs Subject ${sub.code} (${sub.year}/${sub.semester}).`,
          details: { sectionId: sec.id, subjectCode: sub.code, secYear: sec.year, subYear: sub.year, secSem: sec.semester, subSem: sub.semester },
        })
      }
    }
  }

  // Check duplicate section_subjects (UNIQUE section_id + subject_id)
  const seenSecSubKeys = new Set<string>()
  for (const ss of db.sectionSubjects) {
    const key = `${ss.sectionId}::${ss.subjectId}`
    if (seenSecSubKeys.has(key)) {
      issues.push({
        severity: 'ERROR',
        category: 'DUPLICATE_ASSIGNMENT',
        message: `Duplicate sectionSubject entry for section '${ss.sectionId}' and subject '${ss.subjectId}'.`,
        details: { sectionSubjectId: ss.id, sectionId: ss.sectionId, subjectId: ss.subjectId },
      })
    }
    seenSecSubKeys.add(key)
  }

  // 2. Audit Teaching Assignments
  const seenTeachingKeys = new Set<string>()
  const assignmentCountBySecSubComp = new Map<string, number>()

  for (const ta of db.teachingAssignments) {
    const fac = facultyMap.get(ta.facultyId)
    const ss = sectionSubjectMap.get(ta.sectionSubjectId)

    if (!fac) {
      issues.push({
        severity: 'ERROR',
        category: 'UNKNOWN_FACULTY',
        message: `TeachingAssignment #${ta.id} assigned to unknown facultyId '${ta.facultyId}'.`,
        details: { assignmentId: ta.id, facultyId: ta.facultyId },
      })
    }

    if (!ss) {
      issues.push({
        severity: 'ERROR',
        category: 'UNKNOWN_SUBJECT',
        message: `TeachingAssignment #${ta.id} references unknown sectionSubjectId #${ta.sectionSubjectId}.`,
        details: { assignmentId: ta.id, sectionSubjectId: ta.sectionSubjectId },
      })
      continue
    }

    const sub = subjectMap.get(ss.subjectId)

    if (ta.component !== 'THEORY' && ta.component !== 'LAB') {
      issues.push({
        severity: 'ERROR',
        category: 'INCORRECT_COMPONENT',
        message: `TeachingAssignment #${ta.id} has invalid component '${ta.component}'. Must be THEORY or LAB.`,
        details: { assignmentId: ta.id, component: ta.component },
      })
    }

    // Check duplicate teaching assignments
    const key = `${ta.facultyId}::${ta.sectionSubjectId}::${ta.component}::${ta.batch ?? 'ALL'}`
    if (seenTeachingKeys.has(key)) {
      issues.push({
        severity: 'ERROR',
        category: 'DUPLICATE_ASSIGNMENT',
        message: `Duplicate TeachingAssignment #${ta.id} (${key}).`,
        details: { assignmentId: ta.id, key },
      })
    }
    seenTeachingKeys.add(key)

    // Check invalid faculty-subject assignment (component not present on subject)
    if (sub) {
      if (ta.component === 'THEORY' && (!sub.theoryPeriods || sub.theoryPeriods === 0)) {
        issues.push({
          severity: 'ERROR',
          category: 'INVALID_FACULTY_SUBJECT_ASSIGNMENT',
          message: `TeachingAssignment #${ta.id}: Faculty ${ta.facultyId} assigned to THEORY for subject ${sub.code} which has 0 theory periods.`,
          details: { assignmentId: ta.id, subjectCode: sub.code },
        })
      }
      if (ta.component === 'LAB' && (!sub.labPeriods || sub.labPeriods === 0)) {
        issues.push({
          severity: 'ERROR',
          category: 'INVALID_FACULTY_SUBJECT_ASSIGNMENT',
          message: `TeachingAssignment #${ta.id}: Faculty ${ta.facultyId} assigned to LAB for subject ${sub.code} which has 0 lab periods.`,
          details: { assignmentId: ta.id, subjectCode: sub.code },
        })
      }
    }

    // Count component allocations per section-subject
    const countKey = `${ta.sectionSubjectId}::${ta.component}`
    assignmentCountBySecSubComp.set(countKey, (assignmentCountBySecSubComp.get(countKey) ?? 0) + 1)
  }

  // 3. Workload Over-Allocation & Missing Required Assignments
  for (const ss of db.sectionSubjects) {
    const sec = sectionMap.get(ss.sectionId)
    const sub = subjectMap.get(ss.subjectId)
    if (!sec || !sub || sec.active === false) continue

    const theoryAssigned = assignmentCountBySecSubComp.get(`${ss.id}::THEORY`) ?? 0
    const labAssigned = assignmentCountBySecSubComp.get(`${ss.id}::LAB`) ?? 0

    // Missing assignments warning (if system expects active assignments for operational sections)
    if (sub.theoryPeriods && sub.theoryPeriods > 0 && theoryAssigned === 0) {
      issues.push({
        severity: 'WARNING',
        category: 'MISSING_REQUIRED_ASSIGNMENT',
        message: `SectionSubject #${ss.id} (${sec.id} - ${sub.code}) requires THEORY but has no teaching assignment.`,
        details: { sectionSubjectId: ss.id, sectionId: sec.id, subjectCode: sub.code },
      })
    }

    if (sub.labPeriods && sub.labPeriods > 0 && labAssigned === 0) {
      issues.push({
        severity: 'WARNING',
        category: 'MISSING_REQUIRED_ASSIGNMENT',
        message: `SectionSubject #${ss.id} (${sec.id} - ${sub.code}) requires LAB but has no lab teaching assignment.`,
        details: { sectionSubjectId: ss.id, sectionId: sec.id, subjectCode: sub.code },
      })
    }

    // Over-allocation check (e.g. multiple theory teachers for 1 theory section unless explicitly multi-staffed)
    if (theoryAssigned > 1) {
      issues.push({
        severity: 'WARNING',
        category: 'WORKLOAD_OVER_ALLOCATION',
        message: `SectionSubject #${ss.id} (${sec.id} - ${sub.code}) has ${theoryAssigned} faculty assigned to THEORY.`,
        details: { sectionSubjectId: ss.id, theoryAssigned },
      })
    }
  }

  // 4. Inconsistent Lab Mappings
  for (const lm of db.labMappings) {
    const lab = labMap.get(lm.labId)
    const sub = subjectMap.get(lm.subjectId)
    const sec = lm.sectionId ? sectionMap.get(lm.sectionId) : null

    if (!lab) {
      issues.push({
        severity: 'ERROR',
        category: 'INCONSISTENT_LAB_MAPPING',
        message: `Lab mapping references non-existent labId '${lm.labId}'.`,
        details: { labId: lm.labId, subjectId: lm.subjectId },
      })
    }

    if (!sub) {
      issues.push({
        severity: 'ERROR',
        category: 'UNKNOWN_SUBJECT',
        message: `Lab mapping references non-existent subjectId '${lm.subjectId}'.`,
        details: { labId: lm.labId, subjectId: lm.subjectId },
      })
    }

    if (lm.sectionId && !sec) {
      issues.push({
        severity: 'ERROR',
        category: 'UNKNOWN_SECTION',
        message: `Lab mapping references non-existent sectionId '${lm.sectionId}'.`,
        details: { labId: lm.labId, sectionId: lm.sectionId },
      })
    }
  }

  const errorsCount = issues.filter(i => i.severity === 'ERROR').length
  const warningsCount = issues.filter(i => i.severity === 'WARNING').length

  return {
    timestamp: new Date().toISOString(),
    valid: errorsCount === 0,
    totalIssues: issues.length,
    errorsCount,
    warningsCount,
    issues,
  }
}
