import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultScheduleConfig } from '../utils/grid.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.SCEDULAR_DB_PATH ?? path.join(dataDir, 'scedular.sqlite')
export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

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
