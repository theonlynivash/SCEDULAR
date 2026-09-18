import * as XLSX from 'xlsx'
import type { ImportDiagnostic } from './types.js'

export interface ParsedWorkbook {
  sheets: Map<string, Array<Record<string, unknown>>>
  diagnostics: ImportDiagnostic[]
}

const HEADER_ALIASES: Record<string, string[]> = {
  id: ['id', 'subjectid', 'subject_id', 'subject id', 'courseid', 'course_id', 'course id'],
  code: ['code', 'subjectcode', 'subject_code', 'subject code', 'coursecode', 'course_code', 'course code'],
  name: ['name', 'subjectname', 'subject_name', 'subject name', 'coursename', 'course_name', 'course name'],
  deliveryType: ['deliverytype', 'delivery_type', 'delivery type', 'type'],
  category: ['category', 'subjectcategory', 'subject_category', 'subject category'],
  sectionId: ['sectionid', 'section_id', 'section id'],
  sectionName: ['sectionname', 'section_name', 'section name'],
  year: ['year'],
  semester: ['semester', 'sem'],
  studentCount: ['studentcount', 'student_count', 'student count', 'strength', 'students'],
  theoryPeriods: ['theoryperiods', 'theory_periods', 'theory periods', 'weeklytheoryperiods', 'weekly_theory_periods'],
  labPeriods: ['labperiods', 'lab_periods', 'lab periods', 'weeklylabperiods', 'weekly_lab_periods'],
  labBlockLength: ['labblocklength', 'lab_block_length', 'lab block length', 'blocklength', 'block length'],
  facultyId: ['facultyid', 'faculty_id', 'faculty id'],
  facultyName: ['facultyname', 'faculty_name', 'faculty name'],
  designation: ['designation', 'role'],
  maxDailyPeriods: ['maxdailyperiods', 'max_daily_periods', 'max daily periods'],
  maxWeeklyPeriods: ['maxweeklyperiods', 'max_weekly_periods', 'max weekly periods'],
  component: ['component', 'teachingcomponent', 'teaching_component', 'teaching component'],
  batch: ['batch', 'batchid', 'batch_id', 'batch id'],
  labId: ['labid', 'lab_id', 'lab id'],
  labName: ['labname', 'lab_name', 'lab name'],
  capacity: ['capacity', 'labcapacity', 'lab_capacity', 'lab capacity'],
  day: ['day'],
  period: ['period', 'periodindex', 'period_index', 'period index'],
  key: ['key', 'setting', 'settingkey', 'setting_key'],
  value: ['value', 'settingvalue', 'setting_value', 'setting value'],
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

function canonicalHeader(value: unknown): string | null {
  const normalized = normalizeHeader(value)
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => normalizeHeader(alias) === normalized)) return canonical
  }
  return null
}

export function parseWorkbook(buffer: Uint8Array): ParsedWorkbook {
  const diagnostics: ImportDiagnostic[] = []
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  } catch (error) {
    return {
      sheets: new Map(),
      diagnostics: [{ code: 'INVALID_WORKBOOK', severity: 'ERROR', message: 'The uploaded file is not a readable Excel workbook.', details: { error: String(error) } }],
    }
  }

  const sheets = new Map<string, Array<Record<string, unknown>>>()
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][]
    if (matrix.length === 0) {
      sheets.set(sheetName.trim().toUpperCase(), [])
      continue
    }

    const headerRowIndex = matrix.findIndex(row => row.some(cell => String(cell ?? '').trim() !== ''))
    if (headerRowIndex < 0) {
      sheets.set(sheetName.trim().toUpperCase(), [])
      continue
    }

    const rawHeaders = matrix[headerRowIndex]
    const headers: Array<string | null> = rawHeaders.map(canonicalHeader)
    const seen = new Set<string>()
    headers.forEach((header, index) => {
      if (!header) return
      if (seen.has(header)) {
        diagnostics.push({ code: 'DUPLICATE_HEADER', severity: 'ERROR', sheet: sheetName, row: headerRowIndex + 1, field: header, message: `Header "${String(rawHeaders[index])}" maps to the duplicate field "${header}".` })
      }
      seen.add(header)
    })

    const rows: Array<Record<string, unknown>> = []
    for (let r = headerRowIndex + 1; r < matrix.length; r++) {
      const cells = matrix[r]
      if (!cells || cells.every(cell => String(cell ?? '').trim() === '')) continue
      const row: Record<string, unknown> = { __row: r + 1 }
      cells.forEach((value, index) => {
        const header = headers[index]
        if (header) row[header] = value
      })
      rows.push(row)
    }
    sheets.set(sheetName.trim().toUpperCase(), rows)
  }

  return { sheets, diagnostics }
}
