import { describe, it, expect } from 'vitest'
import { getLocalDb, runAtomic } from '../src/db/localDb.js'

describe('multi-step changes are all-or-nothing', () => {
  it('undoes everything when a step fails half-way, and keeps it when all steps succeed', async () => {
    const db = getLocalDb()
    const subjects = db.subjects.length, faculty = db.faculty.length
    await expect(runAtomic(async () => {
      db.subjects.push({ id: 'X1', code: 'X1', name: 'half done' } as any)
      db.faculty.splice(0, 3)
      throw new Error('boom in step 3')
    })).rejects.toThrow('boom in step 3')
    expect(getLocalDb().subjects).toHaveLength(subjects)           // nothing from the failed attempt remains
    expect(getLocalDb().faculty).toHaveLength(faculty)
    expect(getLocalDb()).toBe(db)                                  // and everyone still holds the same live object

    await runAtomic(async () => { getLocalDb().subjects.push({ id: 'X2', code: 'X2', name: 'finished' } as any) })
    expect(getLocalDb().subjects).toHaveLength(subjects + 1)
    getLocalDb().subjects.pop()
  })
})
