/**
 * Bulk import of teachers and of the syllabus from an Excel sheet.
 *
 * Approach: STAGE -> FIX -> COMMIT. The uploaded sheet is never written straight to the database.
 *   1. parse   the file into plain text cells (one "row" object per sheet row, tolerant of header spelling);
 *   2. validate every row against the live data and the rules the rest of SCEDULAR needs, producing for each cell an
 *              exact issue ("Experience (years) is missing"), at level `error` (blocks the import) or `warning`;
 *   3. the HOD edits the staged rows in the browser; each edit is re-validated here (`validate*` is pure on its input);
 *   4. commit  only when no row has an error (or with `skipInvalid`), creating/updating through the same helpers the
 *              Settings screens use, so imported data is indistinguishable from data typed in by hand.
 * The rules are chosen so that an error-free import is ready for preference submission (teachers need experience),
 * HOD approval, and timetable generation (labs need a room, subjects need periods, offerings need sections).
 */
import * as XLSX from 'xlsx'
import {
  listFaculty, upsertFaculty, deleteFacultyCascade, eraseGeneratedTimetables, listSections, listSubjects, upsertSubject, listLabs, listLabSubjectMappings,
  listSectionSubjects, upsertSection, getCurrentAcademicCycle,
} from '../db/repo.js'
import { generatePassword, setFacultyPassword } from '../auth/passwords.js'
import { saveLocalDb } from '../db/localDb.js'
import { SEMESTER_TO_YEAR, semesterInCycle } from '../utils/academicCycle.js'
import { CATEGORIES, ROMAN as ROMAN_LIST, SEM_NUM, checkPeriods, nextFacultyId, sectionId, syncLabRooms, syncOfferings, writeSubjectCourses } from '../routes/setup.js'
import type { Subject } from '../types.js'

export type ImportKind = 'sections' | 'teachers' | 'syllabus'
export interface ImportIssue { field: string; level: 'error' | 'warning'; message: string }
export interface StagedRow { row: number; values: Record<string, string> }
export interface CheckedRow extends StagedRow { issues: ImportIssue[]; action: 'create' | 'update'; note?: string }

export interface ColumnDef { key: string; label: string; required?: boolean; hint: string; options?: string[]; width?: number }

const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII' }
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/[\s_\-./()]+/g, '')
const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const num = (s: string): number | null => (s !== '' && /^-?\d+(\.0+)?$/.test(s) ? Math.round(Number(s)) : null)

/* ───────────────────────────── column definitions ───────────────────────────── */

export const TEACHER_COLUMNS: ColumnDef[] = [
  { key: 'facultyId', label: 'Faculty ID', hint: 'Leave blank for a new teacher. Fill an existing ID (FAC-012) to update that teacher.', width: 12 },
  { key: 'name', label: 'Name', required: true, hint: 'Full name as printed on timetables, e.g. Dr.A.Kumar', width: 28 },
  { key: 'designation', label: 'Designation', hint: 'Professor, Associate Professor, Assistant Professor …', width: 24 },
  { key: 'email', label: 'Email', hint: 'Needed for Forgot password and mails from the HOD. Must be unique.', width: 30 },
  { key: 'phone', label: 'Phone', hint: 'Optional', width: 14 },
  { key: 'experience', label: 'Experience (years)', required: true, hint: 'Whole years. Decides how many subjects and which years the teacher may choose.', width: 18 },
]

export const SYLLABUS_COLUMNS: ColumnDef[] = [
  { key: 'semester', label: 'Semester', required: true, hint: 'I to VIII (or 1 to 8)', options: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'], width: 10 },
  { key: 'code', label: 'Subject Code', required: true, hint: 'Unique, e.g. 23AD1701', width: 14 },
  { key: 'name', label: 'Subject Name', required: true, hint: 'Full title', width: 38 },
  { key: 'shortName', label: 'Short Name', hint: 'Acronym printed on the timetable grid, e.g. ARVR', width: 12 },
  { key: 'type', label: 'Type', required: true, hint: 'THEORY, INTEGRATED (theory + lab) or LAB', options: ['THEORY', 'INTEGRATED', 'LAB'], width: 13 },
  { key: 'theory', label: 'Theory periods/week', required: true, hint: 'Per section. 0 for a lab-only subject.', width: 16 },
  { key: 'lab', label: 'Lab periods/week', required: true, hint: 'Per section. 0 for a theory-only subject.', width: 15 },
  { key: 'credits', label: 'Credits', hint: 'Printed in the C column', width: 9 },
  { key: 'category', label: 'Category', hint: 'CORE, BASIC_SCIENCE, PROFESSIONAL_ELECTIVE … (blank = CORE)', options: [...CATEGORIES], width: 22 },
  { key: 'labs', label: 'Lab rooms', hint: 'Names of lab rooms that can host the lab, comma separated. Required when there are lab periods.', width: 30 },
  { key: 'sections', label: 'Sections', hint: 'Letters, e.g. A, B, C. Blank = every section of the semester.', width: 14 },
]

export const SECTION_COLUMNS: ColumnDef[] = [
  { key: 'semester', label: 'Semester', required: true, hint: 'I to VIII (or 1 to 8)', options: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'], width: 10 },
  { key: 'section', label: 'Section', required: true, hint: 'One letter per row: A, B, C …', width: 10 },
  { key: 'students', label: 'Students', hint: 'Class strength (optional)', width: 10 },
  { key: 'incharge', label: 'Class In-charge', hint: 'Faculty ID or exact name (optional). Set it later in Settings if the teacher is not imported yet.', width: 28 },
]

export const columnsOf = (k: ImportKind) => (k === 'teachers' ? TEACHER_COLUMNS : k === 'syllabus' ? SYLLABUS_COLUMNS : SECTION_COLUMNS)

/* ───────────────────────────── template ───────────────────────────── */

const SHEET_NAME: Record<ImportKind, string> = { sections: 'Sections', teachers: 'Teachers', syllabus: 'Syllabus' }
const STEP_TEXT: Record<ImportKind, string> = {
  sections: 'Sections: one row per class section (semester + letter). Import these FIRST so subjects can be offered to them.',
  syllabus: 'Syllabus: one row per subject with its weekly periods per section. Lab and integrated subjects need a lab room from the "Lists" sheet.',
  teachers: 'Teachers: one row per teacher. Experience (years) is required: it decides which subjects a teacher may choose.',
}
const EXAMPLES: Record<ImportKind, string[][]> = {
  sections: [['I', 'Example: A', '60', ''], ['I', 'Example: B', '58', '']],
  teachers: [['', 'Example: Dr.A.Kumar', 'Professor', 'a.kumar@college.edu', '9876543210', '15'], ['', 'Example: Mrs.B.Devi', 'Assistant Professor', 'b.devi@college.edu', '', '6']],
  syllabus: [['I', 'Example: 23MA1101', 'Matrices and Calculus', 'MAC', 'THEORY', '4', '0', '4', 'BASIC_SCIENCE', '', ''], ['I', 'Example: 23CS1102', 'Programming in C', 'PIC', 'INTEGRATED', '2', '2', '3', 'ENGINEERING_SCIENCE', 'AI Lab 1', 'A, B']],
}

/** One kind of sheet, or `all` = a single workbook with Sections + Syllabus + Teachers (import them in that order). */
export async function buildTemplate(kind: ImportKind | 'all'): Promise<Buffer> {
  const kinds: ImportKind[] = kind === 'all' ? ['sections', 'syllabus', 'teachers'] : [kind]
  const wb = XLSX.utils.book_new()

  const readme: string[][] = [
    [kind === 'all' ? 'SCEDULAR – all-in-one import template (Sections, Syllabus, Teachers)' : `SCEDULAR – ${SHEET_NAME[kind]} import template`],
    [''],
    ['How it works'],
    ['1. Fill the sheet(s). Columns marked * are required. Delete the "Example:" rows (they are ignored anyway).'],
    ['2. In SCEDULAR open Settings → Import, and upload this file once per step, in this order: Sections → Syllabus → Teachers.'],
    ['3. Every missing or wrong value is listed exactly and can be fixed on screen before anything is saved.'],
    ['4. After the three imports the app shows what (if anything) is still missing before teachers can submit preferences and the timetable can be generated.'],
    [''],
    ...kinds.flatMap(k => [[STEP_TEXT[k]], ['Column', 'Required', 'What to enter'], ...columnsOf(k).map(c => [c.label, c.required ? 'Yes' : 'No', c.hint]), ['']]),
  ]
  const rs = XLSX.utils.aoa_to_sheet(readme)
  rs['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, rs, 'README')

  for (const k of kinds) {
    const cols = columnsOf(k)
    const ws = XLSX.utils.aoa_to_sheet([cols.map(c => (c.required ? `${c.label} *` : c.label)), ...EXAMPLES[k]])
    ws['!cols'] = cols.map(c => ({ wch: c.width ?? 16 }))
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME[k])
  }

  if (kinds.includes('syllabus')) {
    const [labs, sections] = await Promise.all([listLabs(), listSections()])
    const rows: string[][] = [['Semesters', 'Types', 'Categories', 'Lab rooms', 'Sections that exist']]
    const n = Math.max(8, CATEGORIES.length, labs.length, sections.length)
    const secs = sections.filter(s => s.active !== false).map(s => s.id)
    for (let i = 0; i < n; i++) rows.push([ROMAN[i + 1] ?? '', ['THEORY', 'INTEGRATED', 'LAB'][i] ?? '', CATEGORIES[i] ?? '', labs[i]?.name ?? '', secs[i] ?? ''])
    const ls = XLSX.utils.aoa_to_sheet(rows)
    ls['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 32 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ls, 'Lists')
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/* ───────────────────────────── parsing ───────────────────────────── */

const ALIASES: Record<ImportKind, Record<string, string[]>> = {
  sections: {
    semester: ['semester', 'sem'],
    section: ['section', 'sec', 'sectionletter', 'class'],
    students: ['students', 'studentcount', 'strength', 'classstrength'],
    incharge: ['classincharge', 'incharge', 'classadvisor', 'advisor'],
  },
  teachers: {
    facultyId: ['facultyid', 'id', 'empid', 'employeeid'],
    name: ['name', 'facultyname', 'teachername', 'fullname'],
    designation: ['designation', 'role', 'post', 'position'],
    email: ['email', 'emailid', 'mail', 'gmail', 'emailaddress'],
    phone: ['phone', 'mobile', 'phonenumber', 'mobilenumber', 'contact'],
    experience: ['experienceyears', 'experience', 'yearsofexperience', 'exp', 'allocationexperience'],
  },
  syllabus: {
    semester: ['semester', 'sem'],
    code: ['subjectcode', 'code', 'coursecode'],
    name: ['subjectname', 'name', 'coursetitle', 'coursename', 'title', 'subject'],
    shortName: ['shortname', 'acronym', 'short', 'abbreviation'],
    type: ['type', 'deliverytype', 'subjecttype'],
    theory: ['theoryperiodsweek', 'theoryperiods', 'theory', 'weeklytheory', 'theoryhours'],
    lab: ['labperiodsweek', 'labperiods', 'lab', 'weeklylab', 'labhours', 'practical'],
    credits: ['credits', 'credit', 'c'],
    category: ['category', 'subjectcategory'],
    labs: ['labrooms', 'labroom', 'labs', 'laboratory', 'laboratories', 'rooms'],
    sections: ['sections', 'section', 'offeredto'],
  },
}

export interface ParseResult { rows: StagedRow[]; sheet: string; unknownHeaders: string[]; missingHeaders: string[] }

export function parseSheet(kind: ImportKind, buffer: Uint8Array): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const wanted = kind === 'teachers' ? ['teachers', 'faculty'] : kind === 'sections' ? ['sections', 'section', 'classes'] : ['syllabus', 'subjects', 'curriculum']
  const sheetName = wb.SheetNames.find(n => wanted.includes(norm(n))) ?? wb.SheetNames.find(n => norm(n) !== 'readme' && norm(n) !== 'lists') ?? wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error('The workbook has no sheets.')
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
  const headerIdx = grid.findIndex(r => r.some(c => cell(c) !== ''))
  if (headerIdx < 0) throw new Error('The sheet is empty.')
  const aliases = ALIASES[kind]
  const colOf: Record<number, string> = {}
  const unknown: string[] = []
  grid[headerIdx].forEach((h, i) => {
    const key = Object.entries(aliases).find(([, a]) => a.includes(norm(String(h).replace(/\*/g, ''))))?.[0]
    if (key) colOf[i] = key; else if (cell(h)) unknown.push(cell(h))
  })
  const found = new Set(Object.values(colOf))
  const missingHeaders = columnsOf(kind).filter(c => c.required && !found.has(c.key)).map(c => c.label)
  const rows: StagedRow[] = []
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const line = grid[r]
    const values: Record<string, string> = Object.fromEntries(columnsOf(kind).map(c => [c.key, '']))
    Object.entries(colOf).forEach(([i, key]) => { values[key] = cell(line[Number(i)]) })
    if (Object.values(values).every(v => v === '')) continue
    if (Object.values(values).some(v => /^example\s*:/i.test(v))) continue     // the template's sample rows
    rows.push({ row: r + 1, values })
  }
  return { rows, sheet: sheetName, unknownHeaders: unknown, missingHeaders }
}

/* ───────────────────────────── validation ───────────────────────────── */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ImportOptions { /** teachers only: throw away every current teacher (except the HOD) and load exactly this list */ replaceAll?: boolean }

export async function validateTeachers(staged: StagedRow[], opts: ImportOptions = {}): Promise<CheckedRow[]> {
  // when replacing, today's teachers are about to disappear, so only the HOD can clash with the file
  const existing = (await listFaculty()).filter(f => !opts.replaceAll || f.role === 'HOD')
  const byId = new Map(existing.map(f => [f.id.toLowerCase(), f]))
  const byEmail = new Map(existing.filter(f => f.email).map(f => [String(f.email).toLowerCase(), f]))
  const seenEmail = new Map<string, number>()
  const seenId = new Map<string, number>()

  return staged.map(r => {
    const v = { ...r.values }
    const issues: ImportIssue[] = []
    const add = (field: string, level: 'error' | 'warning', message: string) => issues.push({ field, level, message })
    let action: 'create' | 'update' = 'create'
    let note: string | undefined

    const id = cell(v.facultyId)
    let target = undefined as (typeof existing)[number] | undefined
    if (id && opts.replaceAll) add('facultyId', 'warning', 'IDs are generated when replacing all teachers; this value is ignored.')
    else if (id) {
      target = byId.get(id.toLowerCase())
      if (!target) add('facultyId', 'error', `No teacher has the ID ${id}. Leave the ID blank to add a new teacher.`)
      else if (target.role === 'HOD') add('facultyId', 'error', 'The HOD account cannot be changed from an import.')
      else { action = 'update'; note = `Updates ${target.name}` }
      if (seenId.has(id.toLowerCase())) add('facultyId', 'error', `The same ID appears on row ${seenId.get(id.toLowerCase())}.`)
      else seenId.set(id.toLowerCase(), r.row)
    }

    if (!cell(v.name)) add('name', 'error', 'Name is missing.')
    else if (cell(v.name).length < 2 || cell(v.name).length > 80) add('name', 'error', 'Name must be 2 to 80 characters.')
    else if (action === 'create') {
      const same = existing.find(f => f.name.trim().toLowerCase() === cell(v.name).toLowerCase())
      if (same) add('name', 'warning', `A teacher named "${same.name}" already exists (${same.id}). Importing adds another teacher; put ${same.id} in Faculty ID to update instead.`)
    }

    const exp = num(cell(v.experience))
    if (cell(v.experience) === '') add('experience', 'error', 'Experience (years) is missing. A teacher cannot submit subject preferences without it.')
    else if (exp === null || exp < 0 || exp > 60) add('experience', 'error', 'Experience must be a whole number of years between 0 and 60.')

    const email = cell(v.email).toLowerCase()
    if (!email) add('email', 'warning', 'No email. This teacher will not be able to use "Forgot password" or receive mails.')
    else if (!EMAIL.test(email)) add('email', 'error', `"${cell(v.email)}" is not a valid email address.`)
    else {
      const other = byEmail.get(email)
      if (other && (!target || other.id !== target.id)) add('email', 'error', `This email already belongs to ${other.name} (${other.id}).`)
      if (seenEmail.has(email)) add('email', 'error', `The same email is on row ${seenEmail.get(email)}.`)
      else seenEmail.set(email, r.row)
    }

    if (!cell(v.designation) && action === 'create') add('designation', 'warning', 'Designation is missing; "Assistant Professor" will be used.')
    return { ...r, values: v, issues, action, note }
  })
}

const normSemester = (s: string): string | null => {
  const t = s.trim().toUpperCase().replace(/^SEM(ESTER)?\.?\s*/, '')
  const n = num(t)
  if (n !== null) return ROMAN[n] ?? (n === 1 ? 'I' : null)
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'].includes(t) ? t : null
}
const normType = (s: string): 'THEORY' | 'INTEGRATED' | 'LAB' | null => {
  const t = norm(s)
  if (['theory', 'theoryonly', 't'].includes(t)) return 'THEORY'
  if (['integrated', 'theorylab', 'theorypluslab', 'tl', 'integratedlab'].includes(t)) return 'INTEGRATED'
  if (['lab', 'laboratory', 'practical', 'labonly', 'p'].includes(t)) return 'LAB'
  return null
}
const normCategory = (s: string): string | null => {
  if (!s) return null
  const t = s.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return (CATEGORIES as readonly string[]).includes(t) ? t : null
}

export interface ResolvedSubjectRow { semester: string; code: string; name: string; shortName: string | null; deliveryType: 'THEORY' | 'INTEGRATED' | 'LAB'; theory: number; lab: number; credits: number; category: string | null; labIds: string[]; sectionIds: string[] | null }

export async function validateSyllabus(staged: StagedRow[]): Promise<CheckedRow[]> {
  const [subjects, labs, sections, offerings] = await Promise.all([listSubjects(), listLabs(), listSections(), listSectionSubjects()])
  void offerings
  const byCode = new Map(subjects.map(s => [s.code.toLowerCase(), s]))
  const labByName = new Map<string, string>()
  for (const l of labs) { labByName.set(norm(l.name), l.id); labByName.set(norm(l.id), l.id) }
  const seen = new Map<string, number>()
  const baseName = (n: string) => n.toLowerCase().replace(/\b(laboratory|lab|practical|practicals)\b/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  // theory subjects (already saved, or elsewhere in this file) a lab-only row might really belong to
  const theoryNames = new Map<string, string>()
  for (const x of subjects) if (x.deliveryType === 'THEORY' && x.semester) theoryNames.set(`${x.semester}|${baseName(x.name)}`, x.name)
  for (const r of staged) { const sm = normSemester(cell(r.values.semester)); if (sm && normType(cell(r.values.type)) === 'THEORY') theoryNames.set(`${sm}|${baseName(cell(r.values.name))}`, cell(r.values.name)) }

  return staged.map(r => {
    const v = { ...r.values }
    const issues: ImportIssue[] = []
    const add = (field: string, level: 'error' | 'warning', message: string) => issues.push({ field, level, message })
    let action: 'create' | 'update' = 'create'
    let note: string | undefined

    const sem = normSemester(cell(v.semester))
    if (!cell(v.semester)) add('semester', 'error', 'Semester is missing (I to VIII).')
    else if (!sem) add('semester', 'error', `"${cell(v.semester)}" is not a semester. Use I to VIII.`)
    else v.semester = sem

    const code = cell(v.code)
    if (!code) add('code', 'error', 'Subject code is missing.')
    else if (code.length < 2 || code.length > 24) add('code', 'error', 'Subject code must be 2 to 24 characters.')
    else {
      const prior = seen.get(code.toLowerCase())
      if (prior) add('code', 'error', `The code ${code} is repeated; it is also on row ${prior}.`)
      else seen.set(code.toLowerCase(), r.row)
      const ex = byCode.get(code.toLowerCase())
      if (ex) {
        if (sem && ex.semester && ex.semester !== sem) add('code', 'error', `${code} already exists in Semester ${ex.semester}. A subject cannot move to another semester; use a different code or delete the old one.`)
        else { action = 'update'; note = `Updates ${ex.name}` }
      }
    }

    if (!cell(v.name)) add('name', 'error', 'Subject name is missing.')
    else if (cell(v.name).length < 2) add('name', 'error', 'Subject name is too short.')

    // type, inferred from the periods when it is blank
    const theory = num(cell(v.theory) === '' ? '0' : cell(v.theory))
    const lab = num(cell(v.lab) === '' ? '0' : cell(v.lab))
    if (cell(v.theory) === '' && cell(v.lab) === '') add('theory', 'error', 'Periods are missing: give theory periods per week and/or lab periods per week.')
    if (theory === null || theory < 0 || theory > 12) add('theory', 'error', 'Theory periods must be a whole number from 0 to 12.')
    if (lab === null || lab < 0 || lab > 12) add('lab', 'error', 'Lab periods must be a whole number from 0 to 12.')
    let type = cell(v.type) ? normType(cell(v.type)) : null
    if (!cell(v.type)) {
      if (theory !== null && lab !== null && (theory > 0 || lab > 0)) {
        type = lab === 0 ? 'THEORY' : theory === 0 ? 'LAB' : 'INTEGRATED'
        v.type = type
        add('type', 'warning', `Type was blank; ${type} was worked out from the periods.`)
      } else add('type', 'error', 'Type is missing (THEORY, INTEGRATED or LAB).')
    } else if (!type) add('type', 'error', `"${cell(v.type)}" is not a type. Use THEORY, INTEGRATED or LAB.`)
    else v.type = type
    if (type && sem && theory !== null && lab !== null && theory >= 0 && lab >= 0) {
      const problem = checkPeriods({ semester: sem, deliveryType: type, theoryPeriods: theory, labPeriods: lab })
      if (problem) add(type === 'LAB' || lab > 0 && theory === 0 ? 'lab' : 'theory', 'error', problem)
    }

    if (type === 'LAB' && sem && baseName(cell(v.name)) && theoryNames.has(`${sem}|${baseName(cell(v.name))}`)) {
      add('type', 'warning', `Looks like the lab of "${theoryNames.get(`${sem}|${baseName(cell(v.name))}`)}". One course with theory and lab should be a single INTEGRATED subject (xT + yL) so one teacher takes both; put its lab periods on that row and delete this one.`)
    }

    // lab rooms
    const labIds: string[] = []
    const labText = cell(v.labs)
    if (labText) {
      for (const name of labText.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean)) {
        const id = labByName.get(norm(name))
        if (id) { if (!labIds.includes(id)) labIds.push(id) } else add('labs', 'error', `Unknown lab room "${name}". Pick one from the list of rooms.`)
      }
    }
    if ((lab ?? 0) > 0 && labText === '') {
      const ex = code ? byCode.get(code.toLowerCase()) : undefined
      const have = ex ? (labRoomsOf.get(ex.id) ?? 0) : 0
      if (!have) add('labs', 'error', 'No lab room. A subject with lab periods needs at least one room, or the timetable cannot place its lab.')
    }
    if ((lab ?? 0) === 0 && labText) add('labs', 'warning', 'This subject has no lab periods, so the lab rooms are ignored.')

    // sections
    if (sem && normSemester(sem)) {
      const semSections = sections.filter(s => s.semester === sem && s.active !== false)
      const sectionText = cell(v.sections)
      if (semSections.length === 0) add('sections', 'warning', `Semester ${sem} has no sections yet. The subject is saved and will be offered to sections as you add them.`)
      else if (sectionText) {
        for (const l of sectionText.split(/[,;\s]+/).filter(Boolean)) {
          if (!semSections.some(s => s.id.replace(/^Y\d(S\d)?-/, '').toLowerCase() === l.toLowerCase())) add('sections', 'error', `Section "${l}" does not exist in Semester ${sem} (it has ${semSections.map(s => s.id.replace(/^Y\d(S\d)?-/, '')).join(', ')}).`)
        }
      }
    }

    if (cell(v.category) && !normCategory(cell(v.category))) add('category', 'error', `"${cell(v.category)}" is not a category. Use one of: ${CATEGORIES.join(', ')}.`)
    else if (normCategory(cell(v.category))) v.category = normCategory(cell(v.category))!
    if (cell(v.credits) !== '') { const c = num(cell(v.credits)); if (c === null || c < 0 || c > 10) add('credits', 'error', 'Credits must be a whole number from 0 to 10.') }
    else add('credits', 'warning', 'Credits are missing; 0 will be printed in the C column.')
    if (!cell(v.shortName)) add('shortName', 'warning', 'No short name. Initials of the subject name are used on the timetable grid.')
    return { ...r, values: v, issues, action, note }
  })
}

export async function validateSections(staged: StagedRow[]): Promise<CheckedRow[]> {
  const [existing, faculty] = await Promise.all([listSections(), listFaculty()])
  const byId = new Map(existing.map(x => [x.id, x]))
  const seen = new Map<string, number>()
  return staged.map(r => {
    const v = { ...r.values }
    const issues: ImportIssue[] = []
    const add = (field: string, level: 'error' | 'warning', message: string) => issues.push({ field, level, message })
    let action: 'create' | 'update' = 'create'
    let note: string | undefined
    const sem = normSemester(cell(v.semester))
    if (!cell(v.semester)) add('semester', 'error', 'Semester is missing (I to VIII).')
    else if (!sem) add('semester', 'error', `"${cell(v.semester)}" is not a semester. Use I to VIII.`)
    else v.semester = sem
    const letter = cell(v.section).toUpperCase()
    if (!letter) add('section', 'error', 'Section letter is missing (A, B, C …).')
    else if (!/^[A-Z]$/.test(letter)) add('section', 'error', `"${cell(v.section)}" is not a single letter A to Z.`)
    else v.section = letter
    if (sem && /^[A-Z]$/.test(letter)) {
      const id = sectionId(sem, letter)
      if (seen.has(id)) add('section', 'error', `Section ${letter} of Semester ${sem} is repeated; it is also on row ${seen.get(id)}.`)
      else seen.set(id, r.row)
      if (byId.has(id)) { action = 'update'; note = `Updates ${id}` }
    }
    if (cell(v.students) !== '') { const n = num(cell(v.students)); if (n === null || n < 1 || n > 300) add('students', 'error', 'Students must be a whole number from 1 to 300.') }
    const inch = cell(v.incharge)
    if (inch && !faculty.some(f => f.id.toLowerCase() === inch.toLowerCase() || f.name.trim().toLowerCase() === inch.toLowerCase())) {
      add('incharge', 'warning', `No teacher "${inch}" yet. The section is saved without an in-charge; set it later in Settings → Class in-charge.`)
    }
    return { ...r, values: v, issues, action, note }
  })
}

let labRoomsOf = new Map<string, number>()
async function refreshLabRoomCounts() {
  labRoomsOf = new Map()
  for (const m of await listLabSubjectMappings()) labRoomsOf.set(m.subjectId, (labRoomsOf.get(m.subjectId) ?? 0) + 1)
}

export async function validateRows(kind: ImportKind, rows: StagedRow[], opts: ImportOptions = {}): Promise<CheckedRow[]> {
  if (kind === 'teachers') return validateTeachers(rows, opts)
  if (kind === 'sections') return validateSections(rows)
  await refreshLabRoomCounts()
  return validateSyllabus(rows)
}

export const summarize = (rows: CheckedRow[]) => ({
  total: rows.length,
  errors: rows.filter(r => r.issues.some(i => i.level === 'error')).length,
  ready: rows.filter(r => !r.issues.some(i => i.level === 'error')).length,
  warnings: rows.filter(r => r.issues.some(i => i.level === 'warning')).length,
  toCreate: rows.filter(r => r.action === 'create').length,
  toUpdate: rows.filter(r => r.action === 'update').length,
})

/* ───────────────────────────── commit ───────────────────────────── */

export interface CommitResult { created: number; updated: number; skipped: number; removed?: number; logins: { facultyId: string; name: string; email: string | null; password: string }[]; subjects: string[] }

export async function commitRows(kind: ImportKind, rows: StagedRow[], skipInvalid: boolean, opts: ImportOptions = {}): Promise<{ ok: true; result: CommitResult } | { ok: false; checked: CheckedRow[] }> {
  const checked = await validateRows(kind, rows, opts)
  const bad = checked.filter(r => r.issues.some(i => i.level === 'error'))
  if (bad.length && !skipInvalid) return { ok: false, checked }
  const good = checked.filter(r => !r.issues.some(i => i.level === 'error'))
  const result: CommitResult = { created: 0, updated: 0, skipped: bad.length, logins: [], subjects: [] }

  if (kind === 'sections') {
    const [faculty, cycle, existing] = await Promise.all([listFaculty(), getCurrentAcademicCycle(), listSections()])
    for (const r of good) {
      const v = r.values
      const sem = normSemester(cell(v.semester))!, letter = cell(v.section).toUpperCase()
      const n = SEM_NUM[sem], id = sectionId(sem, letter)
      const inch = cell(v.incharge)
      const teacher = inch ? faculty.find(f => f.id.toLowerCase() === inch.toLowerCase() || f.name.trim().toLowerCase() === inch.toLowerCase()) : undefined
      const cur = existing.find(x => x.id === id)
      await upsertSection({
        ...(cur ?? {}), id, name: cur?.name ?? `${ROMAN_LIST[Math.ceil(n / 2)]} Year AI&DS ${letter}${n % 2 === 0 ? ` (Sem ${sem})` : ''}`,
        year: SEMESTER_TO_YEAR[sem], semester: sem, department: 'AI & DS',
        studentCount: cell(v.students) ? num(cell(v.students)) : cur?.studentCount ?? null,
        active: cur?.active ?? semesterInCycle(sem, cycle), classIncharge: teacher?.id ?? cur?.classIncharge ?? null,
      } as any)
      if (r.action === 'update') result.updated++; else result.created++
    }
  } else if (kind === 'teachers') {
    if (opts.replaceAll) {
      // full rewrite (e.g. another department): every teacher but the HOD goes, together with their logins, preferences,
      // assignments and messages; class in-charges that pointed at them are cleared and old timetables (now stale) are removed
      const gone = (await listFaculty()).filter(f => f.role !== 'HOD').map(f => f.id)
      for (const id of gone) await deleteFacultyCascade(id)
      for (const sec of await listSections()) if (sec.classIncharge && gone.includes(sec.classIncharge)) await upsertSection({ ...sec, classIncharge: null })
      await eraseGeneratedTimetables()
      result.removed = gone.length
    }
    const existing = await listFaculty()
    let ids = existing.map(f => f.id)
    for (const r of good) {
      const v = r.values
      const exp = num(cell(v.experience))!
      if (r.action === 'update') {
        const cur = existing.find(f => f.id.toLowerCase() === cell(v.facultyId).toLowerCase())!
        await upsertFaculty({
          ...cur, name: cell(v.name), designation: cell(v.designation) || cur.designation, email: cell(v.email) ? cell(v.email).toLowerCase() : cur.email ?? null,
          phone: cell(v.phone) || cur.phone || null, allocationExperience: exp, previousExperience: exp,
        } as any)
        result.updated++
      } else {
        const id = nextFacultyId(ids); ids = [...ids, id]
        await upsertFaculty({
          id, name: cell(v.name), designation: cell(v.designation) || 'Assistant Professor', department: 'AI & DS', email: cell(v.email) ? cell(v.email).toLowerCase() : null,
          phone: cell(v.phone) || null, role: 'FACULTY', allocationExperience: exp, previousExperience: exp, currentExperience: 0, maxDailyPeriods: 6, maxWeeklyPeriods: 24,
        } as any)
        const password = generatePassword()
        await setFacultyPassword(id, password)
        result.logins.push({ facultyId: id, name: cell(v.name), email: cell(v.email) ? cell(v.email).toLowerCase() : null, password })
        result.created++
      }
    }
  } else {
    await refreshLabRoomCounts()
    const [subjects, sections, offerings] = await Promise.all([listSubjects(), listSections(), listSectionSubjects()])
    const labByName = new Map((await listLabs()).flatMap(l => [[norm(l.name), l.id], [norm(l.id), l.id]] as [string, string][]))
    for (const r of good) {
      const v = r.values
      const sem = normSemester(cell(v.semester))!
      const type = normType(cell(v.type))!
      const theory = num(cell(v.theory) === '' ? '0' : cell(v.theory))!, lab = num(cell(v.lab) === '' ? '0' : cell(v.lab))!
      const cur = subjects.find(s => s.code.toLowerCase() === cell(v.code).toLowerCase())
      const labIds = cell(v.labs) ? [...new Set(cell(v.labs).split(/[,;\n]+/).map(x => labByName.get(norm(x))).filter(Boolean) as string[])] : undefined
      const semSections = sections.filter(s => s.semester === sem && s.active !== false)
      const sectionIds = cell(v.sections)
        ? semSections.filter(s => cell(v.sections).split(/[,;\s]+/).filter(Boolean).some(l => s.id.replace(/^Y\d(S\d)?-/, '').toLowerCase() === l.toLowerCase())).map(s => s.id)
        : cur ? offerings.filter(o => o.subjectId === cur.id).map(o => o.sectionId) : semSections.map(s => s.id)
      const sub: Subject = {
        ...(cur ?? {}), id: cur?.id ?? `SUB-${cell(v.code)}`, code: cell(v.code), name: cell(v.name), credits: cell(v.credits) === '' ? (cur?.credits ?? 0) : num(cell(v.credits))!,
        deliveryType: type, category: normCategory(cell(v.category)) ?? cur?.category ?? (type === 'LAB' ? 'LAB_ONLY' : 'CORE'),
        year: SEMESTER_TO_YEAR[sem], semester: sem, theoryPeriods: theory, labPeriods: lab, vertical: cur?.vertical ?? null,
        shortName: cell(v.shortName) || cur?.shortName || null, ltp: cur?.ltp ?? null, printAs: cur?.printAs ?? null,
      } as Subject
      await upsertSubject(sub)
      await writeSubjectCourses(sub)
      await syncOfferings(sub, sectionIds)
      await syncLabRooms(sub, labIds)
      result.subjects.push(sub.code)
      if (r.action === 'update') result.updated++; else result.created++
    }
  }
  saveLocalDb()
  return { ok: true, result }
}
