import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontendRoot = path.resolve(root, '..', 'SCEDULAR-FRONTEND')
const schema = fs.readFileSync(path.join(root, 'src/db/schema.sql'), 'utf8')
const repo = fs.readFileSync(path.join(root, 'src/db/repo.ts'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src/app.ts'), 'utf8')
const labs = fs.readFileSync(path.join(root, 'src/routes/labs.ts'), 'utf8')
const api = fs.readFileSync(path.join(frontendRoot, 'src/api.ts'), 'utf8')

const checks = [
  ['assignments.subject_id column', /assignments ADD COLUMN IF NOT EXISTS subject_id/.test(schema)],
  ['assignments.section_subject_id column', /assignments ADD COLUMN IF NOT EXISTS section_subject_id/.test(schema)],
  ['assignments.course_id nullable', /ALTER TABLE assignments ALTER COLUMN course_id DROP NOT NULL/.test(schema)],
  ['unscheduled canonical subject identity', /unscheduled ADD COLUMN IF NOT EXISTS subject_id/.test(schema)],
  ['repo persists canonical subject_id', /subject_id, section_subject_id, faculty_id, block_type, batch, lab_id/.test(repo)],
  ['repo reads canonical assignment metadata', /subjectId: r\.subject_id/.test(repo)],
  ['subjects route mounted', /app\.use\('\/api\/subjects'/.test(app)],
  ['section-subjects route mounted', /app\.use\('\/api\/section-subjects'/.test(app)],
  ['teaching-assignments route mounted', /app\.use\('\/api\/teaching-assignments'/.test(app)],
  ['section-aware lab mapping route', /subject-mapping/.test(labs)],
  ['frontend canonical subjects API', /request<Subject\[\]>\('\/subjects'/.test(api)],
  ['frontend canonical section-subjects API', /request<SectionSubject\[\]>\('\/section-subjects'/.test(api)],
  ['frontend canonical teaching-assignment API', /request<TeachingAssignment\[\]>\('\/teaching-assignments'/.test(api)],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}
if (failed) process.exit(1)
console.log(`STAGE11 CONTRACT CHECK: PASS (${checks.length} checks)`)
