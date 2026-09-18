import express from 'express'
import cors from 'cors'
import { ensureInitialized } from './db/client.js'
import { facultyRouter } from './routes/faculty.js'
import { sectionsRouter } from './routes/sections.js'
import { coursesRouter } from './routes/courses.js'
import { labsRouter } from './routes/labs.js'
import { configRouter } from './routes/config.js'
import { workloadRouter } from './routes/workload.js'
import { importRouter } from './routes/import.js'
import { timetableRouter } from './routes/timetable.js'
import { subjectsRouter } from './routes/subjects.js'
import { sectionSubjectsRouter } from './routes/sectionSubjects.js'
import { teachingAssignmentsRouter } from './routes/teachingAssignments.js'

export const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'scedular-backend' }))

// Postgres schema init (idempotent) runs lazily on first request requiring DB access.
app.use(async (req, res, next) => {
  if (req.path === '/api/health' || req.path === '/api/import/master/preview') {
    return next()
  }
  try {
    await ensureInitialized()
    next()
  } catch (err) {
    next(err)
  }
})

app.use('/api/faculty', facultyRouter)
app.use('/api/sections', sectionsRouter)
app.use('/api/courses', coursesRouter)
app.use('/api/subjects', subjectsRouter)
app.use('/api/section-subjects', sectionSubjectsRouter)
app.use('/api/teaching-assignments', teachingAssignmentsRouter)
app.use('/api/labs', labsRouter)
app.use('/api/config', configRouter)
app.use('/api/workload', workloadRouter)
app.use('/api/import', importRouter)
app.use('/api/timetable', timetableRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err?.message ?? 'Internal server error' })
})
