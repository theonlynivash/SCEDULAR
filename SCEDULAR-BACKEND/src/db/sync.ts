import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { initLocalDb, getLocalDb, installState, newDefaultState, useStorageDriver } from './localDb.js'
import { ConflictError, initStorage, loadSnapshot, readVersion, saveSnapshot, storageInfo, storageMode } from './storage.js'

/**
 * Keeps the in-memory copy of the data and the store in step (see storage.ts).
 *  file mode     : nothing to do per request (the file is written as changes happen).
 *  postgres mode : before a request, reload if another instance saved; before the response goes out, save if this
 *                  request changed anything - and answer 409 (nothing overwritten) if someone else saved first.
 */
/** The deployment is set up wrongly (for example no DATABASE_URL on Vercel): reported as 503 with a message the owner can act on. */
export class StorageConfigError extends Error { status = 503; constructor(m: string) { super(m); this.name = 'StorageConfigError' } }

let ready: Promise<void> | null = null
let version: number | null = null
let dirty = false
let saving: Promise<void> | null = null

export function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      if (storageInfo.problem) throw new StorageConfigError(storageInfo.problem)
      if (storageMode === 'file') { initLocalDb(); console.log(`[DB] File mode (${storageInfo.reason}): data/scedular_local_db.json`); return }
      await initStorage()
      const snap = await loadSnapshot()
      if (snap) { installState({ ...getBlank(), ...snap.state }); version = snap.version }
      else {
        installState(newDefaultState())
        version = await saveSnapshot(getLocalDb(), null)
        console.log('[DB] PostgreSQL mode: created the department data (sample or blank)')
      }
      useStorageDriver({ markDirty: () => { dirty = true } })
      console.log(`[DB] PostgreSQL mode (${storageInfo.reason}): loaded version ${version}`)
    })().catch(err => { ready = null; console.error('[DB] initialisation failed:', err?.message ?? err); throw err })
  }
  return ready
}
const getBlank = () => ({}) as any

async function reloadLatest() {
  const snap = await loadSnapshot()
  if (snap) { installState({ ...snap.state }); version = snap.version }
  dirty = false
}

async function refresh() {
  if (storageMode !== 'postgres' || dirty) return
  const v = await readVersion()
  if (v !== null && v !== version) await reloadLatest()
}

/** Write pending changes. A concurrent writer wins: we reload its data and report the conflict. */
export async function flush(): Promise<void> {
  if (storageMode !== 'postgres' || !dirty) return
  if (saving) await saving
  if (!dirty) return
  saving = (async () => {
    try {
      dirty = false
      version = await saveSnapshot(getLocalDb(), version)
    } catch (err) {
      await reloadLatest().catch(() => {})
      throw err
    } finally { saving = null }
  })()
  return saving
}

export const storeMiddleware: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/health') return next()
  try {
    await ensureReady()
    await refresh()
  } catch (err) { return next(err) }
  if (storageMode === 'postgres') {
    const end = res.end
    ;(res as any).end = function patched(this: Response, ...args: any[]) {
      res.end = end
      const done = () => (end as any).apply(this, args)
      if (!dirty) return done()
      flush().then(done, (err: any) => {
        res.statusCode = err instanceof ConflictError ? 409 : 500
        res.removeHeader('Content-Length')
        res.setHeader('Content-Type', 'application/json')
        const body = err instanceof ConflictError ? { error: 'CONFLICT', message: err.message } : { error: 'SAVE_FAILED', message: 'Your change could not be saved. Please try again.' }
        if (!(err instanceof ConflictError)) console.error('[DB] save failed:', err?.message ?? err)
        ;(end as any).call(this, JSON.stringify(body))
      })
      return this
    }
  }
  next()
}
