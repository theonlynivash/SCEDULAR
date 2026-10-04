/**
 * Where the department's data is stored.
 *
 *  - file      (default, and whenever DATABASE_URL is empty): one JSON file, `data/scedular_local_db.json`.
 *  - postgres  (DATABASE_URL set): the SAME data as one JSON document in a table called `app_state`, plus profile pictures in
 *              `faculty_photos`. The application logic is identical in both modes (it works on the in-memory copy of the
 *              document), so everything tested locally behaves the same in the cloud.
 *
 * Several serverless instances may run at once, so the document carries a version number. Before each request an instance
 * checks the version and reloads if another instance changed the data; a save only succeeds if nobody saved in between
 * ("compare and swap"). A losing save is reported to the user as a conflict and never overwrites the newer data.
 */
import pg from 'pg'

export const storageMode: 'file' | 'postgres' = process.env.USE_LOCAL_DB === 'true' || !process.env.DATABASE_URL ? 'file' : 'postgres'

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
