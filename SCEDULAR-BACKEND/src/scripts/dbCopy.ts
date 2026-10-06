/**
 * Copy the department's data between the local file and the online PostgreSQL (Neon) database.
 *
 *   npm run db:check              show which store this computer would use and whether the online database answers
 *   npm run db:push -- --yes      local file  ->  online database   (replaces what is online; asks for --yes)
 *   npm run db:pull -- --yes      online database  ->  local file   (the old file is kept as a backup next to it)
 *
 * The connection string comes from DATABASE_URL in .env. Login sessions and password-reset codes are never copied.
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.STORAGE = 'postgres'                       // this tool always talks to the online database
const { initStorage, loadSnapshot, saveSnapshot, sql } = await import('../db/storage.js')

const here = path.dirname(fileURLToPath(import.meta.url))
const FILE = process.env.SCEDULAR_DB_FILE ? path.resolve(process.env.SCEDULAR_DB_FILE) : path.resolve(here, '../../data/scedular_local_db.json')
const [cmd, ...flags] = process.argv.slice(2)
const yes = flags.includes('--yes')
const die = (m: string): never => { console.error('\n' + m + '\n'); process.exit(1) }

if (!process.env.DATABASE_URL) die('DATABASE_URL is empty. Put the Neon connection string in SCEDULAR-BACKEND/.env first.')
const host = (() => { try { return new URL(process.env.DATABASE_URL!).host } catch { return 'the database' } })()

try {
  await initStorage()
  const snap = await loadSnapshot()

  if (cmd === 'check') {
    console.log(`Online database (${host}): ${snap ? `holds the department data, version ${snap.version}` : 'reachable, but empty (the first request to the API will create the data)'}`)
    console.log(`Local file: ${fs.existsSync(FILE) ? FILE : 'not created yet (' + FILE + ')'}`)
  } else if (cmd === 'push') {
    if (!fs.existsSync(FILE)) die(`There is no local data file at ${FILE}.`)
    if (!yes) die(`This REPLACES the data in ${host}${snap ? ` (now at version ${snap.version})` : ''} with your local file.\nRun again with --yes if that is what you want:  npm run db:push -- --yes`)
    const state = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    const photos: Record<string, { data: string; at: string }> = state.facultyPhotos ?? {}
    delete state.facultyPhotos; delete state.passwordResets; state.sessions = []
    const v = await saveSnapshot(state, snap ? snap.version : null)
    for (const [id, p] of Object.entries(photos)) {
      await sql().query('INSERT INTO faculty_photos (faculty_id, data, updated_at) VALUES ($1,$2,$3) ON CONFLICT (faculty_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at', [id, p.data, p.at])
    }
    console.log(`Done: ${host} now holds your local data (version ${v}, ${Object.keys(photos).length} profile pictures).`)
  } else if (cmd === 'pull') {
    if (!snap) die(`${host} holds no data yet.`)
    if (!yes) die(`This REPLACES your local file with the data in ${host}. The current file is kept as a backup.\nRun again with --yes:  npm run db:pull -- --yes`)
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, `${FILE}.backup-${Date.now()}`)
    const state = snap!.state
    const rows = (await sql().query('SELECT faculty_id, data, updated_at FROM faculty_photos')).rows
    state.facultyPhotos = Object.fromEntries(rows.map((r: any) => [r.faculty_id, { data: r.data, at: new Date(r.updated_at).toISOString() }]))
    state.sessions = []
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(state))
    console.log(`Done: ${FILE} now holds the online data (version ${snap!.version}).`)
  } else {
    die('Use one of:  check | push --yes | pull --yes')
  }
} catch (err: any) {
  die(`Could not reach the online database: ${err?.message ?? err}`)
} finally {
  await sql().end().catch(() => {})
}
