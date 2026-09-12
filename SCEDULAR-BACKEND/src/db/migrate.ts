import 'dotenv/config'
// One-off migration runner: applies schema.sql and seeds the default
// schedule-grid row against whatever DATABASE_URL points at. Safe to
// re-run (everything is idempotent). Useful for explicitly provisioning a
// fresh Neon database before the first deploy, separate from the app's
// own lazy init-on-first-request.
import { ensureInitialized, pool } from './client.js'

async function main() {
  await ensureInitialized()
  console.log('Schema applied and default schedule config ensured.')
  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
