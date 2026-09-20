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

/**
 * Fix 1 — Map academic short-code categories to the canonical set the
 * solver understands.  Real timetable Excel files use codes like BS, PC, ES,
 * OE, PE that originate from UG curriculum nomenclature; we map them rather
 * than reject the subject.
 */
function mapCategory(raw: string): Subject['category'] {
  const u = raw.trim().toUpperCase()
  // Already canonical
  if (u === 'CORE')       return 'CORE'
  if (u === 'ELECTIVE')   return 'ELECTIVE'
  if (u === 'MANDATORY')  return 'MANDATORY'
  if (u === 'ADDITIONAL') return 'ADDITIONAL'
  if (u === 'OTHER')      return 'OTHER'

  // Academic short-codes → CORE (Basic Science / Engineering Science / Professional Core)
  if (['BS', 'ES', 'PC', 'EEC', 'HS', 'COMMON', 'PC / PRACTICAL'].includes(u)) return 'CORE'

  // Professional/Open Elective → ELECTIVE
  if (['PE', 'OE'].includes(u)) return 'ELECTIVE'

  // Everything else (LAB, PROJECT, SEMINAR, INTERNSHIP, VALUE ADDED, ACTIVITY,
  // ODD-SEMESTER CLASS TIMETABLE, etc.) → OTHER, which is schedulable
  return 'OTHER'
}

/**
 * Fix 2 — Map non-standard delivery types to the canonical set the solver
 * understands.  Returns the mapped type plus a flag if a warning should be
 * emitted so the caller can add it without needing the diagnostics array here.
 */
function mapDeliveryType(raw: string): { type: Subject['deliveryType']; warned: boolean } {
  const u = raw.trim().toUpperCase()
  // Pure theory
  if (['THEORY', 'LECTURE'].includes(u))                                                              return { type: 'THEORY',     warned: false }
  // Pure lab
  if (['LAB', 'PRACTICAL', 'LABORATORY'].includes(u))                                                 return { type: 'LAB',        warned: false }
  // Integrated (theory + practical component in same course)
  // Covers official syllabus values: 'Theory + Practical', 'Lab-integrated'
  if (['INTEGRATED', 'THEORY & PRACTICAL', 'THEORY + PRACTICAL', 'LAB-INTEGRATED', 'LABINTEGRATED'].includes(u)) return { type: 'INTEGRATED', warned: false }
  // Non-schedulable course types from the official B.Tech AI&DS Regulation 2024 syllabus:
  // Seminar, Non-credit, Project, Internship, Value Added, Course, Mandatory, Elective.
  // We accept them as THEORY slots (1+ periods still need to be timetabled or just appear
  // as placeholders) and emit a WARNING so the operator is aware of the remapping.
  return { type: 'THEORY', warned: true }
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
  const seenSectionIds = new Set<string>()
  for (const row of sheets.get('SECTIONS') ?? []) {
    const id = text(row, 'sectionId')
    const name = text(row, 'sectionName') || id
    if (!id) {
      diagnostics.push({ code: 'REQUIRED_FIELD', severity: 'ERROR', sheet: 'SECTIONS', row: rowNo(row), field: 'SectionId', message: 'SectionId is required.' })
      continue
    }
    // Fix 5 — The Excel lists each physical section twice: once per semester
    // (odd + even) using the same SectionId.  Keep only the first occurrence
    // (the actively-scheduled semester) and warn so the operator is informed.
    if (seenSectionIds.has(id)) {
      diagnostics.push({ code: 'DUPLICATE_SECTION_SKIPPED', severity: 'WARNING', sheet: 'SECTIONS', row: rowNo(row), entityId: id, message: `Section \"${id}\" appears more than once; duplicate row skipped (first occurrence kept).` })
      continue
    }
    seenSectionIds.add(id)
    const studentCount = number(row, 'studentCount')
    sections.push({ id, name, year: optionalText(row, 'year'), semester: optionalText(row, 'semester'), studentCount })
  }

  const subjects: Subject[] = []
  for (const row of sheets.get('SUBJECTS') ?? []) {
    const id = text(row, 'id')
    const code = text(row, 'code') || id
    const name = text(row, 'name')
    if (!id || !name) {
      diagnostics.push({ code: 'INVALID_SUBJECT', severity: 'ERROR', sheet: 'SUBJECTS', row: rowNo(row), message: 'Subject requires Id and Name.' })
      continue
    }
    // Fix 2 — Map any syllabus delivery-type string to THEORY | LAB | INTEGRATED.
    // Unknown values (PROJECT, ACTIVITY, SEMINAR, Non-credit, Value Added …) are
    // remapped to THEORY with a WARNING instead of being hard-rejected.
    const rawDeliveryType = text(row, 'deliveryType')
    const { type: deliveryType, warned: dtWarned } = mapDeliveryType(rawDeliveryType)
    if (dtWarned) {
      diagnostics.push({ code: 'DELIVERY_TYPE_REMAPPED', severity: 'WARNING', sheet: 'SUBJECTS', row: rowNo(row), field: 'DeliveryType', message: `DeliveryType "${rawDeliveryType}" is not a recognised scheduling type; treated as THEORY.` })
    }
    // Fix 1 — Map academic short-code categories (BS, PC, ES, OE, PE …) to the
    // canonical set.  Unknown values fall through to OTHER rather than rejecting.
    const rawCategory = text(row, 'category') || 'OTHER'
    const category = mapCategory(rawCategory)
    subjects.push({ id, code, name, deliveryType, category })
  }

  const faculty: Faculty[] = []
  for (const row of sheets.get('FACULTY') ?? []) {
    const id = text(row, 'facultyId')
    const name = text(row, 'facultyName')
    if (!id || !name) {
      diagnostics.push({ code: 'INVALID_FACULTY', severity: 'ERROR', sheet: 'FACULTY', row: rowNo(row), message: 'Faculty requires FacultyId and FacultyName.' })
      continue
    }
    const daily = number(row, 'maxDailyPeriods') ?? 6
    // Fix 4 — MaxWeeklyPeriods is often left blank for part-time / newly added
    // faculty.  Default to 24 and emit a WARNING instead of dropping the row.
    const rawWeekly = number(row, 'maxWeeklyPeriods')
    const weekly = rawWeekly ?? 24
    if (rawWeekly === null) {
      diagnostics.push({ code: 'FACULTY_WEEKLY_DEFAULT', severity: 'WARNING', sheet: 'FACULTY', row: rowNo(row), field: 'MaxWeeklyPeriods', message: `Faculty "${name}" has no MaxWeeklyPeriods; defaulting to ${weekly}.` })
    }
    if (daily <= 0 || weekly <= 0 || !Number.isInteger(daily) || !Number.isInteger(weekly)) {
      diagnostics.push({ code: 'INVALID_FACULTY', severity: 'ERROR', sheet: 'FACULTY', row: rowNo(row), message: 'Faculty requires positive integer workload limits.' })
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
    // Fix 3 — Excel exports store an empty formula result as the number 0, not
    // null.  Treat LabBlockLength of 0 as "not specified" (same as a blank cell).
    const rawLabBlockLength = number(row, 'labBlockLength')
    const labBlockLength = rawLabBlockLength === 0 ? null : rawLabBlockLength
    if (!rawSectionId || !subjectId || theoryPeriods < 0 || labPeriods < 0 || !Number.isInteger(theoryPeriods) || !Number.isInteger(labPeriods) || theoryPeriods + labPeriods === 0) {
      diagnostics.push({ code: 'INVALID_SECTION_SUBJECT', severity: 'ERROR', sheet: 'SECTION_SUBJECTS', row: rowNo(row), message: 'SectionId, SubjectId and at least one positive weekly theory/lab period count are required.' })
      continue
    }
    if (labPeriods > 0 && (labBlockLength === null || !Number.isInteger(labBlockLength) || labBlockLength <= 0)) {
      diagnostics.push({ code: 'INVALID_LAB_BLOCK', severity: 'ERROR', sheet: 'SECTION_SUBJECTS', row: rowNo(row), field: 'LabBlockLength', message: 'LabBlockLength is required and must be a positive integer when LabPeriods > 0.' })
      continue
    }
    // labPeriods===0 && labBlockLength!==null: silently skip (already normalised to null above via the 0→null fix)

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
