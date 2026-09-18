import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const baseUrl = (process.env.SCEDULAR_URL ?? 'http://localhost:8090').replace(/\/$/, '')
const workbookArg = process.argv[2] ?? '../SCEDULAR_REAL_DATA_FROM_PDFS_STAGE8.xlsx'
const workbookPath = path.resolve(process.cwd(), workbookArg)
const timeoutMs = Number(process.env.SCEDULAR_SMOKE_TIMEOUT_MS ?? 300000)

function fail(message) {
  console.error(`LIVE SMOKE FAILED: ${message}`)
  process.exit(1)
}

async function request(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }
  return body
}

if (!fs.existsSync(workbookPath)) fail(`Workbook not found: ${workbookPath}`)

console.log(`SCEDULAR live smoke target: ${baseUrl}`)
console.log(`Workbook: ${workbookPath}`)

const health = await request(`${baseUrl}/api/health`)
if (!health?.ok) fail('health endpoint did not return ok=true')
console.log('✓ health')

const bytes = fs.readFileSync(workbookPath)
const upload = new FormData()
upload.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), path.basename(workbookPath))

const preview = await request(`${baseUrl}/api/import/master/preview`, { method: 'POST', body: upload })
if (!preview.valid) fail(`master preview returned invalid: ${JSON.stringify(preview.errors)}`)
if (preview.summary?.sections !== 12) fail(`expected 12 sections, got ${preview.summary?.sections}`)
console.log(`✓ preview: ${preview.summary.sections} sections, ${preview.summary.teachingAssignments} teaching assignments`)

const commitUpload = new FormData()
commitUpload.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), path.basename(workbookPath))
const committed = await request(`${baseUrl}/api/import/master/commit`, { method: 'POST', body: commitUpload })
if (!committed.ok) fail('master commit did not return ok=true')
console.log('✓ commit')

const status = await request(`${baseUrl}/api/import/master/status`)
if (status.counts?.sections !== 12) fail(`DB status sections=${status.counts?.sections}, expected 12`)
if (status.counts?.subjects !== 9) fail(`DB status subjects=${status.counts?.subjects}, expected 9`)
console.log(`✓ DB status: ${JSON.stringify(status.counts)}`)

const generated = await request(`${baseUrl}/api/timetable/generate`, { method: 'POST' })
const generatedId = generated?.runId ?? generated?.id
if (!generatedId) fail('generate did not return a run id')
console.log(`✓ generate: run ${generatedId}, status=${generated.status}`)

const run = await request(`${baseUrl}/api/timetable/runs/${generatedId}`)
if (run.status !== 'GREEN' && run.status !== 'VALID') fail(`generated run status=${run.status}`)
if ((run.unscheduled ?? []).length !== 0) fail(`unscheduled units=${run.unscheduled.length}`)
if ((run.conflicts ?? []).length !== 0) fail(`conflicts=${run.conflicts.length}`)
if ((run.assignments ?? []).length !== 384) fail(`assignments=${run.assignments.length}, expected 384`)

const sectionCounts = new Map()
for (const assignment of run.assignments) {
  sectionCounts.set(assignment.sectionId, (sectionCounts.get(assignment.sectionId) ?? 0) + 1)
}
if (sectionCounts.size !== 12) fail(`expected 12 sections in generated timetable, got ${sectionCounts.size}`)
for (const [sectionId, count] of sectionCounts) {
  if (count !== 32) fail(`${sectionId} has ${count} assignments, expected 32`)
}

console.log('✓ validator/run contract: 384 assignments, 12 sections × 32 assignments, 0 unscheduled, 0 conflicts')
console.log('LIVE SMOKE PASS ✅')
