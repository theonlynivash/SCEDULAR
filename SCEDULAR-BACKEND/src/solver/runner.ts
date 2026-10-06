import { Worker } from 'node:worker_threads'
import { getLocalDb } from '../db/localDb.js'
import { saveLocalDb } from '../db/localDb.js'
import { generateTimetable, type GenerationScope } from './pipeline.js'

/**
 * Generate a timetable without freezing the server: the search runs in a worker thread on a copy of the data and the result
 * is applied here. Only one generation runs at a time. Falls back to running in-process when a worker is not possible
 * (tests, SOLVER_INLINE=true, or a host that cannot start one).
 */
let running = false
export class GenerationBusyError extends Error { constructor() { super('A timetable is already being generated. Wait for it to finish.'); this.name = 'GenerationBusyError' } }

type Result = Awaited<ReturnType<typeof generateTimetable>>

export async function generateInBackground(scope?: GenerationScope | GenerationScope[]): Promise<Result> {
  if (running) throw new GenerationBusyError()
  running = true
  try {
    if (process.env.SOLVER_INLINE === 'true' || process.env.VITEST || process.env.VERCEL) return await generateTimetable(scope)
    let worker: Worker
    try { worker = new Worker(new URL(import.meta.url.endsWith('.ts') ? './solverWorker.ts' : './solverWorker.js', import.meta.url), { workerData: { state: getLocalDb(), scope } }) }
    catch (err) { console.warn('[solver] could not start a worker, running in-process:', (err as Error).message); return await generateTimetable(scope) }
    return await new Promise<Result>((resolve, reject) => {
      worker.once('message', (m: any) => {
        if (!m.ok) return reject(new Error(m.message))
        const db = getLocalDb()
        Object.assign(db, m.delta)          // the new run, its placements, conflicts and unscheduled items
        saveLocalDb()
        resolve(m.result)
      })
      worker.once('error', reject)
      worker.once('exit', code => { if (code !== 0) reject(new Error(`The timetable worker stopped unexpectedly (code ${code}).`)) })
    })
  } finally { running = false }
}
