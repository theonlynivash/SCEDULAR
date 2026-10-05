/**
 * Where the department's data is stored.
 *
 *  - file      (default for localhost / dev): one JSON file, `data/scedular_local_db.json`.
 *  - postgres  (when deployed with DATABASE_URL set, e.g. on Vercel/Neon): the SAME data as one JSON document
 *              in a table called `app_state`, plus profile pictures in `faculty_photos`.
 *              The application logic is identical in both modes (it works on the in-memory copy of the
 *              document), so everything tested locally behaves the same in the cloud.
 *
 * Auto-detection rules (in priority order):
 *   1. USE_LOCAL_DB=true  → force file mode (local JSON)
 *   2. Running on Vercel  → use postgres mode IF DATABASE_URL is present, otherwise file (warning emitted)
 *   3. NODE_ENV=production + DATABASE_URL set  → postgres mode
 *   4. Otherwise (localhost/dev) → always file mode, even if DATABASE_URL is set locally
 *
 * Several serverless instances may run at once, so the document carries a version number. Before each request an instance
 * checks the version and reloads if another instance changed the data; a save only succeeds if nobody saved in between
 * ("compare and swap"). A losing save is reported to the user as a conflict and never overwrites the newer data.
 */
import pg from 'pg'

function detectStorageMode(): 'file' | 'postgres' {
  // 1. Explicit local override — always wins (useful for testing postgres locally)
  if (process.env.USE_LOCAL_DB === 'true') return 'file'

  const hasDbUrl = !!process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim() !== ''

  // 2. Explicit postgres opt-in (for testing postgres on localhost)
  if (process.env.FORCE_POSTGRES === 'true' && hasDbUrl) return 'postgres'

  // 3. Vercel / cloud-deployed environment detection
  const onVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV || !!process.env.NEXT_PUBLIC_VERCEL_URL
  const onRender = !!process.env.RENDER
  const onRailway = !!process.env.RAILWAY_ENVIRONMENT
  const onFly = !!process.env.FLY_APP_NAME
  const isHosted = onVercel || onRender || onRailway || onFly

  if (isHosted) {
    if (hasDbUrl) return 'postgres'
    console.warn('[DB] Deployed environment detected but DATABASE_URL is not set — falling back to ephemeral file mode (data will NOT persist between requests/deploys).')
    return 'file'
  }

  // 4. Production NODE_ENV + explicit DATABASE_URL → postgres (self-hosted)
  if (process.env.NODE_ENV === 'production' && hasDbUrl) return 'postgres'

  // 5. Default (localhost / dev) → always local JSON file.
  //    This ensures your local DB is used even if you accidentally set DATABASE_URL in your local .env.
  if (hasDbUrl && process.env.NODE_ENV !== 'production') {
    console.log('[DB] Local environment detected — using local JSON file (data/scedular_local_db.json) even though DATABASE_URL is set. Set FORCE_POSTGRES=true to test PostgreSQL locally.')
  }
  return 'file'
}

export const storageMode: 'file' | 'postgres' = detectStorageMode()

export class ConflictError extends Error {
  constructor() { super('Someone else saved changes at the same moment. Your change was not saved; please try again.'); this.name = 'ConflictError' }
}

let pool: pg.Pool | null = null
export function sql(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!
    const ssl = /sslmode=require/.test(url) || /neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined
    pool = new pg.Pool({ connectionString: url, ssl, max: Number(process.env.PG_POOL_MAX) || 3 })
  }
  return pool
}

const TABLES: Record<string, string> = {
  app_state: `CREATE TABLE app_state (
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  faculty_photos: `CREATE TABLE faculty_photos (
    faculty_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
}

/** Creates the two tables when they are missing (safe to call on every cold start, from several instances at once). */
export async function initStorage(): Promise<void> {
  for (const [name, ddl] of Object.entries(TABLES)) {
    const have = await sql().query("SELECT 1 FROM information_schema.tables WHERE table_name = $1", [name])
    if (have.rows.length) continue
    try { await sql().query(ddl) } catch (err: any) { if (err?.code !== '42P07') throw err }   // 42P07: another instance created it first
  }
}

export async function readVersion(): Promise<number | null> {
  const { rows } = await sql().query('SELECT version FROM app_state WHERE id = 1')
  return rows[0] ? Number(rows[0].version) : null
}

export async function loadSnapshot(): Promise<{ version: number; state: any } | null> {
  const { rows } = await sql().query('SELECT version, state FROM app_state WHERE id = 1')
  return rows[0] ? { version: Number(rows[0].version), state: typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state } : null
}

/** Write the document. `expected === null` means "create it"; otherwise it must still be at that version. */
export async function saveSnapshot(state: unknown, expected: number | null): Promise<number> {
  const json = JSON.stringify(state)
  if (expected === null) {
    const r = await sql().query('INSERT INTO app_state (id, version, state) VALUES (1, 1, $1) ON CONFLICT (id) DO NOTHING RETURNING version', [json])
    if (!r.rows[0]) throw new ConflictError()
    return Number(r.rows[0].version)
  }
  const r = await sql().query('UPDATE app_state SET state = $1, version = version + 1, updated_at = now() WHERE id = 1 AND version = $2 RETURNING version', [json, expected])
  if (!r.rows[0]) throw new ConflictError()
  return Number(r.rows[0].version)
}
