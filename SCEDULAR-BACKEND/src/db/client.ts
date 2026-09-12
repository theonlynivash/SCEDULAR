import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultScheduleConfig } from '../utils/grid.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Point it at your Postgres/Neon connection string (see .env.example).'
  )
}

// Neon (and most managed Postgres) requires TLS; local Postgres/Docker
// usually doesn't offer it, so only force it when the connection string
// doesn't already opt out and isn't obviously local.
const needsSsl = /sslmode=require/.test(connectionString) || /neon\.tech/.test(connectionString)

export const pool = new pg.Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX) || 5,
})

// Serverless functions cold-start often; guard so the schema (idempotent
// CREATE TABLE IF NOT EXISTS) and the default schedule-grid row are only
// applied once per warm process, not on every request.
let initPromise: Promise<void> | null = null

export function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf-8')
      await pool.query(schema)

      const existing = await pool.query('SELECT id FROM schedule_config WHERE id = 1')
      if (existing.rows.length === 0) {
        const cfg = defaultScheduleConfig()
        await pool.query(
          'INSERT INTO schedule_config (id, working_days, periods) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING',
          [JSON.stringify(cfg.workingDays), JSON.stringify(cfg.periods)]
        )
      }
    })()
  }
  return initPromise
}
