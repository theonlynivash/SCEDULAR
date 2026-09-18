import { Router } from 'express'
import multer from 'multer'
import { previewWorkbook } from '../import/index.js'
import { replaceCanonicalImport, clearAllData, listSections, listSubjects, listSectionSubjects, listFaculty, listTeachingAssignments, listLabs, listLabSubjectMappings, listFacultyUnavailability } from '../db/repo.js'
import { legacyImportRouter } from './importLegacy.js'

export const importRouter = Router()

// Reset / wipe all database & in-memory dataset state to a clean slate.
importRouter.post('/master/reset', async (_req, res, next) => {
  try {
    await clearAllData()
    return res.json({ ok: true, message: 'All database and in-memory data wiped clean.' })
  } catch (err) {
    return next(err)
  }
})

// Read-only canonical dataset summary used by the frontend generation screen.
importRouter.get('/master/status', async (_req, res, next) => {
  try {
    const [sections, subjects, sectionSubjects, faculty, teachingAssignments, labs, labMappings, facultyUnavailability] = await Promise.all([
      listSections(), listSubjects(), listSectionSubjects(), listFaculty(), listTeachingAssignments(), listLabs(), listLabSubjectMappings(), listFacultyUnavailability(),
    ])
    res.json({
      counts: { sections: sections.length, subjects: subjects.length, sectionSubjects: sectionSubjects.length, faculty: faculty.length, teachingAssignments: teachingAssignments.length, labs: labs.length, labMappings: labMappings.length, facultyUnavailability: facultyUnavailability.length },
    })
  } catch (err) {
    next(err)
  }
})

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// Stage 2: Excel -> parse -> normalize -> validate. This route never writes DB state.
importRouter.post('/master/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' })
    const preview = previewWorkbook(req.file.buffer)
    return res.status(preview.valid ? 200 : 422).json(preview)
  } catch (err) {
    return next(err)
  }
})

// Stage 2: the same workbook is parsed and validated again before commit.
// Re-reading the file avoids large JSON payloads and guarantees that the
// database can only receive data that passes the exact same validation path.
importRouter.post('/master/commit', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' })
    const preview = previewWorkbook(req.file.buffer)
    if (!preview.valid || !preview.dataset) return res.status(422).json(preview)
    await replaceCanonicalImport(preview.dataset)
    return res.json({ ok: true, imported: preview.summary, warnings: preview.warnings })
  } catch (err) {
    return next(err)
  }
})

// Keep existing /subjects and /faculty-workload endpoints working while the
// frontend is migrated in Stage 5. They do not participate in the new master flow.
importRouter.use(legacyImportRouter)
