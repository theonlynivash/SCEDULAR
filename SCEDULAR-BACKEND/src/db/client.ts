/**
 * Compatibility layer for the data-access code in repo.ts.
 *
 * repo.ts was written to try SQL tables first and fall back to the in-memory document.
 * The application now ALWAYS works on the in-memory document (see storage.ts for how it
 * is persisted: a JSON file on localhost, or one JSON row in PostgreSQL when hosted).
 * The legacy SQL-table branches are switched off: `pool` rejects every query, and repo.ts
 * transparently falls back to the in-memory document. Nothing here talks to real SQL tables.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * DATABASE MODE (auto-detected in storage.ts — see detectStorageMode there):
 *   file      → localhost / dev → data/scedular_local_db.json (never touches Postgres)
 *   postgres  → hosted (Vercel/Neon etc.) → app_state JSONB + faculty_photos table
 * ══════════════════════════════════════════════════════════════════════════════
 */
import { ensureReady } from './sync.js'
import { storageMode } from './storage.js'

/**
 * True when we are running with the local JSON file backend.
 * False when we are persisting to PostgreSQL (hosted mode).
 * This controls whether repo.ts catch-blocks silently swallow `pool` errors —
 * in postgres mode a real error from sql() (storage.ts) must still propagate.
 */
export const isLocalDbMode: boolean = storageMode === 'file'

export const pool = {
  query: async () => { throw new Error('document mode') },
  connect: async () => { throw new Error('document mode') },
} as unknown as import('pg').Pool

export const ensureInitialized = ensureReady
