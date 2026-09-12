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

export const app = express()
app.use(cors())
app.use(express.json())

// Postgres schema init (idempotent) runs lazily on first request so cold
// starts don't pay for it unless something is actually hit, and so a
// serverless deployment never needs a separate migration step wired into
// the build.
app.use(async (_req, res, next) => {
  try {
    await ensureInitialized()
    next()
  } catch (err) {
    next(err)
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'scedular-backend' }))

app.use('/api/faculty', facultyRouter)
app.use('/api/sections', sectionsRouter)
app.use('/api/courses', coursesRouter)
app.use('/api/labs', labsRouter)
app.use('/api/config', configRouter)
app.use('/api/workload', workloadRouter)
app.use('/api/import', importRouter)
app.use('/api/timetable', timetableRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err?.message ?? 'Internal server error' })
})
