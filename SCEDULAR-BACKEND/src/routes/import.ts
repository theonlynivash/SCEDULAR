import { Router } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { upsertCourseRequirement, upsertFaculty, upsertTeacherAssignment } from '../db/repo.js'

// Structured Excel import matching the fixed teacher-input schema from
// Section 3 of the report: one row per (faculty, course, section) pairing.
// Rejects anything that doesn't match the schema instead of guessing at
// free-form spreadsheets (Section 16 pre-validation).
export const importRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const rowSchema = z.object({
  FacultyId: z.union([z.string(), z.number()]).transform(String),
  FacultyName: z.string().min(1),
  Designation: z.string().optional(),
  CourseId: z.union([z.string(), z.number()]).transform(String),
  SectionId: z.union([z.string(), z.number()]).transform(String),
  WeeklyTheoryPeriods: z.coerce.number().int().nonnegative().default(0),
  WeeklyLabPeriods: z.coerce.number().int().nonnegative().default(0),
  MaxDailyPeriods: z.coerce.number().int().positive().default(6),
  MaxWeeklyPeriods: z.coerce.number().int().positive().default(24),
})

importRouter.post('/faculty-workload', upload.single('file'), (req, res) => {
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

  for (const r of accepted) {
    upsertFaculty({
      id: r.FacultyId,
      name: r.FacultyName,
      designation: r.Designation ?? null,
      maxDailyPeriods: r.MaxDailyPeriods,
      maxWeeklyPeriods: r.MaxWeeklyPeriods,
    })
    upsertTeacherAssignment({ facultyId: r.FacultyId, courseId: r.CourseId, sectionId: r.SectionId })
    upsertCourseRequirement({
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
})
