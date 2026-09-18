import type { FacultyUnavailability, ScheduleConfig, Subject, Section, SectionSubject, TeachingAssignment, Lab } from '../types.js'

export interface CanonicalImportDataset {
  sections: Section[]
  subjects: Subject[]
  sectionSubjects: Omit<SectionSubject, 'id'>[]
  faculty: import('../types.js').Faculty[]
  teachingAssignments: Array<{
    facultyId: string
    sectionId: string
    subjectId: string
    component: 'THEORY' | 'LAB'
    batch: string | null
  }>
  labs: Lab[]
  labMappings: Array<{ labId: string; subjectId: string; sectionId: string | null }>
  facultyUnavailability: FacultyUnavailability[]
  scheduleConfig?: ScheduleConfig
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

export interface ImportPreview {
  valid: boolean
  summary: Record<string, number>
  errors: ImportDiagnostic[]
  warnings: ImportDiagnostic[]
  dataset?: CanonicalImportDataset
}
