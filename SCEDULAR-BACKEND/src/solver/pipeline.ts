import type { GenerationResult } from '../types.js'
import {
  createRun,
  getAllLabsBySubject,
  getAllLabsBySectionSubject,
  getScheduleConfig,
  listFaculty,
  listFacultyUnavailability,
  listLabs,
  listSectionSubjects,
  listSections,
  listSubjects,
  listTeachingAssignments,
  saveAssignments,
  saveConflicts,
  saveUnscheduled,
} from '../db/repo.js'
import { preValidate } from './preValidate.js'
import { expandRequirements } from './expand.js'
import { solve, diagnoseUnscheduled } from './csp.js'
import { independentValidate } from './validator.js'

// Canonical generation pipeline. The legacy Course/Requirement tables are no
// longer the source of scheduling truth. Solver and validator consume the
// canonical section-subject, teaching-assignment and lab-resource model.
//
// An optional `scope` restricts generation to exactly one (year, semester) --
// e.g. so a HOD can generate Year 2 / Semester III on its own once it's
// genuinely ready, without waiting for every other semester in the
// department to also be fully configured. Faculty, labs and schedule config
// remain department-wide reference data and are never filtered; only the
// REQUIRED data (which sections/section-subjects/teaching-assignments must
// be fully staffed) is scoped down.
export async function generateTimetable(scope?: { year: string; semester: string }): Promise<GenerationResult> {
  const [faculty, allSections, subjects, allSectionSubjects, allTeachingAssignments, unavailability, config, labs, labsBySubject, labsBySectionSubject] =
    await Promise.all([
      listFaculty(),
      listSections(),
      listSubjects(),
      listSectionSubjects(),
      listTeachingAssignments(),
      listFacultyUnavailability(),
      getScheduleConfig(),
      listLabs(),
      getAllLabsBySubject(),
      getAllLabsBySectionSubject(),
    ])

  const sections = scope ? allSections.filter(s => s.year === scope.year && s.semester === scope.semester) : allSections
  const scopedSectionIds = new Set(sections.map(s => s.id))
  const sectionSubjects = scope ? allSectionSubjects.filter(ss => scopedSectionIds.has(ss.sectionId)) : allSectionSubjects
  const scopedSectionSubjectIds = new Set(sectionSubjects.map(ss => ss.id))
  const teachingAssignments = scope
    ? allTeachingAssignments.filter(ta => scopedSectionSubjectIds.has(ta.sectionSubjectId))
    : allTeachingAssignments

  const preConflicts = preValidate({
    faculty,
    sections,
    subjects,
    sectionSubjects,
    teachingAssignments,
    unavailability,
    config,
    labsBySubject,
    labsBySectionSubject,
  })
  if (preConflicts.length > 0) return persistFailure(preConflicts, scope)

  const units = expandRequirements({
    sectionSubjects,
    subjects: new Map(subjects.map(s => [s.id, s])),
    teachingAssignments,
    faculty: new Map(faculty.map(f => [f.id, f])),
    labsBySubject,
    labsBySectionSubject,
  })

  const labCapacityById = new Map(labs.map(l => [l.id, l.capacity ?? 1]))
  const { assignments, unscheduled, budgetExceeded } = solve(units, faculty, unavailability, config, labsBySubject, labsBySectionSubject, labCapacityById)
  const conflicts = [] as GenerationResult['conflicts']
  const warnings: string[] = []
  if (budgetExceeded) warnings.push('Solver search budget was exhausted; no complete timetable was proven within the search budget.')
  if (unscheduled.length > 0) conflicts.push(...diagnoseUnscheduled(unscheduled, faculty, unavailability, units, labsBySubject, labsBySectionSubject))

  const postConflicts = independentValidate({
    assignments,
    sections,
    subjects,
    sectionSubjects,
    teachingAssignments,
    faculty,
    unavailability,
    labs,
    config,
    labsBySubject,
    labsBySectionSubject,
  })
  conflicts.push(...postConflicts)

  const status: GenerationResult['status'] = conflicts.length > 0 ? 'RED' : 'GREEN'
  const runId = await createRun(status, warnings)
  if (status === 'GREEN') await saveAssignments(runId, assignments)
  if (conflicts.length > 0) await saveConflicts(runId, conflicts)
  if (unscheduled.length > 0) await saveUnscheduled(runId, unscheduled)

  let infeasibilityReport: GenerationResult['infeasibilityReport'] = undefined
  if (conflicts.length > 0 || unscheduled.length > 0) {
    const reportItems = conflicts.map(c => ({
      sectionId: c.sectionId,
      subjectId: c.courseId,
      component: c.type.includes('LAB') ? 'LAB' : 'THEORY',
      facultyId: c.facultyId,
      violatedConstraint: c.type,
      severity: (c.type === 'INVALID_INPUT' ? 'CRITICAL' : 'HIGH') as 'CRITICAL' | 'HIGH' | 'WARNING',
      explanation: c.message,
      suggestedInputArea: c.type.includes('FACULTY')
        ? 'Faculty Workload / Requested Capacity'
        : c.type.includes('LAB')
        ? 'Physical Lab Resource Mapping'
        : 'Section Offering & Schedule Configuration',
    }))

    infeasibilityReport = {
      generationRunId: runId,
      academicYear: '2026-27',
      year: scope?.year ?? sections[0]?.year ?? 'Year 2',
      semester: scope?.semester ?? sections[0]?.semester ?? 'III',
      items: reportItems,
      summary: `Generation incomplete: ${conflicts.length} conflict(s) and ${unscheduled.length} unscheduled unit(s) detected.`,
    }
  }

  return { status, runId, assignments: status === 'GREEN' ? assignments : [], unscheduled, conflicts, warnings, infeasibilityReport, generatedAt: new Date().toISOString() }
}

async function persistFailure(conflicts: GenerationResult['conflicts'], scope?: { year: string; semester: string }): Promise<GenerationResult> {
  const runId = await createRun('RED', [])
  await saveConflicts(runId, conflicts)
  const reportItems = conflicts.map(c => ({
    sectionId: c.sectionId,
    subjectId: c.courseId,
    component: c.type.includes('LAB') ? 'LAB' : 'THEORY',
    facultyId: c.facultyId,
    violatedConstraint: c.type,
    severity: 'CRITICAL' as const,
    explanation: c.message,
    suggestedInputArea: c.type.includes('FACULTY')
      ? 'Faculty Workload / Requested Capacity'
      : c.type.includes('LAB')
      ? 'Physical Lab Resource Mapping'
      : 'Section Offering & Schedule Configuration',
  }))

  return {
    status: 'RED',
    runId,
    assignments: [],
    unscheduled: [],
    conflicts,
    warnings: [],
    infeasibilityReport: {
      generationRunId: runId,
      academicYear: '2026-27',
      year: scope?.year ?? 'Year 2',
      semester: scope?.semester ?? 'III',
      items: reportItems,
      summary: `Generation blocked during pre-validation: ${conflicts.length} error(s) found.`,
    },
    generatedAt: new Date().toISOString(),
  }
}
