import type { Faculty, Lab, Section, Subject } from '../types.js'
import type { CanonicalImportDataset, ImportDiagnostic } from './types.js'

const REQUIRED = ['SECTIONS', 'SUBJECTS', 'SECTION_SUBJECTS', 'FACULTY', 'TEACHING_ASSIGNMENTS', 'LABS', 'LAB_MAPPING']

function text(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? '').trim()
}
function number(row: Record<string, unknown>, key: string): number | null {
  const raw = row[key]
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
function optionalText(row: Record<string, unknown>, key: string): string | null {
  const v = text(row, key)
  return v || null
}
function rowNo(row: Record<string, unknown>): number | undefined {
  return typeof row.__row === 'number' ? row.__row : undefined
}
function matchYearOrSem(val1: string | null | undefined, query: string): boolean {
  if (!val1) return false
  const s1 = val1.trim().toUpperCase()
  const s2 = query.trim().toUpperCase()
  if (s1 === s2) return true

  const numMap: Record<string, string[]> = {
    '1': ['1', 'I'],
    '2': ['2', 'II'],
    '3': ['3', 'III'],
    '4': ['4', 'IV'],
    '5': ['5', 'V'],
    '6': ['6', 'VI'],
    '7': ['7', 'VII'],
    '8': ['8', 'VIII'],
    'I': ['1', 'I'],
    'II': ['2', 'II'],
    'III': ['3', 'III'],
    'IV': ['4', 'IV'],
    'V': ['5', 'V'],
    'VI': ['6', 'VI'],
    'VII': ['7', 'VII'],
    'VIII': ['8', 'VIII'],
  }

  const equivalents = numMap[s2]
  if (equivalents && equivalents.includes(s1)) return true
  return false
}

function resolveTargetSectionIds(rawSectionId: string, sections: Section[]): string[] {
  const tokens = rawSectionId.split(',').map(s => s.trim()).filter(Boolean)
  const result = new Set<string>()

  for (const token of tokens) {
    const upper = token.toUpperCase()
    if (upper === 'ALL' || upper === 'ALL_SECTIONS' || token === '*') {
      sections.forEach(s => result.add(s.id))
    } else if (upper.startsWith('SEM:') || upper.startsWith('SEM-') || upper.startsWith('SEMESTER:') || upper.startsWith('SEMESTER-')) {
      const targetSem = token.split(/[:\-]/)[1]?.trim() ?? token.replace(/^(SEM|SEMESTER)[:\-]?/i, '').trim()
      sections.filter(s => matchYearOrSem(s.semester, targetSem)).forEach(s => result.add(s.id))
    } else if (upper.startsWith('YEAR:') || upper.startsWith('YEAR-') || upper.startsWith('YR:') || upper.startsWith('YR-')) {
      const targetYear = token.split(/[:\-]/)[1]?.trim() ?? token.replace(/^(YEAR|YR)[:\-]?/i, '').trim()
      sections.filter(s => matchYearOrSem(s.year, targetYear)).forEach(s => result.add(s.id))
    } else {
      result.add(token)
    }
  }

  return Array.from(result)
}

export function normalizeWorkbook(sheets: Map<string, Array<Record<string, unknown>>>, baseDiagnostics: ImportDiagnostic[] = []): { dataset: CanonicalImportDataset; diagnostics: ImportDiagnostic[] } {
  const diagnostics = [...baseDiagnostics]
  for (const required of REQUIRED) {
    if (!sheets.has(required)) diagnostics.push({ code: 'MISSING_SHEET', severity: 'ERROR', sheet: required, message: `Required sheet "${required}" is missing.` })
  }

  const sections: Section[] = []
  for (const row of sheets.get('SECTIONS') ?? []) {
    const id = text(row, 'sectionId')
    const name = text(row, 'sectionName') || id
    if (!id) {
      diagnostics.push({ code: 'REQUIRED_FIELD', severity: 'ERROR', sheet: 'SECTIONS', row: rowNo(row), field: 'SectionId', message: 'SectionId is required.' })
      continue
    }
    const studentCount = number(row, 'studentCount')
    sections.push({ id, name, year: optionalText(row, 'year'), semester: optionalText(row, 'semester'), studentCount })
  }

  const subjects: Subject[] = []
  for (const row of sheets.get('SUBJECTS') ?? []) {
    const id = text(row, 'id')
    const code = text(row, 'code') || id
    const name = text(row, 'name')
    const deliveryType = text(row, 'deliveryType').toUpperCase() as Subject['deliveryType']
    const category = (text(row, 'category').toUpperCase() || 'OTHER') as Subject['category']
    if (!id || !name || !['THEORY', 'LAB', 'INTEGRATED'].includes(deliveryType)) {
      diagnostics.push({ code: 'INVALID_SUBJECT', severity: 'ERROR', sheet: 'SUBJECTS', row: rowNo(row), message: 'Subject requires Id, Name and DeliveryType of THEORY, LAB or INTEGRATED.' })
      continue
    }
    if (!['CORE', 'ELECTIVE', 'MANDATORY', 'ADDITIONAL', 'OTHER'].includes(category)) {
      diagnostics.push({ code: 'INVALID_CATEGORY', severity: 'ERROR', sheet: 'SUBJECTS', row: rowNo(row), field: 'Category', message: `Unsupported subject category "${category}".` })
      continue
    }
    subjects.push({ id, code, name, deliveryType, category })
  }

  const faculty: Faculty[] = []
  for (const row of sheets.get('FACULTY') ?? []) {
    const id = text(row, 'facultyId')
    const name = text(row, 'facultyName')
    const daily = number(row, 'maxDailyPeriods') ?? 6
    const weekly = number(row, 'maxWeeklyPeriods') ?? 24
    if (!id || !name || daily <= 0 || weekly <= 0 || !Number.isInteger(daily) || !Number.isInteger(weekly)) {
      diagnostics.push({ code: 'INVALID_FACULTY', severity: 'ERROR', sheet: 'FACULTY', row: rowNo(row), message: 'Faculty requires FacultyId, FacultyName and positive integer workload limits.' })
      continue
    }
    faculty.push({ id, name, designation: optionalText(row, 'designation'), maxDailyPeriods: daily, maxWeeklyPeriods: weekly })
  }

  const labs: Lab[] = []
  for (const row of sheets.get('LABS') ?? []) {
    const id = text(row, 'labId') || text(row, 'id')
    const name = text(row, 'labName') || text(row, 'name') || id
    const capacity = number(row, 'capacity')
    if (!id || !name || (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0))) {
      diagnostics.push({ code: 'INVALID_LAB', severity: 'ERROR', sheet: 'LABS', row: rowNo(row), message: 'Lab requires LabId and LabName; Capacity, when provided, must be a positive integer.' })
      continue
    }
    labs.push({ id, name, capacity })
  }

  const sectionSubjects: Array<{ sectionId: string; subjectId: string; theoryPeriods: number; labPeriods: number; labBlockLength: number | null }> = []
  for (const row of sheets.get('SECTION_SUBJECTS') ?? []) {
    const rawSectionId = text(row, 'sectionId')
    const subjectId = text(row, 'id')
    const theoryPeriods = number(row, 'theoryPeriods') ?? 0
    const labPeriods = number(row, 'labPeriods') ?? 0
    const labBlockLength = number(row, 'labBlockLength')
    if (!rawSectionId || !subjectId || theoryPeriods < 0 || labPeriods < 0 || !Number.isInteger(theoryPeriods) || !Number.isInteger(labPeriods) || theoryPeriods + labPeriods === 0) {
      diagnostics.push({ code: 'INVALID_SECTION_SUBJECT', severity: 'ERROR', sheet: 'SECTION_SUBJECTS', row: rowNo(row), message: 'SectionId, SubjectId and at least one positive weekly theory/lab period count are required.' })
      continue
    }
    if (labPeriods > 0 && (labBlockLength === null || !Number.isInteger(labBlockLength) || labBlockLength <= 0)) {
      diagnostics.push({ code: 'INVALID_LAB_BLOCK', severity: 'ERROR', sheet: 'SECTION_SUBJECTS', row: rowNo(row), field: 'LabBlockLength', message: 'LabBlockLength is required and must be a positive integer when LabPeriods > 0.' })
      continue
    }
    if (labPeriods === 0 && labBlockLength !== null) diagnostics.push({ code: 'UNEXPECTED_LAB_BLOCK', severity: 'ERROR', sheet: 'SECTION_SUBJECTS', row: rowNo(row), field: 'LabBlockLength', message: 'LabBlockLength must be empty when LabPeriods is 0.' })

    const targetSectionIds = resolveTargetSectionIds(rawSectionId, sections)
    for (const secId of targetSectionIds) {
      sectionSubjects.push({ sectionId: secId, subjectId, theoryPeriods, labPeriods, labBlockLength })
    }
  }

  const teachingAssignments: CanonicalImportDataset['teachingAssignments'] = []
  for (const row of sheets.get('TEACHING_ASSIGNMENTS') ?? []) {
    const facultyId = text(row, 'facultyId')
    const rawSectionId = text(row, 'sectionId')
    const subjectId = text(row, 'id')
    const component = text(row, 'component').toUpperCase() as 'THEORY' | 'LAB'
    const batch = optionalText(row, 'batch')
    if (!facultyId || !rawSectionId || !subjectId || !['THEORY', 'LAB'].includes(component)) {
      diagnostics.push({ code: 'INVALID_TEACHING_ASSIGNMENT', severity: 'ERROR', sheet: 'TEACHING_ASSIGNMENTS', row: rowNo(row), message: 'FacultyId, SectionId, SubjectId and Component (THEORY/LAB) are required.' })
      continue
    }
    const targetSectionIds = resolveTargetSectionIds(rawSectionId, sections)
    for (const secId of targetSectionIds) {
      teachingAssignments.push({ facultyId, sectionId: secId, subjectId, component, batch })
    }
  }

  const labMappings: Array<{ labId: string; subjectId: string; sectionId: string | null }> = []
  for (const row of sheets.get('LAB_MAPPING') ?? []) {
    const labId = text(row, 'labId')
    const subjectId = text(row, 'id')
    const sectionId = optionalText(row, 'sectionId')
    if (!labId || !subjectId) {
      diagnostics.push({ code: 'INVALID_LAB_MAPPING', severity: 'ERROR', sheet: 'LAB_MAPPING', row: rowNo(row), message: 'LabId and SubjectId are required. SectionId is optional; when supplied, the mapping applies only to that section.' })
      continue
    }
    labMappings.push({ labId, subjectId, sectionId })
  }

  const facultyUnavailability = (sheets.get('FACULTY_UNAVAILABILITY') ?? []).flatMap(row => {
    const facultyId = text(row, 'facultyId')
    const day = text(row, 'day')
    const period = number(row, 'period')
    if (!facultyId || !day || period === null || !Number.isInteger(period) || period <= 0) {
      diagnostics.push({ code: 'INVALID_UNAVAILABILITY', severity: 'ERROR', sheet: 'FACULTY_UNAVAILABILITY', row: rowNo(row), message: 'FacultyId, Day and positive integer Period are required.' })
      return []
    }
    return [{ facultyId, day, period }]
  })

  return { dataset: { sections, subjects, sectionSubjects, faculty, teachingAssignments, labs, labMappings, facultyUnavailability }, diagnostics }
}
