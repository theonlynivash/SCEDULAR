import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const checks = [
  ['backend env example exists', fs.existsSync(path.join(root, 'SCEDULAR-BACKEND/.env.example'))],
  ['frontend env example exists', fs.existsSync(path.join(root, 'SCEDULAR-FRONTEND/.env.example'))],
  ['backend build script exists', JSON.parse(fs.readFileSync(path.join(root, 'SCEDULAR-BACKEND/package.json'), 'utf8')).scripts?.build === 'tsc -p tsconfig.json'],
  ['backend migrate script exists', JSON.parse(fs.readFileSync(path.join(root, 'SCEDULAR-BACKEND/package.json'), 'utf8')).scripts?.migrate === 'tsx src/db/migrate.ts'],
  ['frontend build script exists', JSON.parse(fs.readFileSync(path.join(root, 'SCEDULAR-FRONTEND/package.json'), 'utf8')).scripts?.build === 'vite build'],
  ['frontend points to VITE_API_URL', fs.readFileSync(path.join(root, 'SCEDULAR-FRONTEND/src/api.ts'), 'utf8').includes('VITE_API_URL')],
  ['backend health endpoint exists', fs.readFileSync(path.join(root, 'SCEDULAR-BACKEND/src/app.ts'), 'utf8').includes("app.get('/api/health'")],
  ['postgres DATABASE_URL required', fs.readFileSync(path.join(root, 'SCEDULAR-BACKEND/src/db/client.ts'), 'utf8').includes('DATABASE_URL')],
  ['local setup docs exist', fs.existsSync(path.join(root, 'LOCAL_SETUP.md'))],
]
let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`)
  if (!ok) failed++
}
process.exitCode = failed ? 1 : 0
