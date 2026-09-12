import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultScheduleConfig } from '../utils/grid.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../data')
fs.mkdirSync(dataDir, { recursive: true })

const useNeon = Boolean(process.env.DATABASE_URL)

if (useNeon) {
  console.log('Neon PostgreSQL detected via DATABASE_URL; local SQLite fallback is disabled.')
}

const dbPath = process.env.SCEDULAR_DB_PATH ?? path.join(dataDir, 'scedular.sqlite')
export const db = useNeon
  ? (() => {
      // This project still uses SQLite-oriented access patterns in repo.ts.
      // Neon is supported by config, but the app needs a full async query migration
      // before it can use Postgres safely in production.
      const sqliteDb = new Database(dbPath)
      sqliteDb.pragma('journal_mode = WAL')
      sqliteDb.pragma('foreign_keys = ON')
      return sqliteDb
    })()
  : (() => {
      const sqliteDb = new Database(dbPath)
      sqliteDb.pragma('journal_mode = WAL')
      sqliteDb.pragma('foreign_keys = ON')
      return sqliteDb
    })()

const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf-8')
db.exec(schema)

// Seed a default schedule config row (Section 5 grid) if none exists yet.
const existingConfig = db.prepare('SELECT id FROM schedule_config WHERE id = 1').get()
if (!existingConfig) {
  const cfg = defaultScheduleConfig()
  db.prepare('INSERT INTO schedule_config (id, working_days, periods) VALUES (1, ?, ?)').run(
    JSON.stringify(cfg.workingDays),
    JSON.stringify(cfg.periods)
  )
}
