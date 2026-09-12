import express from 'express'
import cors from 'cors'
import './db/client.js' // ensures schema + default config are initialized before routes load
import { facultyRouter } from './routes/faculty.js'
import { sectionsRouter } from './routes/sections.js'
import { coursesRouter } from './routes/courses.js'
import { labsRouter } from './routes/labs.js'
import { configRouter } from './routes/config.js'
import { workloadRouter } from './routes/workload.js'
import { importRouter } from './routes/import.js'
import { timetableRouter } from './routes/timetable.js'

const app = express()
app.use(cors())
app.use(express.json())

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
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = Number(process.env.PORT) || 8090
app.listen(PORT, () => {
  console.log(`SCEDULAR backend listening on http://localhost:${PORT}`)
})
