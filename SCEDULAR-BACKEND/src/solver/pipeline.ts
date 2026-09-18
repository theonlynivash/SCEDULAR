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
export async function generateTimetable(): Promise<GenerationResult> {
  const [faculty, sections, subjects, sectionSubjects, teachingAssignments, unavailability, config, labs, labsBySubject, labsBySectionSubject] =
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
  if (preConflicts.length > 0) return persistFailure(preConflicts)

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
  return { status, runId, assignments: status === 'GREEN' ? assignments : [], unscheduled, conflicts, warnings, generatedAt: new Date().toISOString() }
}

async function persistFailure(conflicts: GenerationResult['conflicts']): Promise<GenerationResult> {
  const runId = await createRun('RED', [])
  await saveConflicts(runId, conflicts)
  return { status: 'RED', runId, assignments: [], unscheduled: [], conflicts, warnings: [], generatedAt: new Date().toISOString() }
}
