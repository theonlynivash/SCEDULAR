import type { Course, CourseRequirement, SchedulableUnit, TeacherAssignment } from '../types.js'

// Pipeline step 3: turn "II-A needs 6 weekly OOP lab periods" into concrete
// schedulable units. A normal lab block is represented as ONE unit spanning
// `course.labBlockLength` contiguous periods -- never as independent
// single-period assignments (Section 6 of the report).
export function expandRequirements(
  requirements: CourseRequirement[],
  courses: Map<string, Course>,
  teacherAssignments: TeacherAssignment[]
): SchedulableUnit[] {
  const teacherByCourseSection = new Map(
    teacherAssignments.map(ta => [`${ta.courseId}::${ta.sectionId}`, ta.facultyId])
  )

  const units: SchedulableUnit[] = []
  for (const req of requirements) {
    const course = courses.get(req.courseId)
    if (!course) continue
    const facultyId = teacherByCourseSection.get(`${req.courseId}::${req.sectionId}`)
    if (!facultyId) continue // reported as INVALID_INPUT during pre-validation

    for (let i = 0; i < req.weeklyTheoryPeriods; i++) {
      units.push({
        unitId: `${req.sectionId}:${req.courseId}:THEORY:${i}`,
        sectionId: req.sectionId,
        courseId: req.courseId,
        facultyId,
        blockType: 'THEORY',
        length: 1,
      })
    }

    const labBlocks = req.weeklyLabPeriods / course.labBlockLength
    for (let i = 0; i < labBlocks; i++) {
      units.push({
        unitId: `${req.sectionId}:${req.courseId}:LAB:${i}`,
        sectionId: req.sectionId,
        courseId: req.courseId,
        facultyId,
        blockType: 'LAB',
        length: course.labBlockLength,
      })
    }
  }
  return units
}
