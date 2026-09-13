// Core domain types shared across the solver pipeline and API layer.
// These mirror the entities defined in the SCEDULAR project report
// (FACULTY, COURSES, SECTIONS, COURSE_REQUIREMENTS, LABS, SCHEDULE_CONFIG,
// ASSIGNMENTS, CONFLICTS).

// A subject with both theory and lab hours (e.g. OOP + OOP_LAB, AIES +
// AIES_LAB) is always modeled as TWO course rows, never one row carrying
// both counts -- INTEGRATED_THEORY takes the theory periods,
// INTEGRATED_LAB the lab periods, whether or not the same faculty teaches
// both halves. LAB_ONLY is reserved for a subject with no theory
// counterpart at all (e.g. TSP). MANDATORY (e.g. Constitution of India,
// Quantitative Aptitude) and ADDITIONAL (e.g. Skills for Career
// Development, Library -- non-mandatory extra periods) are both
// theory-only but distinguished for reporting.
export type ComponentType = 'INTEGRATED_THEORY' | 'INTEGRATED_LAB' | 'LAB_ONLY' | 'THEORY_ONLY' | 'MANDATORY' | 'ADDITIONAL'

export interface Faculty {
  id: string
  name: string
  designation: string | null
  maxDailyPeriods: number
  maxWeeklyPeriods: number
}

export interface FacultyUnavailability {
  facultyId: string
  day: string
  period: number
}

export interface Section {
  id: string
  name: string // e.g. "II-A"
  year: string | null
  semester: string | null
}

export interface Course {
  id: string
  code: string
  name: string
  componentType: ComponentType
  labBlockLength: number // consecutive periods a lab block occupies (normally 3; TSP etc. may differ)
}

export interface Lab {
  id: string
  name: string
}

export interface LabCourseMapping {
  labId: string
  courseId: string
}

// Exact weekly demand for one course taught to one section.
export interface CourseRequirement {
  id: number
  courseId: string
  sectionId: string
  weeklyTheoryPeriods: number
  weeklyLabPeriods: number
}

// Which faculty member teaches which course to which section.
export interface TeacherAssignment {
  id: number
  facultyId: string
  courseId: string
  sectionId: string
}

export interface Period {
  index: number // 1-based, P1, P2, ...
  label: string
  start: string
  end: string
  schedulable: boolean
}

export interface ScheduleConfig {
  workingDays: string[]
  periods: Period[]
}

export type BlockType = 'THEORY' | 'LAB'

// A schedulable unit produced by requirement expansion (step 3 of the pipeline).
// THEORY units occupy exactly one period; LAB units occupy `length` contiguous periods.
export interface SchedulableUnit {
  unitId: string
  sectionId: string
  courseId: string
  facultyId: string
  blockType: BlockType
  length: number // 1 for theory, N for lab blocks
  labId?: string // resolved physical lab candidate pool is derived from LabCourseMapping
}

export interface Assignment {
  day: string
  startPeriod: number
  endPeriod: number
  sectionId: string
  courseId: string
  facultyId: string
  blockType: BlockType
  labId?: string
}

export type ConflictType =
  | 'FACULTY_SHORTAGE'
  | 'LAB_CONFLICT'
  | 'SECTION_CONFLICT'
  | 'TEACHER_UNAVAILABLE'
  | 'WEEKLY_REQUIREMENT_UNSATISFIED'
  | 'INVALID_INPUT'
  | 'NO_FEASIBLE_SOLUTION'
  | 'DAILY_SUBJECT_LIMIT_EXCEEDED'

export interface Conflict {
  type: ConflictType
  message: string
  sectionId?: string
  courseId?: string
  facultyId?: string
  day?: string
  period?: number
}

export type TimetableStatus = 'GREEN' | 'YELLOW' | 'RED'

export interface GenerationResult {
  status: TimetableStatus
  runId: number
  assignments: Assignment[]
  unscheduled: SchedulableUnit[]
  conflicts: Conflict[]
  warnings: string[]
  generatedAt: string
}
