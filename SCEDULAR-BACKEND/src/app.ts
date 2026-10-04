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

import { facultyAllocationRouter } from './routes/facultyAllocation.js'
import { hodAssignRouter } from './routes/hodAssign.js'
import { setupRouter } from './routes/setup.js'
import { teacherExtrasRouter } from './routes/teacherExtras.js'
import { passwordResetRouter } from './routes/passwordReset.js'
import { assistantRouter } from './routes/assistant.js'
import { messagesRouter } from './routes/messages.js'
import { dataEraseRouter } from './routes/dataErase.js'
import { photosRouter } from './routes/photos.js'
import { bulkImportRouter } from './routes/bulkImport.js'
import { apiGuard, hodWrites, securityHeaders } from './auth/guard.js'
import { workloadTemplatesRouter } from './routes/workloadTemplates.js'

function buildCorsOriginList(): (string | RegExp)[] {
  const origins: (string | RegExp)[] = []
  const vercelUrl = process.env.VERCEL_URL || process.env.VITE_VERCEL_URL
  if (vercelUrl) {
    origins.push(`https://${vercelUrl}`)
    origins.push(/\.vercel\.app$/)
  }
  const extra = process.env.CORS_ORIGINS?.split(',') ?? []
  for (const raw of extra) {
    const v = raw.trim()
    if (!v) continue
    if (v.startsWith('/') && v.endsWith('/')) {
      try { origins.push(new RegExp(v.slice(1, -1))) } catch { /* ignore */ }
    } else {
      origins.push(v)
    }
  }
  origins.push(/^https?:\/\/localhost(:\d+)?$/)
  origins.push(/^https?:\/\/127\.0\.0\.1(:\d+)?$/)
  origins.push(/^https?:\/\/0\.0\.0\.0(:\d+)?$/)
  return origins
}
const corsOrigins = buildCorsOriginList()

export const app = express()
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    const ok = corsOrigins.some(o => typeof o === 'string' ? o === origin : o.test(origin))
    if (ok) return cb(null, true)
    if (process.env.NODE_ENV !== 'production') console.warn(`[CORS] unexpected origin: ${origin}`)
    cb(null, true)
  },
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
}))
app.use(express.json({ limit: '3mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

app.use('/api', securityHeaders)
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

// nothing below this line is reachable without signing in (login / forgot / reset / health excepted)
app.use('/api', apiGuard)

app.use('/api', facultyAllocationRouter)
app.use('/api', passwordResetRouter)
app.use('/api', assistantRouter)
app.use('/api', messagesRouter)
app.use('/api', dataEraseRouter)
app.use('/api', photosRouter)
app.use('/api', bulkImportRouter)
app.use('/api', hodAssignRouter)
app.use('/api', setupRouter)
app.use('/api', teacherExtrasRouter)
app.use('/api', workloadTemplatesRouter)
app.use('/api/faculty', hodWrites([/^PATCH \/[^/]+\/experience$/]), facultyRouter)
app.use('/api/sections', hodWrites(), sectionsRouter)
app.use('/api/courses', hodWrites(), coursesRouter)
app.use('/api/subjects', hodWrites(), subjectsRouter)
app.use('/api/section-subjects', hodWrites(), sectionSubjectsRouter)
app.use('/api/teaching-assignments', hodWrites(), teachingAssignmentsRouter)
app.use('/api/labs', hodWrites(), labsRouter)
app.use('/api/config', hodWrites(), configRouter)
app.use('/api/workload', hodWrites(), workloadRouter)
app.use('/api/import', hodWrites(), importRouter)
app.use('/api/timetable', hodWrites(), timetableRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  // internal details stay in the server log in production
  const message = process.env.NODE_ENV === 'production' ? 'Something went wrong on the server.' : (err?.message ?? 'Internal server error')
  res.status(500).json({ error: 'SERVER_ERROR', message })
})
