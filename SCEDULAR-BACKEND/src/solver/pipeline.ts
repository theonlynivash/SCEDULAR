import type { GenerationResult } from '../types.js'
import {
  createRun,
  getAllLabsByCourse,
  getScheduleConfig,
  listCourseRequirements,
  listCourses,
  listFaculty,
  listFacultyUnavailability,
  listSections,
  listTeacherAssignments,
  saveAssignments,
  saveConflicts,
  saveUnscheduled,
} from '../db/repo.js'
import { preValidate } from './preValidate.js'
import { expandRequirements } from './expand.js'
import { solve, diagnoseUnscheduled } from './csp.js'
import { independentValidate } from './validator.js'

// Section 11 / 19 pipeline:
// Structured Input -> Validation -> Requirement Expansion -> CSP Solver ->
// Independent Validator -> Valid Master Timetable OR Explicit Conflict Map.
export async function generateTimetable(): Promise<GenerationResult> {
  const [faculty, sections, courses, requirements, teacherAssignments, unavailability, config, labsByCourse] =
    await Promise.all([
      listFaculty(),
      listSections(),
      listCourses(),
      listCourseRequirements(),
      listTeacherAssignments(),
      listFacultyUnavailability(),
      getScheduleConfig(),
      getAllLabsByCourse(),
    ])
  const courseById = new Map(courses.map(c => [c.id, c]))

  // Step 2: pre-validation.
  const preConflicts = preValidate({ faculty, sections, courses, requirements, teacherAssignments, config })
  if (preConflicts.length > 0) {
    const runId = await createRun('RED', [])
    await saveConflicts(runId, preConflicts)
    return {
      status: 'RED',
      runId,
      assignments: [],
      unscheduled: [],
      conflicts: preConflicts,
      warnings: [],
      generatedAt: new Date().toISOString(),
    }
  }

  // Step 3: requirement expansion into schedulable units.
  const units = expandRequirements(requirements, courseById, teacherAssignments)

  // Steps 4-6: deterministic CSP/backtracking solve with soft-constraint bias.
  const { assignments, unscheduled, budgetExceeded } = solve(units, faculty, unavailability, config, labsByCourse)

  const conflicts = [] as GenerationResult['conflicts']
  const warnings: string[] = []
  if (budgetExceeded) {
    warnings.push('Solver search budget was exhausted; result reflects a best-effort partial schedule.')
  }
  if (unscheduled.length > 0) {
    conflicts.push(...diagnoseUnscheduled(unscheduled, faculty, unavailability, units, labsByCourse))
  }

  // Step 7: independent post-validator replays every hard constraint against
  // whatever was actually placed, regardless of what the solver believes.
  const postConflicts = independentValidate(assignments, requirements, faculty, unavailability, courseById, config, labsByCourse)
  conflicts.push(...postConflicts)

  const status: GenerationResult['status'] = conflicts.length > 0 ? 'RED' : 'GREEN'

  // Step 8: persist and return either a validated timetable or diagnostics.
  const runId = await createRun(status, warnings)
  if (assignments.length > 0) await saveAssignments(runId, assignments)
  if (conflicts.length > 0) await saveConflicts(runId, conflicts)
  if (unscheduled.length > 0) await saveUnscheduled(runId, unscheduled)

  return {
    status,
    runId,
    assignments,
    unscheduled,
    conflicts,
    warnings,
    generatedAt: new Date().toISOString(),
  }
}
