// Thin client for the SCEDULAR backend (SCEDULAR-BACKEND, a separate
// Node/Express/SQLite service). All scheduling logic lives server-side;
// this file only shapes fetch calls and mirrors the backend's types.

export const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8090/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok) {
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
  courseIds: string[]
}

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
    create: (l: { id: string; name: string }) => request<Lab>('/labs', { method: 'POST', body: JSON.stringify(l) }),
    remove: (id: string) => request<void>(`/labs/${id}`, { method: 'DELETE' }),
    mapCourse: (labId: string, courseId: string) =>
      request('/labs/mapping', { method: 'POST', body: JSON.stringify({ labId, courseId }) }),
    unmapCourse: (labId: string, courseId: string) =>
      request<void>(`/labs/mapping?labId=${encodeURIComponent(labId)}&courseId=${encodeURIComponent(courseId)}`, { method: 'DELETE' }),
  },
  config: {
    get: () => request<ScheduleConfig>('/config'),
    update: (cfg: ScheduleConfig) => request<ScheduleConfig>('/config', { method: 'PUT', body: JSON.stringify(cfg) }),
  },
  workload: {
    listRequirements: () => request<CourseRequirement[]>('/workload/requirements'),
    createRequirement: (r: CourseRequirement) =>
      request('/workload/requirements', { method: 'POST', body: JSON.stringify(r) }),
    listTeacherAssignments: () => request<TeacherAssignment[]>('/workload/teacher-assignments'),
    createTeacherAssignment: (a: TeacherAssignment) =>
      request('/workload/teacher-assignments', { method: 'POST', body: JSON.stringify(a) }),
  },
  importFacultyWorkload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ totalRows: number; imported: number; rejected: number; rejectedRows: { row: number; issues: unknown }[] }>(
      '/import/faculty-workload',
      { method: 'POST', body: form }
    )
  },
  timetable: {
    generate: () => request<GenerationResult>('/timetable/generate', { method: 'POST' }),
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
