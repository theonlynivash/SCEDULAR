/**
 * Compatibility layer for the data-access code in repo.ts.
 *
 * repo.ts was written to try SQL tables first and fall back to the in-memory document. The application now ALWAYS works on
 * the document (see storage.ts for how it is persisted: a JSON file, or one JSON row in PostgreSQL), so the SQL branches are
 * switched off: `pool` rejects every query and repo.ts uses the document. Nothing here talks to the database any more.
 */
import { ensureReady } from './sync.js'

export const isLocalDbMode = true

export const pool = {
  query: async () => { throw new Error('document mode') },
  connect: async () => { throw new Error('document mode') },
} as unknown as import('pg').Pool

export const ensureInitialized = ensureReady
