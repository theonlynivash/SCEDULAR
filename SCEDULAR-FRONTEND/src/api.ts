// Thin client for the SCEDULAR backend (SCEDULAR-BACKEND, a separate
// Node/Express/PostgreSQL service). All scheduling logic lives server-side;
// this file only shapes fetch calls and mirrors the backend's types.
//
// URL resolution:
//   1. VITE_API_URL env var (explicit, highest priority)
//   2. Vercel deploy → same-origin `/api` (vercel.json rewrites)
//   3. Local dev  → `http://localhost:8090/api`
function resolveApiBase(): string {
  const env = (import.meta as any).env ?? {}
  if (env.VITE_API_URL && String(env.VITE_API_URL).trim() !== '') {
    return String(env.VITE_API_URL).trim().replace(/\/$/, '')
  }
  const onVercel =
    !!env.VERCEL ||
    !!env.VITE_VERCEL_URL ||
    (typeof location !== 'undefined' && /\.vercel\.app$/.test(location.hostname))
  if (onVercel) return '/api'
  return 'http://localhost:8090/api'
}

export const API_BASE = resolveApiBase()

/** Download a protected file (needs the session token, so a plain <a href> would not work). */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = getSessionToken()
  const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    let msg = `Download failed (${res.status})`
    try { const b = await res.json(); if (b?.message) msg = b.message } catch { /* keep default */ }
    throw new Error(msg)
  }
  const name = /filename="?([^"]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

import { getSessionToken } from './session'

async function request<T>(path: string, options: RequestInit = {}, acceptedStatuses: number[] = []): Promise<T> {
  const token = getSessionToken()
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  const headers =
    options.body instanceof FormData
      ? { ...authHeaders, ...(options.headers as Record<string, string> | undefined) }
      : { 'Content-Type': 'application/json', ...authHeaders, ...(options.headers as Record<string, string> | undefined) }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok && !acceptedStatuses.includes(res.status)) {
    let message = `Request failed (${res.status})`
    let code: string | undefined
    try {
      const body = await res.json()
      code = typeof body.error === 'string' ? body.error : undefined
      message = typeof body.message === 'string' && body.message
        ? body.message
        : typeof body.error === 'string' ? body.error : JSON.stringify(body.error ?? body)
    } catch {
      // ignore, use default message
    }
    throw Object.assign(new Error(message), { code, status: res.status })
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------- Types (mirrors SCEDULAR-BACKEND/src/types.ts) ----------

export type ComponentType =
  | 'INTEGRATED_THEORY'
  | 'INTEGRATED_LAB'
  | 'LAB_ONLY'
  | 'THEORY_ONLY'
  | 'PROJECT'

export interface FacultyUnavailability {
  day: string
  period: number
}

export interface Faculty {
  id: string
  name: string
  designation: string | null
  previousExperience?: number
  currentExperience?: number
  allocationExperience?: number
  email?: string | null
  role?: "HOD" | "FACULTY"
  maxDailyPeriods: number
  maxWeeklyPeriods: number
  unavailability: FacultyUnavailability[]
}

export interface Section {
  id: string
  name: string
  year: string | null
  semester: string | null
  studentCount?: number | null
  active?: boolean
  classIncharge?: string | null
}

export interface Course {
  id: string
  code: string
  name: string
  componentType: ComponentType
  labBlockLength: number
}

export interface Lab {
  id: string
  name: string
  capacity?: number | null
  courseIds: string[]
}

export type SubjectDeliveryType = 'THEORY' | 'INTEGRATED' | 'LAB' | 'PROJECT'
export type SubjectCategory =
  | 'CORE'
  | 'BASIC_SCIENCE'
  | 'ENGINEERING_SCIENCE'
  | 'HUMANITIES'
  | 'INTEGRATED'
  | 'THEORY'
  | 'LAB_ONLY'
  | 'MANDATORY'
  | 'ADDITIONAL'
  | 'PROFESSIONAL_ELECTIVE'
  | 'OPEN_ELECTIVE'
  | 'PROJECT'
  | 'TRAINING'
  | 'VALUE_ADDED'
  | 'OTHER'
export type TeachingComponent = 'THEORY' | 'LAB'
export interface Subject { id: string; code: string; name: string; shortName?: string | null; deliveryType: SubjectDeliveryType; category: SubjectCategory; year?: string; semester?: string; theoryPeriods?: number; labPeriods?: number; credits?: number; vertical?: string | null }
export interface SectionSubject { id: number; sectionId: string; subjectId: string; theoryPeriods: number; labPeriods: number; labBlockLength: number | null }
export interface TeachingAssignment { id: number; facultyId: string; sectionSubjectId: number; component: TeachingComponent; batch: string | null }


export interface CourseRequirement {
  courseId: string
  sectionId: string
  weeklyTheoryPeriods: number
  weeklyLabPeriods: number
}

export interface TeacherAssignment {
  facultyId: string
  courseId: string
  sectionId: string
}

export interface Period {
  index: number
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
  unscheduled: unknown[]
  conflicts: Conflict[]
  warnings: string[]
  generatedAt: string
}

export interface RunDetail {
  id: number
  status: TimetableStatus
  generatedAt: string
  warnings: string[]
  assignments: Assignment[]
  conflicts: Conflict[]
  unscheduled: unknown[]
}

export interface ImportDiagnostic {
  code: string
  severity: 'ERROR' | 'WARNING'
  sheet?: string
  row?: number
  field?: string
  entity?: string
  entityId?: string
  message: string
  details?: Record<string, unknown>
}

export interface MasterImportPreview {
  valid: boolean
  summary: Record<string, number>
  errors: ImportDiagnostic[]
  warnings: ImportDiagnostic[]
}

export interface MasterImportCommitResult {
  ok: true
  imported: Record<string, number>
  warnings: ImportDiagnostic[]
}

export interface MasterDatasetStatus {
  counts: Record<string, number>
}

// ---------- API surface ----------

export interface AuthUser {
  facultyId: string
  name: string
  designation: string | null
  department?: string | null
  role: 'HOD' | 'FACULTY'
}

export interface FacultyProfile {
  id: string
  name: string
  designation: string | null
  department?: string | null
  previousExperience?: number | null
  currentExperience?: number | null
  allocationExperience?: number | null
  email?: string | null
  phone?: string | null
  role?: 'HOD' | 'FACULTY'
  maxDailyPeriods: number
  maxWeeklyPeriods: number
}

export interface FacultySubjectDTO {
  id: string
  code: string
  name: string
  category: string | null
  deliveryType: 'THEORY' | 'INTEGRATED' | 'LAB' | 'PROJECT'
  credits: number | null
  theoryPeriods: number | null
  labPeriods: number | null
  year: string | null
  semester: string | null
}

export interface SemesterSubjectsResponse {
  semester: string
  year: string
  availableSections: number
  maxRequestedSections: number
  subjects: FacultySubjectDTO[]
  currentCycle?: import('./academicCycle').AcademicCycle
  cycle?: 'ODD' | 'EVEN' | null
  inCurrentCycle?: boolean
}

export interface CycleContextResponse {
  currentCycle: import('./academicCycle').AcademicCycle
  allowedSemesters: string[]
  oddSemesters: string[]
  evenSemesters: string[]
  allSemesters: string[]
  semesterToYear: Record<string, string>
}

export interface AllocationBandDTO {
  id: string
  name: string
  minExperience: number
  maxExperience: number | null
  eligibleYears: string[]
  maxTotalPreferences: number
  maxPreferencesPerYear: number
}

export interface AllocationPolicyResponse {
  allocationExperience: number | null
  policy: {
    allocationExperience: number | null
    band: AllocationBandDTO
    eligibleYears: string[]
    lockedYears: string[]
    maxTotalPreferences: number
    maxPreferencesPerYear: number
    reasons: Record<string, string>
  }
  config: unknown
  currentCycle?: import('./academicCycle').AcademicCycle
  allowedSemesters?: string[]
}

export type PreferenceStatusDTO = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'

export interface FacultyPreference {
  id: number
  facultyId: string
  subjectId: string
  academicYear: string
  semester: string
  preferenceRank: number
  requestedSections: number
  labConfirmed: boolean
  status: PreferenceStatusDTO
  submittedAt?: string | null
  reviewedAt?: string | null
  reviewedBy?: string | null
  hodComment?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface FacultyHistoryItem {
  id: number
  facultyId: string
  academicYear: string
  semester: string
  subjectName: string
  subjectCode?: string
  type?: string
  sectionsHandled: number
}

export interface StaffingReport {
  cycle: string; maxWeeklyPeriods: number; avgSectionsPerTeacher: number; teachers: number
  totalDemandPeriods: number; assignedPeriods: number; openPeriods: number
  teachersNeeded: number; moreTeachersNeeded: number; enough: boolean; message: string
  bySemester: { semester: string; sections: number; demandPeriods: number; assignedPeriods: number; openPeriods: number }[]
  subjects: { subjectId: string; code: string; name: string; semester: string; sections: number; periodsPerSection: number; totalPeriods: number; teachersWanted: number; chosen: number; slotsLeft: number; openSections: number }[]
}

export interface SubjectDemandDTO {
  teachersWanted?: number
  slotsTaken?: number
  slotsLeft?: number
  avgSectionsPerTeacher?: number
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
  interestCount: number
  submittedCount: number
  approvedCount: number
  requestedSectionTotal: number
  approvedSectionTotal: number
  assignedSections?: number
}

export interface PreferenceItemPayload {
  subjectId: string
  subjectCode?: string
  academicYear?: string
  semester?: string
  preferenceRank: number
  requestedSections?: number
  labConfirmed?: boolean
}

export interface AssignBoardSubject {
  subjectId: string
  code: string
  name: string
  year: string
  deliveryType: string
  perSection: { theory: number; lab: number }
  teachersWanted?: number
  sectionCount: number
  assignedCount: number
  sections: { sectionId: string; sectionName: string; theoryPeriods: number; labPeriods: number; facultyId: string | null; facultyName: string | null; complete: boolean }[]
  interested: { facultyId: string; facultyName: string; rank: number; approved: boolean }[]
  teachers: { facultyId: string; facultyName: string; sectionIds: string[]; theory: number; lab: number }[]
}
export interface SetupSubject {
  id: string; code: string; name: string; year: string | null; semester: string | null
  deliveryType: 'THEORY' | 'INTEGRATED' | 'LAB' | 'PROJECT'; category: string; credits: number
  theoryPeriods: number; labPeriods: number
  sectionIds: string[]; sectionNames: string[]; labIds: string[]; staffed: number
  shortName: string | null; ltp: [number, number, number] | null; printAs: 'THEORY' | 'PRACTICAL' | null
}
export interface SetupSubjectInput {
  code: string; name: string; semester: string; deliveryType: 'THEORY' | 'INTEGRATED' | 'LAB'
  theoryPeriods: number; labPeriods: number; credits?: number; category?: string; sectionIds?: string[]; labIds?: string[]
  shortName?: string | null; ltp?: [number, number, number] | null; printAs?: 'THEORY' | 'PRACTICAL' | null
}
export interface SetupOverview {
  cycle: string
  semesters: { semester: string; year: string; sections: number; subjects: number; subjectsOffered: number; offerings: number; staffed: number; choices: number; choicesPending: number }[]
  teachers: { total: number; withLogin: number }
  labs: number
}
export interface FacultyResultRow {
  id: number; academicYear: string; semester: string; subjectId?: string | null; subjectCode?: string | null; subjectName: string
  sectionsHandled?: number | null; studentsAppeared?: number | null; passPercent: number; createdAt: string
}
export interface ResultSummary {
  count: number; average: number | null; weightedAverage: number | null; best: number | null; lowest: number | null
  bySemester: { label: string; average: number; entries: number }[]
}
export interface MailStatus { configured: boolean; mode: 'smtp' | 'json' | 'fail' | 'off'; from: string | null }
export interface MailLogRow { id: number; facultyId: string; to: string; subject: string; credentials: 'none' | 'id' | 'new'; sentBy: string; sentAt: string }

export interface IssuedLogin { facultyId: string; name: string; password: string }

export interface AutoAssignResult {
  dryRun: boolean
  assignedSections: number
  plan: { subjectId: string; code: string; name: string; facultyId: string; facultyName: string; sectionIds: string[]; periods: number; loadAfter: number; max: number }[]
  leftover: { subjectId: string; code: string; name: string; remaining: number; reason: string }[]
  staffing?: StaffingReport
}
export interface AssignBoard {
  semester: string
  cycle: string
  subjects: AssignBoardSubject[]
  teachers: { facultyId: string; name: string; experience: number | null; load: number; max: number }[]
}

export interface MsgThread { id: string; name: string; designation: string | null; lastText: string | null; lastAt: string | null; lastFromMe: boolean | null; unread: number }
export interface ChatMsg { id: number; fromId: string; toId: string; text: string; sentAt: string; readAt: string | null }

export const api = {
  auth: {
    login: (facultyId: string, password: string) =>
      request<{ success: boolean; token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ facultyId, password }),
      }),
    forgot: (identifier: string) =>
      request<{ success: boolean; message: string; sentTo?: string }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ identifier }) }),
    reset: (identifier: string, code: string, newPassword: string) =>
      request<{ success: boolean; message: string }>('/auth/reset', { method: 'POST', body: JSON.stringify({ identifier, code, newPassword }) }),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    me: () => request<AuthUser>('/auth/me'),
  },
  faculty: {
    list: () => request<Faculty[]>('/faculty'),
    get: (id: string) => request<Faculty>(`/faculty/${id}`),
    profile: (id: string) => request<FacultyProfile>(`/faculty/${id}`),
    updateExperience: (id: string, fields: { previousExperience?: number; currentExperience?: number; allocationExperience?: number }) =>
      request<FacultyProfile>(`/faculty/${id}/experience`, { method: 'PATCH', body: JSON.stringify(fields) }),
    create: (f: Omit<Faculty, 'unavailability'>) =>
      request<Faculty>('/faculty', { method: 'POST', body: JSON.stringify(f) }),
    update: (id: string, f: Omit<Faculty, 'id' | 'unavailability'>) =>
      request<Faculty>(`/faculty/${id}`, { method: 'PUT', body: JSON.stringify(f) }),
    remove: (id: string) => request<void>(`/faculty/${id}`, { method: 'DELETE' }),
  },
  sections: {
    list: () => request<Section[]>('/sections'),
    create: (s: Section) => request<Section>('/sections', { method: 'POST', body: JSON.stringify(s) }),
    remove: (id: string) => request<void>(`/sections/${id}`, { method: 'DELETE' }),
  },
  courses: {
    list: () => request<Course[]>('/courses'),
    create: (c: Course) => request<Course>('/courses', { method: 'POST', body: JSON.stringify(c) }),
    remove: (id: string) => request<void>(`/courses/${id}`, { method: 'DELETE' }),
  },
  labs: {
    list: () => request<Lab[]>('/labs'),
    create: (l: { id: string; name: string; capacity?: number | null }) => request<Lab>('/labs', { method: 'POST', body: JSON.stringify(l) }),
    remove: (id: string) => request<void>(`/labs/${id}`, { method: 'DELETE' }),
    mapCourse: (labId: string, courseId: string) =>
      request('/labs/mapping', { method: 'POST', body: JSON.stringify({ labId, courseId }) }),
    unmapCourse: (labId: string, courseId: string) =>
      request<void>(`/labs/mapping?labId=${encodeURIComponent(labId)}&courseId=${encodeURIComponent(courseId)}`, { method: 'DELETE' }),
    subjectMappings: () => request<{ labId: string; subjectId: string; sectionId: string | null }[]>('/labs/subject-mapping'),
    mapSubject: (labId: string, subjectId: string, sectionId?: string | null) =>
      request('/labs/subject-mapping', { method: 'POST', body: JSON.stringify({ labId, subjectId, sectionId: sectionId ?? null }) }),
    unmapSubject: (labId: string, subjectId: string, sectionId?: string | null) =>
      request<void>(`/labs/subject-mapping?labId=${encodeURIComponent(labId)}&subjectId=${encodeURIComponent(subjectId)}&sectionId=${encodeURIComponent(sectionId ?? '')}`, { method: 'DELETE' }),
  },
  config: {
    get: () => request<ScheduleConfig>('/config'),
    update: (cfg: ScheduleConfig) => request<ScheduleConfig>('/config', { method: 'PUT', body: JSON.stringify(cfg) }),
  },
  subjects: {
    list: () => request<Subject[]>('/subjects'),
    create: (s: Subject) => request<Subject>('/subjects', { method: 'POST', body: JSON.stringify(s) }),
    update: (id: string, s: Omit<Subject, 'id'>) => request<Subject>(`/subjects/${id}`, { method: 'PUT', body: JSON.stringify({ id, ...s }) }),
    remove: (id: string) => request<void>(`/subjects/${id}`, { method: 'DELETE' }),
  },
  sectionSubjects: {
    list: () => request<SectionSubject[]>('/section-subjects'),
    create: (s: Omit<SectionSubject, 'id'>) => request<SectionSubject>('/section-subjects', { method: 'POST', body: JSON.stringify(s) }),
  },
  teachingAssignments: {
    list: () => request<TeachingAssignment[]>('/teaching-assignments'),
    create: (a: Omit<TeachingAssignment, 'id'>) => request<TeachingAssignment>('/teaching-assignments', { method: 'POST', body: JSON.stringify(a) }),
    remove: (id: number) => request<void>(`/teaching-assignments/${id}`, { method: 'DELETE' }),
    getSectionAllocation: (year: string, semester: string) =>
      request<any>(`/teaching-assignments/section-allocation?year=${encodeURIComponent(year)}&semester=${encodeURIComponent(semester)}`),
    commitSectionAllocation: (payload: { year: string; semester: string; allocations: Array<{ facultyId: string; sectionSubjectId: number; component: 'THEORY' | 'LAB'; batch?: string }> }) =>
      request<any>('/teaching-assignments/commit-section-allocation', { method: 'POST', body: JSON.stringify(payload) }),
  },
  workload: {
    listRequirements: () => request<CourseRequirement[]>('/workload/requirements'),
    createRequirement: (r: CourseRequirement) =>
      request('/workload/requirements', { method: 'POST', body: JSON.stringify(r) }),
    listTeacherAssignments: () => request<TeacherAssignment[]>('/workload/teacher-assignments'),
    createTeacherAssignment: (a: TeacherAssignment) =>
      request('/workload/teacher-assignments', { method: 'POST', body: JSON.stringify(a) }),
  },
  importMaster: {
    preview: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<MasterImportPreview>('/import/master/preview', { method: 'POST', body: form }, [422])
    },
    status: () => request<MasterDatasetStatus>('/import/master/status'),
    commit: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<MasterImportCommitResult>('/import/master/commit', { method: 'POST', body: form })
    },
  },
  importFacultyWorkload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ totalRows: number; imported: number; rejected: number; rejectedRows: { row: number; issues: unknown }[] }>(
      '/import/faculty-workload',
      { method: 'POST', body: form }
    )
  },
  importSubjects: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ totalRows: number; imported: number; rejected: number; rejectedRows: { row: number; issues: unknown }[] }>(
      '/import/subjects',
      { method: 'POST', body: form }
    )
  },
  timetable: {
    generate: (scope?: { year: string; semester: string }) =>
      request<GenerationResult>('/timetable/generate', { method: 'POST', body: JSON.stringify(scope ?? {}) }),
    regenerate: () => request<GenerationResult>('/timetable/regenerate', { method: 'POST' }),
    run: (runId: number) => request<RunDetail>(`/timetable/runs/${runId}`),
    master: () => request<{ runId: number; status: TimetableStatus; generatedAt: string; assignments: Assignment[] }>(
      '/timetable/master'
    ),
    section: (sectionId: string) =>
      request<{ runId: number; sectionId: string; assignments: Assignment[] }>(`/timetable/section/${sectionId}`),
    faculty: (facultyId: string) =>
      request<{ runId: number; facultyId: string; assignments: Assignment[] }>(`/timetable/faculty/${facultyId}`),
    lab: (labId: string) =>
      request<{ runId: number; labId: string; assignments: Assignment[] }>(`/timetable/lab/${labId}`),
    conflicts: (runId: number) =>
      request<{ runId: number; conflicts: Conflict[]; unscheduled: unknown[] }>(`/timetable/conflicts/${runId}`),
  },
  results: {
    mine: () => request<{ results: FacultyResultRow[]; summary: ResultSummary }>('/faculty/results'),
    add: (b: { academicYear: string; semester: string; subjectId?: string | null; subjectName?: string; subjectCode?: string | null; sectionsHandled?: number | null; studentsAppeared?: number | null; passPercent: number }) =>
      request<FacultyResultRow>('/faculty/results', { method: 'POST', body: JSON.stringify(b) }),
    remove: (id: number) => request<{ success: boolean }>(`/faculty/results/${id}`, { method: 'DELETE' }),
    hodOverview: () => request<Record<string, { count: number; average: number | null; weightedAverage: number | null }>>('/hod/faculty-results'),
    hodAll: () => request<{ teachers: { facultyId: string; name: string; designation: string | null; results: FacultyResultRow[]; summary: ResultSummary }[]; totalTeachers: number }>('/hod/faculty-results-all'),
    hodDetail: (facultyId: string) => request<{ results: FacultyResultRow[]; summary: ResultSummary }>(`/hod/faculty-results/${encodeURIComponent(facultyId)}`),
  },
  contact: {
    update: (b: { email?: string | null; phone?: string | null }) => request<{ email: string | null; phone: string | null }>('/faculty/me/contact', { method: 'PATCH', body: JSON.stringify(b) }),
  },
  messages: {
    threads: () => request<MsgThread[]>('/messages/threads'),
    unread: () => request<{ count: number }>('/messages/unread'),
    thread: (otherId: string) => request<ChatMsg[]>(`/messages/thread/${encodeURIComponent(otherId)}`),
    send: (toId: string, text: string) => request<ChatMsg>('/messages', { method: 'POST', body: JSON.stringify({ toId, text }) }),
  },
  erase: {
    summary: () => request<{ preferences: number; teachingAssignments: number; workloadAllocations: number; generatedRuns: number }>('/hod/erase/summary'),
    preferences: (password: string) => request<{ success: boolean; erasedPreferences: number }>('/hod/erase/preferences', { method: 'POST', body: JSON.stringify({ password }) }),
    allocation: (password: string) => request<{ success: boolean; erased: { teachingAssignments: number; workloadAllocations: number; generatedRuns: number } }>('/hod/erase/allocation', { method: 'POST', body: JSON.stringify({ password }) }),
  },
  assistant: {
    status: () => request<{ enabled: boolean }>('/assistant/status'),
    chat: (messages: { role: 'user' | 'assistant'; content: string }[]) =>
      request<{ reply: string; drafts: { facultyId: string; name: string; email: string | null; subject: string; body: string }[] }>('/assistant/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  },
  mail: {
    status: () => request<MailStatus>('/hod/mail/status'),
    check: () => request<{ ok: boolean; message: string }>('/hod/mail/check', { method: 'POST' }),
    draft: (facultyId: string, prompt: string) => request<{ subject: string; body: string; source: 'ai' | 'template' }>('/hod/mail/draft', { method: 'POST', body: JSON.stringify({ facultyId, prompt }) }),
    send: (b: { facultyId: string; subject: string; body: string; credentials: 'none' | 'id' | 'new' }) => request<{ sent: boolean; to: string }>('/hod/mail/send', { method: 'POST', body: JSON.stringify(b) }),
    log: (facultyId: string) => request<MailLogRow[]>(`/hod/mail/log?facultyId=${encodeURIComponent(facultyId)}`),
  },
  setup: {
    overview: () => request<SetupOverview>('/setup/overview'),
    listSubjects: () => request<SetupSubject[]>('/setup/subjects'),
    createSubject: (b: SetupSubjectInput) => request<{ id: string }>('/setup/subjects', { method: 'POST', body: JSON.stringify(b) }),
    updateSubject: (id: string, b: SetupSubjectInput) => request<{ id: string }>(`/setup/subjects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) }),
    deleteSubject: (id: string) => request<{ success: boolean }>(`/setup/subjects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createSections: (semester: string, count: number) => request<{ created: string[] }>('/setup/sections', { method: 'POST', body: JSON.stringify({ semester, count }) }),
    setClassIncharge: (id: string, facultyId: string | null) => request<{ id: string; classIncharge: string | null }>(`/setup/sections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ classIncharge: facultyId }) }),
    deleteSection: (id: string) => request<{ success: boolean }>(`/setup/sections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createTeacher: (b: { name: string; designation?: string | null; email?: string | null; allocationExperience?: number; maxWeeklyPeriods?: number }) =>
      request<IssuedLogin>('/setup/faculty', { method: 'POST', body: JSON.stringify(b) }),
    updateTeacher: (id: string, b: { name?: string; designation?: string | null; email?: string | null; allocationExperience?: number; maxWeeklyPeriods?: number }) =>
      request<any>(`/setup/faculty/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(b) }),
    issueLogin: (id: string, password?: string) => request<IssuedLogin>(`/setup/faculty/${encodeURIComponent(id)}/credentials`, { method: 'POST', body: JSON.stringify({ password }) }),
    issueMissingLogins: () => request<{ issued: IssuedLogin[] }>('/setup/faculty-credentials/missing', { method: 'POST' }),
    logins: () => request<Record<string, boolean>>('/setup/faculty-logins'),
    deleteTeacher: (id: string) => request<{ success: boolean }>(`/setup/faculty/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  facultyAllocation: {
    // Identity always comes from the authenticated session — these calls send no
    // client-trusted facultyId. The backend resolves (and re-verifies) it.
    getMe: () => request<FacultyProfile>('/faculty/me'),
    getPreferences: () => request<{ preferences: FacultyPreference[] }>('/faculty/preferences'),
    getHistory: () => request<{ history: FacultyHistoryItem[] }>('/faculty/history'),
    getAllocationPolicy: () => request<AllocationPolicyResponse>('/faculty/allocation-policy'),
    getCycleContext: () => request<CycleContextResponse>('/faculty/cycle-context'),
    getSubjectsForSemester: (semester: string) =>
      request<SemesterSubjectsResponse>(`/faculty/subjects?semester=${encodeURIComponent(semester)}`),
    saveDraft: (items: PreferenceItemPayload[]) =>
      request<{ success: boolean; status: string; preferences: FacultyPreference[] }>('/faculty/preferences/draft', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    submitPreferences: (items: PreferenceItemPayload[]) =>
      request<{ success: boolean; status: string; preferences: FacultyPreference[] }>('/faculty/preferences/submit', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    getSubjectDemand: (semester?: string, academicYear?: string) => {
      const q = new URLSearchParams()
      if (semester) q.set('semester', semester)
      if (academicYear) q.set('academicYear', academicYear)
      const qs = q.toString()
      return request<{ demand: SubjectDemandDTO[] }>(`/faculty/subject-demand${qs ? `?${qs}` : ''}`)
    },
    getHodPreferences: (semester?: string) => {
      const qs = semester ? `?semester=${encodeURIComponent(semester)}` : ''
      return request<{
        currentCycle: import('./academicCycle').AcademicCycle
        allowedSemesters: string[]
        semester: string | null
        year: string | null
        summary: { totalFaculty: number; submitted: number; approved: number; changesRequested: number; rejected: number; notSubmitted: number }
        preferences: any[]
        facultyRows: any[]
        demand: any[]
      }>(`/hod/preferences${qs}`)
    },
    getConfirmedAllocation: (semester?: string) => {
      const qs = semester ? `?semester=${encodeURIComponent(semester)}` : ''
      return request<{
        currentCycle: import('./academicCycle').AcademicCycle
        allowedSemesters: string[]
        semester: string | null
        year: string | null
        summary: { totalFaculty: number; confirmed: number; unallocated: number; totalAssignments: number }
        facultyRows: Array<{
          facultyId: string
          facultyName: string
          designation: string
          allocationExperience: number | null
          subjects: Array<{ subjectId: string; subjectCode: string; subjectName: string; component: string; sectionId: string; sectionName: string }>
        }>
      }>(`/hod/confirmed-allocation${qs}`)
    },
    editHodPreference: (id: number, patch: { subjectId?: string; preferenceRank?: number; requestedSections?: number; labConfirmed?: boolean }) =>
      request<{ success: boolean; preference: any }>(`/hod/preferences/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    reviewPreference: (id: number, status: string, comment?: string) =>
      request<{ success: boolean; preference: any }>(`/hod/preferences/${id}/review`, { method: 'POST', body: JSON.stringify({ status, comment }) }),
    getAllocationSettings: () => request<{ config: any }>('/hod/allocation-settings'),
    saveAllocationSettings: (config: any) =>
      request<{ success: boolean; config: any }>('/hod/allocation-settings', { method: 'POST', body: JSON.stringify({ config }) }),
    getAcademicCycle: () =>
      request<{ currentCycle: import('./academicCycle').AcademicCycle; allowedSemesters: string[] }>('/hod/academic-cycle'),
    setAcademicCycle: (cycle: import('./academicCycle').AcademicCycle, password: string) =>
      request<{ success: boolean; currentCycle: import('./academicCycle').AcademicCycle; allowedSemesters: string[] }>(
        '/hod/academic-cycle', { method: 'POST', body: JSON.stringify({ cycle, password }) }),
    updateFacultyExperience: (facultyId: string, allocationExperience: number) =>
      request<{ success: boolean }>(`/hod/faculty/${facultyId}`, { method: 'PATCH', body: JSON.stringify({ allocationExperience }) }),
    explainGenerationFailure: (report: any) =>
      request<{ success: boolean; explanation: any }>('/ai/explain-generation-failure', { method: 'POST', body: JSON.stringify({ report }) }),
    aiChat: (message: string, role: string) =>
      request<{ reply: string }>('/ai/chat', { method: 'POST', body: JSON.stringify({ message, role }) }),
    getReadiness: () =>
      request<{ readiness: Array<import('./types').SemesterReadiness> }>('/readiness'),
    // Workload Templates & Allocation (Phase 2 V1)
    getWorkloadTemplates: () => request<Array<{ id: string; name: string; theoryPeriodsPerSection: number; labPeriodsPerSection: number; description?: string }>>('/workload-templates'),
    createWorkloadTemplate: (data: { name: string; theoryPeriodsPerSection: number; labPeriodsPerSection: number; description?: string }) =>
      request<{ id: string; name: string; theoryPeriodsPerSection: number; labPeriodsPerSection: number; description?: string }>('/workload-templates', { method: 'POST', body: JSON.stringify(data) }),
    updateWorkloadTemplate: (id: string, data: { name: string; theoryPeriodsPerSection: number; labPeriodsPerSection: number; description?: string }) =>
      request<{ id: string; name: string; theoryPeriodsPerSection: number; labPeriodsPerSection: number; description?: string }>(`/workload-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteWorkloadTemplate: (id: string) =>
      request<{ success: boolean }>(`/workload-templates/${id}`, { method: 'DELETE' }),
    getWorkloadSummary: (semester: string) =>
      request<{ semester: string; activeSectionCount: number; subjectSummaries: any[]; facultySummaries: any[]; stagedAllocations?: any[] }>(`/hod/workload-summary?semester=${encodeURIComponent(semester)}`),
    allocateWorkload: (data: { semester: string; subjectId: string; templateId: string; facultyId: string; assignedSectionIds?: string[] }) =>
      request<any>('/hod/allocate-workload', { method: 'POST', body: JSON.stringify(data) }),
    approveWorkloadAllocation: (semester: string, subjectId?: string) =>
      request<{ success: boolean; approvedAllocationsCount: number; syncedTeachingAssignmentsCount: number }>('/hod/approve-workload-allocation', { method: 'POST', body: JSON.stringify({ semester, subjectId }) }),
    getAssignBoard: (semester: string) =>
      request<AssignBoard>(`/hod/assign-board?semester=${encodeURIComponent(semester)}`),
    assignSections: (data: { semester: string; subjectId: string; facultyId: string; sectionCount?: number; sectionIds?: string[]; override?: boolean }) =>
      request<{ success: boolean; assignedSectionIds: string[]; addedPeriods: number; facultyLoad: number; facultyMax: number }>('/hod/assign', { method: 'POST', body: JSON.stringify(data) }),
    changePreferenceSubject: (id: number, subjectId: string) =>
      request<{ success: boolean }>(`/hod/preferences/${id}/change`, { method: 'POST', body: JSON.stringify({ subjectId }) }),
    deletePreference: (id: number) =>
      request<{ success: boolean }>(`/hod/preferences/${id}`, { method: 'DELETE' }),
    staffing: () => request<StaffingReport>('/hod/staffing'),
    autoAssign: (data: { semester: string; subjectId?: string; dryRun?: boolean }) =>
      request<AutoAssignResult>('/hod/auto-assign', { method: 'POST', body: JSON.stringify(data) }),
    unassignSections: (data: { subjectId: string; facultyId: string; sectionIds?: string[] }) =>
      request<{ success: boolean; removed: number }>('/hod/unassign', { method: 'POST', body: JSON.stringify(data) }),
  },
}

