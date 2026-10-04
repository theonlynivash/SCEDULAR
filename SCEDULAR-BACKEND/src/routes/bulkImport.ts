import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { verifyFacultyPassword } from '../auth/passwords.js'
import { runAtomic } from '../db/localDb.js'
import { hasPersonalPassword } from '../auth/passwords.js'
import { buildTemplate, columnsOf, commitRows, parseSheet, summarize, validateRows, type ImportKind } from '../import/bulkImport.js'
import { listFaculty, listLabs, listLabSubjectMappings, listSectionSubjects, listSections, listSubjects, listTeachingAssignments } from '../db/repo.js'

/** Import teachers / syllabus from Excel: template -> upload (staged, nothing saved) -> fix on screen -> commit. HOD only. */
export const bulkImportRouter = Router()
bulkImportRouter.use('/setup/import', requireAuth, requireRole('HOD'))

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
const kindOf = (v: string): ImportKind | null => (v === 'teachers' || v === 'syllabus' || v === 'sections' ? v : null)
const bad = (res: any, message: string) => res.status(400).json({ error: 'INVALID_INPUT', message })

// GET /api/setup/import/template/:kind -> the Excel template
bulkImportRouter.get('/setup/import/template/:kind', async (req, res, next) => {
  try {
    const kind = req.params.kind === 'all' ? 'all' : kindOf(req.params.kind)
    if (!kind) return bad(res, 'Unknown import type.')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="SCEDULAR-${kind === 'all' ? 'All-in-one' : kind === 'teachers' ? 'Teachers' : kind === 'syllabus' ? 'Syllabus' : 'Sections'}-Template.xlsx"`)
    res.send(await buildTemplate(kind))
  } catch (err) { next(err) }
})

/** What the review screen needs to draw its drop-downs. */
async function lookups(kind: ImportKind) {
  if (kind !== 'syllabus') return {}
  const [labs, sections] = await Promise.all([listLabs(), listSections()])
  return { labs: labs.map(l => l.name), sections: sections.filter(s => s.active !== false).map(s => ({ id: s.id, semester: s.semester })) }
}

// POST /api/setup/import/:kind/preview (multipart "file") -> staged rows with every problem listed; saves nothing
bulkImportRouter.post('/setup/import/:kind/preview', upload.single('file'), async (req, res, next) => {
  try {
    const kind = kindOf(req.params.kind)
    if (!kind) return bad(res, 'Unknown import type.')
    if (!req.file) return bad(res, 'Choose an Excel file (.xlsx) to upload.')
    let parsed
    try { parsed = parseSheet(kind, req.file.buffer) } catch (e: any) { return bad(res, `Could not read that file: ${e?.message ?? 'not a valid Excel workbook'}.`) }
    if (parsed.missingHeaders.length) return bad(res, `The sheet "${parsed.sheet}" has no column for: ${parsed.missingHeaders.join(', ')}. Use the template's headers.`)
    if (parsed.rows.length === 0) return bad(res, `The sheet "${parsed.sheet}" has no data rows (example rows are ignored).`)
    if (parsed.rows.length > 500) return bad(res, 'Please import at most 500 rows at a time.')
    const rows = await validateRows(kind, parsed.rows, { replaceAll: kind === 'teachers' && req.body?.mode === 'replace' })
    res.json({ kind, sheet: parsed.sheet, columns: columnsOf(kind), unknownColumns: parsed.unknownHeaders, rows, summary: summarize(rows), lookups: await lookups(kind) })
  } catch (err) { next(err) }
})

const rowsBody = z.object({
  rows: z.array(z.object({ row: z.number().int(), values: z.record(z.string(), z.string().nullable().transform(v => v ?? '')) })).max(500),
  skipInvalid: z.boolean().optional(),
  /** teachers: 'add' (default) or 'replace' = full rewrite; replace also needs the HOD password and confirm = REPLACE */
  mode: z.enum(['add', 'replace']).optional(),
  password: z.string().optional(),
  confirm: z.string().optional(),
})

// POST /api/setup/import/:kind/validate { rows } -> the same rows re-checked after the HOD edited them
bulkImportRouter.post('/setup/import/:kind/validate', async (req, res, next) => {
  try {
    const kind = kindOf(req.params.kind), p = rowsBody.safeParse(req.body)
    if (!kind || !p.success) return bad(res, 'Send the rows to check.')
    const rows = await validateRows(kind, p.data.rows, { replaceAll: kind === 'teachers' && p.data.mode === 'replace' })
    res.json({ rows, summary: summarize(rows) })
  } catch (err) { next(err) }
})

// POST /api/setup/import/:kind/commit { rows, skipInvalid? } -> saves. Refused (422) while any row still has an error.
bulkImportRouter.post('/setup/import/:kind/commit', async (req, res, next) => {
  try {
    const kind = kindOf(req.params.kind), p = rowsBody.safeParse(req.body)
    if (!kind || !p.success) return bad(res, 'Send the rows to import.')
    const replaceAll = kind === 'teachers' && p.data.mode === 'replace'
    if (replaceAll) {
      if (p.data.confirm !== 'REPLACE') return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Type REPLACE to confirm replacing every teacher.' })
      if (!(await verifyFacultyPassword(req.auth!.facultyId, p.data.password ?? ''))) return res.status(403).json({ error: 'WRONG_PASSWORD', message: 'Your password is incorrect. Nothing was changed.' })
    }
    const out = await runAtomic(() => commitRows(kind, p.data.rows, Boolean(p.data.skipInvalid), { replaceAll }))
    if (!out.ok) return res.status(422).json({ error: 'ROWS_HAVE_ERRORS', message: 'Some rows still have errors. Fix them or choose to skip those rows.', rows: out.checked, summary: summarize(out.checked) })
    res.json({ success: true, ...out.result })
  } catch (err) { next(err) }
})

// GET /api/setup/import/data-check -> what is still missing before preferences, approval and timetable generation can work
bulkImportRouter.get('/setup/import/data-check', async (_req, res, next) => {
  try {
    const [faculty, subjects, sections, offerings, assignments, labMaps, labs] = await Promise.all([
      listFaculty(), listSubjects(), listSections(), listSectionSubjects(), listTeachingAssignments(), listLabSubjectMappings(), listLabs(),
    ])
    type Item = { level: 'error' | 'warning'; area: 'teachers' | 'syllabus' | 'sections' | 'assignment'; message: string; ref?: string }
    const items: Item[] = []
    const teachers = faculty.filter(f => f.role !== 'HOD')
    for (const t of teachers) {
      if (t.allocationExperience === null || t.allocationExperience === undefined) items.push({ level: 'error', area: 'teachers', ref: t.id, message: `${t.name}: experience is not set, so they cannot submit preferences.` })
      if (!(await hasPersonalPassword(t.id))) items.push({ level: 'warning', area: 'teachers', ref: t.id, message: `${t.name}: no login yet.` })
      if (!t.email) items.push({ level: 'warning', area: 'teachers', ref: t.id, message: `${t.name}: no email (no Forgot password, no mails).` })
    }
    const activeSecs = sections.filter(s => s.active !== false)
    const semesters = [...new Set(subjects.map(s => s.semester).filter(Boolean) as string[])]
    for (const sem of semesters) {
      if (!activeSecs.some(s => s.semester === sem)) items.push({ level: 'error', area: 'sections', ref: sem, message: `Semester ${sem} has subjects but no sections, so there is nothing to schedule.` })
    }
    for (const s of subjects) {
      if ((s.labPeriods ?? 0) > 0 && !labMaps.some(m => m.subjectId === s.id)) items.push({ level: 'error', area: 'syllabus', ref: s.id, message: `${s.code} ${s.name}: no lab room is set for its lab periods.` })
      if (!s.shortName) items.push({ level: 'warning', area: 'syllabus', ref: s.id, message: `${s.code}: no short name for the timetable grid.` })
    }
    const unstaffed = offerings.filter(o => !assignments.some(a => a.sectionSubjectId === o.id)).length
    if (unstaffed > 0) items.push({ level: 'warning', area: 'assignment', message: `${unstaffed} subject offering${unstaffed === 1 ? '' : 's'} still need a teacher (do this in Assign Teachers).` })
    const errors = items.filter(i => i.level === 'error')
    res.json({
      items,
      ready: {
        preferences: teachers.length > 0 && !errors.some(e => e.area === 'teachers') && subjects.length > 0,
        timetable: errors.length === 0 && unstaffed === 0 && subjects.length > 0 && labs.length >= 0,
      },
      counts: { teachers: teachers.length, subjects: subjects.length, sections: activeSecs.length },
    })
  } catch (err) { next(err) }
})
