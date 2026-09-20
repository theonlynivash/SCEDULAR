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
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

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

app.use('/api', facultyAllocationRouter)
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
