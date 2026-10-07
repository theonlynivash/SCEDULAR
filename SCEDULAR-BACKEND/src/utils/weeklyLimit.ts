/**
 * One weekly limit for the department (periods a teacher may carry per week), kept in two places that must agree:
 * the policy setting (staffing maths, the Assign Teachers board) and every teacher's own limit (the timetable solver).
 * Setting it here writes both; a single teacher can still be changed afterwards on the Teachers page.
 */
import { getAllocationSettings, listFaculty, listSectionSubjects, listTeachingAssignments, saveAllocationSettings, upsertFaculty } from '../db/repo.js'
import { saveLocalDb } from '../db/localDb.js'

export const MAX_WEEKLY_LIMIT = 40

export interface WeeklyLimitResult { limit: number; teachers: number; changed: number; over: { facultyId: string; name: string; load: number }[] }

export async function applyWeeklyLimit(limit: number, opts: { savePolicy?: boolean } = {}): Promise<WeeklyLimitResult> {
  const teachers = (await listFaculty()).filter(f => f.role !== 'HOD')
  let changed = 0
  for (const f of teachers) if (f.maxWeeklyPeriods !== limit) { await upsertFaculty({ ...f, maxWeeklyPeriods: limit }); changed++ }
  if (opts.savePolicy !== false) {
    const cfg = await getAllocationSettings()
    if (cfg.maxWeeklyPeriods !== limit) await saveAllocationSettings({ ...cfg, maxWeeklyPeriods: limit })
  }
  // teachers who already carry more than the new limit: the HOD has to move a section off them before generating
  const [offerings, assignments] = await Promise.all([listSectionSubjects(), listTeachingAssignments()])
  const off = new Map(offerings.map(o => [o.id, o]))
  const load = new Map<string, number>()
  for (const t of assignments) { const o = off.get(t.sectionSubjectId); if (o) load.set(t.facultyId, (load.get(t.facultyId) ?? 0) + (t.component === 'LAB' ? o.labPeriods : o.theoryPeriods)) }
  const over = teachers.filter(f => (load.get(f.id) ?? 0) > limit).map(f => ({ facultyId: f.id, name: f.name, load: load.get(f.id)! })).sort((a, b) => b.load - a.load)
  saveLocalDb()
  return { limit, teachers: teachers.length, changed, over }
}
