import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(backend, '..')
const frontend = path.join(root, 'SCEDULAR-FRONTEND')
const checks = []

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
}

function commandExists(cmd) {
  try { execSync(`${cmd} --version`, { stdio: 'ignore' }); return true } catch { return false }
}

check('Node.js', Number(process.versions.node.split('.')[0]) >= 20, `Node ${process.versions.node}`)
check('npm', commandExists('npm'))
check('Docker (optional for local live DB)', commandExists('docker'))
check('Master workbook', fs.existsSync(path.join(root, 'SCEDULAR_REAL_DATA_FROM_PDFS_STAGE8.xlsx')))
check('Backend package.json', fs.existsSync(path.join(backend, 'package.json')))
check('Backend schema', fs.existsSync(path.join(backend, 'src/db/schema.sql')))
check('Import route', fs.existsSync(path.join(backend, 'src/routes/import.ts')))
check('Timetable route', fs.existsSync(path.join(backend, 'src/routes/timetable.ts')))
check('Canonical solver', fs.existsSync(path.join(backend, 'src/solver/csp.ts')))
check('Independent validator', fs.existsSync(path.join(backend, 'src/solver/validator.ts')))
check('Frontend package.json', fs.existsSync(path.join(frontend, 'package.json')))
check('DATABASE_URL configured', Boolean(process.env.DATABASE_URL), process.env.DATABASE_URL ? 'present' : 'missing')

if (process.env.DATABASE_URL) {
  check('Live DB TCP connectivity', false, 'Not probed by preflight; run npm run test:live against a running service.')
}

for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'WARN'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
}

const hardFailures = checks.filter(c => !c.ok && !c.name.startsWith('Docker') && c.name !== 'DATABASE_URL configured')
if (hardFailures.length) process.exit(1)
console.log(`PREFLIGHT COMPLETE: ${checks.filter(c => c.ok).length} pass, ${checks.filter(c => !c.ok).length} warnings`)
