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

// ---------------------------------------------------------------------------
// Canonical scheduling data model (Stage 1).
// These entities deliberately separate subject definition, section-specific
// requirements, and faculty teaching assignments. The legacy Course/* types
// below remain temporarily for the existing solver/API compatibility layer;
// Stage 2/3 will move their consumers to these canonical types.

export type SubjectDeliveryType = 'THEORY' | 'LAB' | 'INTEGRATED'
export type SubjectCategory = 'CORE' | 'ELECTIVE' | 'MANDATORY' | 'ADDITIONAL' | 'OTHER'
export type TeachingComponent = 'THEORY' | 'LAB'

export interface Subject {
  id: string
  code: string
  name: string
  deliveryType: SubjectDeliveryType
  category: SubjectCategory | string
  credits?: number
  year?: string
  semester?: string
  theoryPeriods?: number
  labPeriods?: number
  vertical?: string | null
}

export interface SectionSubject {
  id: number
  sectionId: string
  subjectId: string
  theoryPeriods: number
  labPeriods: number
  labBlockLength: number | null
}

export interface TeachingAssignment {
  id: number
  facultyId: string
  sectionSubjectId: number
  component: TeachingComponent
  batch: string | null
}

export type ComponentType = 'INTEGRATED_THEORY' | 'INTEGRATED_LAB' | 'LAB_ONLY' | 'THEORY_ONLY' | 'MANDATORY' | 'ADDITIONAL'

export type UserRole = 'FACULTY' | 'HOD'

export interface Faculty {
  id: string
  name: string
  designation: string | null
  department?: string
  previousExperience?: number
  currentExperience?: number
  allocationExperience?: number
  email?: string | null
  phone?: string | null
  role?: UserRole
  maxDailyPeriods: number
  maxWeeklyPeriods: number
}

export type PreferenceStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'

export interface FacultySubjectPreference {
  id: number
  facultyId: string
  subjectId: string
  academicYear: string // 'Year 1' | 'Year 2' | 'Year 3' | 'Year 4'
  semester: string // 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII'
  preferenceRank: number // 1 or 2
  requestedSections: number
  labConfirmed: boolean
  status: PreferenceStatus
  submittedAt?: string | null
  reviewedAt?: string | null
  reviewedBy?: string | null
  hodComment?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface FacultySubjectHistory {
  id: number
  facultyId: string
  academicYear: string
  semester: string
  subjectName: string
  subjectCode?: string
  type?: string
  sectionsHandled: number
}

export interface SubjectDemandItem {
  subjectId: string
  subjectCode: string
  subjectName: string
  academicCategory: string
  deliveryType: string
  academicYear: string
  semester: string
  requiredSections: number
  requiredTheoryPeriods?: number
  requiredLabPeriods?: number
  requiredPeriodsWeekly: number
  facultyInterestedCount: number
  submittedCount: number
  approvedCount: number
  requestedSectionTotal: number
  approvedSectionTotal: number
  interestedFacultyList?: Array<{
    preferenceId: number
    facultyId: string
    facultyName: string
    designation: string
    allocationExperience: number
    preferenceRank: number
    requestedSections: number
    status: PreferenceStatus
    submittedAt?: string
  }>
}

export interface FacultyUnavailability {
  facultyId: string
  day: string
  period: number
}

export interface Section {
  id: string
  name: string // e.g. "Y2-A"
  year: string | null
  semester: string | null
  department?: string
  studentCount?: number | null
  active?: boolean
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
  room?: string
  department?: string
  capacity?: number | null
  capacitySource?: 'OFFICIAL' | 'INFERRED' | 'NOT_SPECIFIED'
  active?: boolean
  notes?: string
}

export interface LabCourseMapping {
  labId: string
  courseId: string
}

export interface LabMapping {
  labId: string
  subjectId: string
  sectionId?: string | null
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
  courseId: string // canonical solver path uses subjectId here for backwards API compatibility
  subjectId?: string
  sectionSubjectId?: number
  facultyId?: string // selected faculty for legacy units; canonical units use facultyIds
  facultyIds?: string[] // eligible faculty; solver chooses one per unit
  blockType: BlockType
  length: number // 1 for theory, N for lab blocks
  batch?: string | null
  labIds?: string[] // compatible physical labs for this unit
  labId?: string
}


export interface Assignment {
  day: string
  startPeriod: number
  endPeriod: number
  sectionId: string
  courseId: string
  subjectId?: string
  sectionSubjectId?: number
  facultyId: string
  blockType: BlockType
  batch?: string | null
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
  | 'COLUMN_SUBJECT_LIMIT_EXCEEDED'
  | 'TEACHER_COLLISION'
  | 'DUPLICATE_SCHEDULED_UNIT'

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

export interface InfeasibilityReportItem {
  sectionId?: string
  subjectId?: string
  component?: string
  requiredPeriods?: number
  assignedPeriods?: number
  facultyId?: string
  labId?: string
  violatedConstraint: string
  severity: 'HIGH' | 'CRITICAL' | 'WARNING'
  explanation: string
  suggestedInputArea: string
}

export interface InfeasibilityReport {
  generationRunId: number
  academicYear: string
  year: string
  semester: string
  items: InfeasibilityReportItem[]
  summary: string
}

export interface GenerationResult {
  status: TimetableStatus
  runId: number
  assignments: Assignment[]
  unscheduled: SchedulableUnit[]
  conflicts: Conflict[]
  warnings: string[]
  infeasibilityReport?: InfeasibilityReport
  generatedAt: string
}

// A login session token. Only records WHICH faculty id authenticated -- the
// authoritative role is always re-read from the faculty table, never cached
// here. Persisted like every other entity so sessions survive a restart.
export interface SessionRecord {
  token: string
  facultyId: string
  createdAt: string
}
