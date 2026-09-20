export type Page =
  | 'login'
  | 'dashboard'
  | 'profile'
  | 'faculty-allocation'
  | 'hod-allocation-review'
  | 'hod-faculty-management'
  | 'faculty'
  | 'subjects'
  | 'data-hub'
  | 'lab-management'
  | 'upload-curriculum'
  | 'upload-workload'
  | 'constraints'
  | 'generate'
  | 'timetable-result'
  | 'view-timetable'
  | 'edit-timetable'
  | 'reports'
  | 'settings'
  | 'about'

export type UserRole = 'FACULTY' | 'HOD'

export interface UserContext {
  role: UserRole
  facultyId: string
  name: string
  designation: string
  department: string
  previousExperience: number
  currentExperience: number
  actualTotalExperience: number
  allocationExperience: number
}

export type PreferenceStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'

export interface FacultySubjectPreference {
  id: number
  facultyId: string
  subjectId: string
  academicYear: string
  semester: string
  preferenceRank: number
  requestedSections: number
  labConfirmed: boolean
  status: PreferenceStatus
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  hodComment?: string
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

export interface Section {
  id: string
  name: string
  year: string | null
  semester: string | null
  department?: string
  studentCount?: number | null
  active?: boolean
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

export interface Subject {
  id: string
  code: string
  name: string
  deliveryType: 'THEORY' | 'INTEGRATED' | 'LAB' | 'PROJECT'
  category: string
  credits?: number
  year?: string
  semester?: string
  theoryPeriods?: number
  labPeriods?: number
  vertical?: string | null
}

export interface SemesterReadiness {
  year: string
  semester: string
  academicYear?: string
  isOdd?: boolean
  curriculumReady: boolean
  sectionsReady: boolean
  facultyReady: boolean
  weightageReady: boolean
  labsReady: boolean
  configReady: boolean
  allocationReady: boolean
  canGenerate: boolean
  missingItems: string[]
  sectionCount?: number
  subjectCount?: number
  timetableReady: boolean
}

export type YearReadiness = SemesterReadiness


