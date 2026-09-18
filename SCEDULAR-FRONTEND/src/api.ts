// Thin client for the SCEDULAR backend (SCEDULAR-BACKEND, a separate
// Node/Express/PostgreSQL service). All scheduling logic lives server-side;
// this file only shapes fetch calls and mirrors the backend's types.

export const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8090/api'

async function request<T>(path: string, options: RequestInit = {}, acceptedStatuses: number[] = []): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok && !acceptedStatuses.includes(res.status)) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      message = typeof body.error === 'string' ? body.error : JSON.stringify(body.error ?? body)
    } catch {
      // ignore, use default message
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------- Types (mirrors SCEDULAR-BACKEND/src/types.ts) ----------

export type ComponentType = 'INTEGRATED_THEORY' | 'INTEGRATED_LAB' | 'LAB_ONLY' | 'THEORY_ONLY' | 'MANDATORY' | 'ADDITIONAL'

export interface FacultyUnavailability {
  day: string
  period: number
}

export interface Faculty {
  id: string
  name: string
  designation: string | null
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

export type SubjectDeliveryType = 'THEORY' | 'LAB' | 'INTEGRATED'
export type SubjectCategory = 'CORE' | 'ELECTIVE' | 'MANDATORY' | 'ADDITIONAL' | 'OTHER'
export type TeachingComponent = 'THEORY' | 'LAB'
export interface Subject { id: string; code: string; name: string; deliveryType: SubjectDeliveryType; category: SubjectCategory }
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

export const api = {
  faculty: {
    list: () => request<Faculty[]>('/faculty'),
    get: (id: string) => request<Faculty>(`/faculty/${id}`),
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
    reset: () => request<{ ok: true; message: string }>('/import/master/reset', { method: 'POST' }),
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
    generate: () => request<GenerationResult>('/timetable/generate', { method: 'POST' }),
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
}
