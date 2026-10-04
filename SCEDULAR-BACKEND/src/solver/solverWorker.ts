/**
 * Runs one timetable generation on a COPY of the data inside a worker thread, so the web server keeps answering other
 * requests while the (CPU-heavy) search runs. It reports back the result and the new run records; the server applies them.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { installState, useStorageDriver, getLocalDb } from '../db/localDb.js'
import { generateTimetable } from './pipeline.js'

useStorageDriver({ markDirty() { /* the copy is never written anywhere */ } })
installState(workerData.state)

generateTimetable(workerData.scope).then(result => {
  const db = getLocalDb()
  parentPort!.postMessage({ ok: true, result, delta: { generationRuns: db.generationRuns, assignments: db.assignments, conflicts: db.conflicts, unscheduled: db.unscheduled, nextRunId: db.nextRunId } })
}, err => parentPort!.postMessage({ ok: false, message: String(err?.message ?? err) }))
