import type { Conflict, Course, CourseRequirement, Faculty, ScheduleConfig, Section, TeacherAssignment } from '../types.js'
import { contiguousGroups } from '../utils/grid.js'

export interface PreValidationInput {
  faculty: Faculty[]
  sections: Section[]
  courses: Course[]
  requirements: CourseRequirement[]
  teacherAssignments: TeacherAssignment[]
  config: ScheduleConfig
}

// Pipeline step 2 (Section 11 / 16): reject malformed or incomplete input
// before the solver ever runs. Every conflict here is INVALID_INPUT because
// it reflects a data problem, not a scheduling impossibility.
export function preValidate(input: PreValidationInput): Conflict[] {
  const conflicts: Conflict[] = []
  const facultyIds = new Set(input.faculty.map(f => f.id))
  const sectionIds = new Set(input.sections.map(s => s.id))
  const courseIds = new Set(input.courses.map(c => c.id))
  const courseById = new Map(input.courses.map(c => [c.id, c]))

  const groups = contiguousGroups(input.config.periods)
  const maxContiguousRun = Math.max(...groups.map(g => g.length))

  // Duplicate (course, section) requirement rows.
  const reqKeySeen = new Set<string>()
  for (const r of input.requirements) {
    const key = `${r.courseId}::${r.sectionId}`
    if (reqKeySeen.has(key)) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Duplicate course requirement row for course ${r.courseId} / section ${r.sectionId}`,
        courseId: r.courseId,
        sectionId: r.sectionId,
      })
    }
    reqKeySeen.add(key)

    if (!sectionIds.has(r.sectionId)) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Course requirement references unknown section ${r.sectionId}`,
        sectionId: r.sectionId,
        courseId: r.courseId,
      })
    }
    if (!courseIds.has(r.courseId)) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Course requirement references unknown course ${r.courseId}`,
        courseId: r.courseId,
        sectionId: r.sectionId,
      })
      continue
    }
    if (r.weeklyTheoryPeriods < 0 || r.weeklyLabPeriods < 0) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Negative weekly period count for course ${r.courseId} / section ${r.sectionId}`,
        courseId: r.courseId,
        sectionId: r.sectionId,
      })
    }

    const course = courseById.get(r.courseId)!
    if (r.weeklyLabPeriods > 0) {
      if (r.weeklyLabPeriods % course.labBlockLength !== 0) {
        conflicts.push({
          type: 'INVALID_INPUT',
          message: `Impossible block definition: ${r.weeklyLabPeriods} weekly lab periods for course ${r.courseId} is not a multiple of its block length (${course.labBlockLength})`,
          courseId: r.courseId,
          sectionId: r.sectionId,
        })
      }
      if (course.labBlockLength > maxContiguousRun) {
        conflicts.push({
          type: 'INVALID_INPUT',
          message: `Course ${r.courseId} requires a ${course.labBlockLength}-period contiguous lab block, but the longest contiguous run in the schedule grid is ${maxContiguousRun} periods`,
          courseId: r.courseId,
          sectionId: r.sectionId,
        })
      }
    }
    // A course row is unambiguously theory-only or lab-only by type -- an
    // "integrated" subject is always two paired rows (INTEGRATED_THEORY +
    // INTEGRATED_LAB), never one row carrying both counts, so any row
    // whose counts contradict its declared type signals the exact
    // ambiguity this taxonomy exists to rule out (Section 7).
    if ((course.componentType === 'LAB_ONLY' || course.componentType === 'INTEGRATED_LAB') && r.weeklyTheoryPeriods > 0) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Course ${r.courseId} is ${course.componentType} but has theory periods requested -- split theory into its own INTEGRATED_THEORY row`,
        courseId: r.courseId,
        sectionId: r.sectionId,
      })
    }
    if (
      (course.componentType === 'THEORY_ONLY' || course.componentType === 'INTEGRATED_THEORY' || course.componentType === 'MANDATORY' || course.componentType === 'ADDITIONAL') &&
      r.weeklyLabPeriods > 0
    ) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Course ${r.courseId} is ${course.componentType} but has lab periods requested -- split lab into its own INTEGRATED_LAB row`,
        courseId: r.courseId,
        sectionId: r.sectionId,
      })
    }
  }

  // Teacher assignments must reference valid entities and be unique per (course, section).
  const taKeySeen = new Set<string>()
  const taByCourseSection = new Map<string, TeacherAssignment>()
  for (const ta of input.teacherAssignments) {
    const key = `${ta.courseId}::${ta.sectionId}`
    if (taKeySeen.has(key)) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Duplicate teacher assignment for course ${ta.courseId} / section ${ta.sectionId}`,
        courseId: ta.courseId,
        sectionId: ta.sectionId,
      })
    }
    taKeySeen.add(key)
    taByCourseSection.set(key, ta)

    if (!facultyIds.has(ta.facultyId)) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Teacher assignment references unknown faculty ${ta.facultyId}`,
        facultyId: ta.facultyId,
        courseId: ta.courseId,
        sectionId: ta.sectionId,
      })
    }
    if (!sectionIds.has(ta.sectionId)) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Teacher assignment references unknown section ${ta.sectionId}`,
        sectionId: ta.sectionId,
      })
    }
    if (!courseIds.has(ta.courseId)) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `Teacher assignment references unknown course ${ta.courseId}`,
        courseId: ta.courseId,
      })
    }
  }

  // Every requirement needs an eligible teacher (missing teacher = INVALID_INPUT,
  // distinct from FACULTY_SHORTAGE which is a capacity problem discovered by the solver).
  for (const r of input.requirements) {
    const key = `${r.courseId}::${r.sectionId}`
    if ((r.weeklyTheoryPeriods > 0 || r.weeklyLabPeriods > 0) && !taByCourseSection.has(key)) {
      conflicts.push({
        type: 'INVALID_INPUT',
        message: `No teacher assigned to teach course ${r.courseId} to section ${r.sectionId}`,
        courseId: r.courseId,
        sectionId: r.sectionId,
      })
    }
  }

  return conflicts
}
