import { Router } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import {
  upsertCourse,
  upsertCourseRequirement,
  upsertFaculty,
  upsertSection,
  upsertTeacherAssignment,
  replaceImportedWorkload,
  listTeacherAssignments,
} from '../db/repo.js'

// Structured Excel import matching the fixed teacher-input schema from
// Section 3 of the report: one row per (faculty, course, section) pairing
// -- the same shape as a real department workload sheet. Rejects anything
// that doesn't match the schema instead of guessing at free-form
// spreadsheets (Section 16 pre-validation).
//
// A single sheet can now fully bootstrap a department from scratch: if
// Year/Semester/CourseName/ComponentType are present, the referenced
// section and course are created (or updated) on the fly instead of
// requiring them to already exist. This is what makes one workload-style
// spreadsheet sufficient for a whole department/year/semester rather than
// needing separate Sections and Courses imports first.
//
// One faculty teaching the same subject to several sections (commonly
// 3-4) is just several rows with the same FacultyId + CourseId and a
// different SectionId -- no special handling needed, each row is an
// independent (course, section) requirement. Per-faculty caps
// (MaxDailyPeriods/MaxWeeklyPeriods) always travel with this sheet, never
// as separate manual text entry -- the last value seen for a given
// FacultyId across the sheet's rows wins (upsertFaculty is called once
// per row).
export const legacyImportRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const componentTypeSchema = z.enum(['INTEGRATED_THEORY', 'INTEGRATED_LAB', 'LAB_ONLY', 'THEORY_ONLY', 'MANDATORY', 'ADDITIONAL'])

const rowSchema = z.object({
  FacultyId: z.union([z.string(), z.number()]).transform(String),
  FacultyName: z.string().min(1),
  Designation: z.string().optional(),
  Year: z.union([z.string(), z.number()]).transform(String).optional(),
  Semester: z.union([z.string(), z.number()]).transform(String).optional(),
  SectionId: z.union([z.string(), z.number()]).transform(String),
  CourseId: z.union([z.string(), z.number()]).transform(String),
  CourseCode: z.string().optional(),
  CourseName: z.string().optional(),
  ComponentType: componentTypeSchema.optional(),
  LabBlockLength: z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().positive().optional()),
  WeeklyTheoryPeriods: z.coerce.number().int().nonnegative().default(0),
  WeeklyLabPeriods: z.coerce.number().int().nonnegative().default(0),
  MaxDailyPeriods: z.coerce.number().int().positive().default(8),
  MaxWeeklyPeriods: z.coerce.number().int().positive().default(24),
}).superRefine((row, ctx) => {
  const isLab = row.ComponentType === 'INTEGRATED_LAB' || row.ComponentType === 'LAB_ONLY'
  if (isLab && row.LabBlockLength === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['LabBlockLength'], message: 'LabBlockLength is required for laboratory subjects' })
  }
  if (!isLab && row.LabBlockLength !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['LabBlockLength'], message: 'Leave LabBlockLength empty for non-laboratory subjects' })
  }
})

const courseImportSchema = z.object({
  CourseId: z.union([z.string(), z.number()]).transform(String),
  CourseName: z.string().min(1),
  ComponentType: componentTypeSchema,
  WeeklyPeriods: z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().positive()),
  LabBlockLength: z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().positive().optional()),
}).superRefine((row, ctx) => {
  const isLab = row.ComponentType === 'INTEGRATED_LAB' || row.ComponentType === 'LAB_ONLY'
  if (isLab && row.LabBlockLength === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['LabBlockLength'], message: 'LabBlockLength is required for laboratory subjects' })
  }
  if (!isLab && row.LabBlockLength !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['LabBlockLength'], message: 'Leave LabBlockLength empty for non-laboratory subjects' })
  }
})

legacyImportRouter.post('/subjects', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' })

    let rows: unknown[]
    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    } catch {
      return res.status(400).json({ error: 'Could not parse the uploaded file as an Excel workbook' })
    }

    const imported: z.infer<typeof courseImportSchema>[] = []
    const rejected: { row: number; issues: unknown }[] = []
    rows.forEach((row, i) => {
      const parsed = courseImportSchema.safeParse(row)
      if (parsed.success) imported.push(parsed.data)
      else rejected.push({ row: i + 2, issues: parsed.error.flatten() })
    })

    const teacherAssignments = await listTeacherAssignments()
    for (const course of imported) {
      await upsertCourse({
        id: course.CourseId,
        code: course.CourseId,
        name: course.CourseName,
        componentType: course.ComponentType,
        labBlockLength: course.LabBlockLength ?? 3,
      })
      const weeklyTheoryPeriods = course.ComponentType === 'INTEGRATED_LAB' || course.ComponentType === 'LAB_ONLY' ? 0 : course.WeeklyPeriods
      const weeklyLabPeriods = course.ComponentType === 'INTEGRATED_LAB' || course.ComponentType === 'LAB_ONLY' ? course.WeeklyPeriods : 0
      for (const assignment of teacherAssignments.filter(item => item.courseId === course.CourseId)) {
        await upsertCourseRequirement({ courseId: course.CourseId, sectionId: assignment.sectionId, weeklyTheoryPeriods, weeklyLabPeriods })
      }
    }

    res.json({ totalRows: rows.length, imported: imported.length, rejected: rejected.length, rejectedRows: rejected })
  } catch (err) {
    next(err)
  }
})

legacyImportRouter.post('/faculty-workload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' })

    let rows: unknown[]
    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    } catch (err) {
      return res.status(400).json({ error: 'Could not parse the uploaded file as an Excel workbook' })
    }

    const accepted: z.infer<typeof rowSchema>[] = []
    const rejected: { row: number; issues: unknown }[] = []
    rows.forEach((row, i) => {
      const parsed = rowSchema.safeParse(row)
      if (parsed.success) accepted.push(parsed.data)
      else rejected.push({ row: i + 2 /* header is row 1 */, issues: parsed.error.flatten() })
    })

    // Do not mutate the current dataset when the replacement file is empty or
    // every row is invalid. A valid import replaces the previous workload.
    if (accepted.length > 0) await replaceImportedWorkload()

    for (const r of accepted) {
      await upsertFaculty({
        id: r.FacultyId,
        name: r.FacultyName,
        designation: r.Designation ?? null,
        maxDailyPeriods: r.MaxDailyPeriods,
        maxWeeklyPeriods: r.MaxWeeklyPeriods,
      })
      if (r.Year || r.Semester) {
        await upsertSection({ id: r.SectionId, name: r.SectionId, year: r.Year ?? null, semester: r.Semester ?? null })
      }
      if (r.CourseName || r.ComponentType) {
        await upsertCourse({
          id: r.CourseId,
          code: r.CourseCode ?? r.CourseId,
          name: r.CourseName ?? r.CourseId,
          // Only the unambiguous single-signal cases are inferred. A row
          // with BOTH counts > 0 and no explicit ComponentType is exactly
          // the shape the taxonomy forbids -- an "integrated" subject must
          // be two separate rows (its own INTEGRATED_THEORY row and
          // INTEGRATED_LAB row), so defaulting it to THEORY_ONLY here lets
          // preValidate's symmetric check catch and report the mistake
          // instead of silently guessing.
          componentType: r.ComponentType ?? (r.WeeklyLabPeriods > 0 && r.WeeklyTheoryPeriods === 0 ? 'LAB_ONLY' : 'THEORY_ONLY'),
          labBlockLength: r.LabBlockLength ?? 3,
        })
      }
      await upsertTeacherAssignment({ facultyId: r.FacultyId, courseId: r.CourseId, sectionId: r.SectionId })
      await upsertCourseRequirement({
        courseId: r.CourseId,
        sectionId: r.SectionId,
        weeklyTheoryPeriods: r.WeeklyTheoryPeriods,
        weeklyLabPeriods: r.WeeklyLabPeriods,
      })
    }

    res.json({
      totalRows: rows.length,
      imported: accepted.length,
      rejected: rejected.length,
      rejectedRows: rejected,
    })
  } catch (err) {
    next(err)
  }
})
