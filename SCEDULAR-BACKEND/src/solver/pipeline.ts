import type { Assignment, GenerationResult } from '../types.js'
import {
  createRun,
  getAllLabsBySubject,
  getAllLabsBySectionSubject,
  getScheduleConfig,
  listFaculty,
  listFacultyUnavailability,
  listLabs,
  listSectionSubjects,
  listSections,
  listSubjects,
  listTeachingAssignments,
  saveAssignments,
  saveConflicts,
  saveUnscheduled,
} from '../db/repo.js'
import { preValidate } from './preValidate.js'
import { expandRequirements } from './expand.js'
import { solve, diagnoseUnscheduled } from './csp.js'
import { independentValidate } from './validator.js'

// Canonical generation pipeline. The legacy Course/Requirement tables are no
// longer the source of scheduling truth. Solver and validator consume the
// canonical section-subject, teaching-assignment and lab-resource model.
//
// An optional `scope` restricts generation to exactly one (year, semester) --
// e.g. so a HOD can generate Year 2 / Semester III on its own once it's
// genuinely ready, without waiting for every other semester in the
// department to also be fully configured. Faculty, labs and schedule config
// remain department-wide reference data and are never filtered; only the
// REQUIRED data (which sections/section-subjects/teaching-assignments must
// be fully staffed) is scoped down.
type groupAssignments = import('../types.js').Assignment[]
type groupUnscheduled = import('../types.js').SchedulableUnit[]
export type GenerationScope = { year: string; semester: string }

/** Label for reports: one scope reads "Year 3 / V"; several read "Year 2, Year 3 / III, V". */
function scopeLabel(scopes: GenerationScope[] | undefined, sections: { year: string | null; semester: string | null }[]): { year: string; semester: string } {
  const src = scopes?.length ? scopes : sections.map(s => ({ year: s.year ?? '', semester: s.semester ?? '' }))
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]
  return { year: uniq(src.map(x => x.year)).join(', ') || 'Year 2', semester: uniq(src.map(x => x.semester)).join(', ') || 'III' }
}

// `scope` may be one (year, semester) or several. Several are solved TOGETHER in one run, so a teacher who
// teaches in more than one year can never be double-booked across them.
export async function generateTimetable(scopeArg?: GenerationScope | GenerationScope[]): Promise<GenerationResult> {
  const scopes = scopeArg ? (Array.isArray(scopeArg) ? scopeArg : [scopeArg]) : undefined
  const scope = scopes && scopes.length > 0 ? scopes : undefined
  const [faculty, allSections, subjects, allSectionSubjects, allTeachingAssignments, unavailability, config, labs, labsBySubject, labsBySectionSubject] =
    await Promise.all([
      listFaculty(),
      listSections(),
      listSubjects(),
      listSectionSubjects(),
      listTeachingAssignments(),
      listFacultyUnavailability(),
      getScheduleConfig(),
      listLabs(),
      getAllLabsBySubject(),
      getAllLabsBySectionSubject(),
    ])

  const sections = scope ? allSections.filter(s => scope.some(sc => s.year === sc.year && s.semester === sc.semester)) : allSections
  const scopedSectionIds = new Set(sections.map(s => s.id))
  const scopedSS = scope ? allSectionSubjects.filter(ss => scopedSectionIds.has(ss.sectionId)) : allSectionSubjects
  const scopedSSIds = new Set(scopedSS.map(ss => ss.id))
  const scopedTA = scope ? allTeachingAssignments.filter(ta => scopedSSIds.has(ta.sectionSubjectId)) : allTeachingAssignments

  // The Library period is not solved with the rest: it goes into the one free slot a section has left (as on the
  // department's printed timetables), once everything else is placed. Keeping it out keeps the solve small.
  const subjectOf = new Map(subjects.map(s => [s.id, s]))
  const isFloating = (ssSubjectId: string) => (subjectOf.get(ssSubjectId)?.shortName ?? '').toUpperCase() === 'LIB'
  const floatingOfferings = scopedSS.filter(ss => isFloating(ss.subjectId))
  const sectionSubjects = scopedSS.filter(ss => !isFloating(ss.subjectId))
  const solveSSIds = new Set(sectionSubjects.map(ss => ss.id))
  const teachingAssignments = scopedTA.filter(ta => solveSSIds.has(ta.sectionSubjectId))
  const floatingTA = scopedTA.filter(ta => !solveSSIds.has(ta.sectionSubjectId))

  const preConflicts = preValidate({
    faculty,
    sections,
    subjects,
    sectionSubjects,
    teachingAssignments,
    unavailability,
    config,
    labsBySubject,
    labsBySectionSubject,
  })
  if (preConflicts.length > 0) return persistFailure(preConflicts, scope)

  const subjectMap = new Map(subjects.map(s => [s.id, s]))
  const facultyMap = new Map(faculty.map(f => [f.id, f]))
  const labCapacityById = new Map(labs.map(l => [l.id, l.capacity ?? 1]))

  // Solve one (year, semester) at a time, hardest first, and carry each result forward as "already booked" for the
  // next. Teachers and lab rooms are shared across years, so later semesters can never double-book them, and each
  // solve stays small and fast (a single joint solve of every year takes minutes).
  const groups = (scope ?? [{ year: '', semester: '' }]).map(sc => {
    const secIds = new Set(sections.filter(s => !scope || (s.year === sc.year && s.semester === sc.semester)).map(s => s.id))
    const ss = sectionSubjects.filter(x => secIds.has(x.sectionId))
    const ssIds = new Set(ss.map(x => x.id))
    const ta = teachingAssignments.filter(t => ssIds.has(t.sectionSubjectId))
    const units = expandRequirements({ sectionSubjects: ss, subjects: subjectMap, teachingAssignments: ta, faculty: facultyMap, labsBySubject, labsBySectionSubject })
    // fullness of an average section's week: the fuller the week, the less slack, so solve it first
    const fullness = secIds.size ? units.reduce((n, u) => n + u.length, 0) / secIds.size : 0
    return { units, fullness }
  }).sort((a, b) => b.fullness - a.fullness)

  const units = groups.flatMap(g => g.units)
  const validateAll = (assignments: groupAssignments) => independentValidate({
    assignments, sections, subjects, sectionSubjects, teachingAssignments, faculty, unavailability, labs, config, labsBySubject, labsBySectionSubject,
  })
  const runOrder = (order: { units: typeof units }[], budget?: number) => {
    const placed: groupAssignments = []
    const left: groupUnscheduled = []
    let over = false
    for (const g of order) {
      const r = solve(g.units, faculty, unavailability, config, labsBySubject, labsBySectionSubject, labCapacityById, placed, budget)
      placed.push(...r.assignments)
      left.push(...r.unscheduled)
      over = over || r.budgetExceeded
    }
    return { assignments: placed, unscheduled: left, budgetExceeded: over }
  }

  // Generation strategy, fast to slow:
  //  1) semester by semester (fullest week first, then reverse), each under a small step budget;
  //  2) if that leaves clashes between semesters (teachers and lab rooms are shared), repair locally: re-solve only
  //     the sections involved plus the sections that share their teachers, against everything else fixed;
  //  3) last resort: one joint solve of everything (always searches all combinations, but can take minutes).
  const labCap = (id: string) => labCapacityById.get(id) ?? 1
  const problemSections = (placed: groupAssignments, left: groupUnscheduled): Set<string> => {
    const bad = new Set<string>(left.map(u => u.sectionId))
    for (const c of validateAll(placed)) if (c.sectionId) bad.add(c.sectionId)
    const teacherSlot = new Map<string, string[]>(), labSlot = new Map<string, string[]>()
    for (const a of placed) for (let p = a.startPeriod; p <= a.endPeriod; p++) {
      const k = `${a.facultyId}|${a.day}|${p}`
      teacherSlot.set(k, [...(teacherSlot.get(k) ?? []), a.sectionId])
      if (a.labId) { const lk = `${a.labId}|${a.day}|${p}`; labSlot.set(lk, [...(labSlot.get(lk) ?? []), a.sectionId]) }
    }
    for (const secs of teacherSlot.values()) if (new Set(secs).size > 1) secs.forEach(x => bad.add(x))
    for (const [k, secs] of labSlot) if (secs.length > labCap(k.split('|')[0])) secs.forEach(x => bad.add(x))
    return bad
  }
  const sectionTeachers = new Map<string, Set<string>>()
  for (const ta of teachingAssignments) {
    const ss = sectionSubjects.find(x => x.id === ta.sectionSubjectId)
    if (!ss) continue
    const set = sectionTeachers.get(ss.sectionId) ?? new Set<string>()
    set.add(ta.facultyId)
    sectionTeachers.set(ss.sectionId, set)
  }
  const widen = (secs: Set<string>): Set<string> => {
    const teachers = new Set<string>()
    for (const sid of secs) for (const t of sectionTeachers.get(sid) ?? []) teachers.add(t)
    const out = new Set(secs)
    for (const [sid, ts] of sectionTeachers) if ([...ts].some(t => teachers.has(t))) out.add(sid)
    return out
  }
  const quality = (placed: groupAssignments, left: groupUnscheduled) => validateAll(placed).length + left.length

  let result: ReturnType<typeof runOrder> | null = null
  if (groups.length > 1) {
    let best: ReturnType<typeof runOrder> | null = null
    for (const order of [groups, [...groups].reverse()]) {
      const r = runOrder(order, 15000)
      if (!r.budgetExceeded && r.unscheduled.length === 0 && validateAll(r.assignments).length === 0) { best = r; result = r; break }
      if (!best || quality(r.assignments, r.unscheduled) < quality(best.assignments, best.unscheduled)) best = r
    }
    if (!result && best) {
      let cur = best
      let radius = 0
      for (let iter = 0; iter < 10 && !result; iter++) {
        let hood = problemSections(cur.assignments, cur.unscheduled)
        if (hood.size === 0) break
        for (let i = 0; i < radius; i++) hood = widen(hood)
        const fixed = cur.assignments.filter(a => !hood.has(a.sectionId))
        const r = solve(units.filter(u => hood.has(u.sectionId)), faculty, unavailability, config, labsBySubject, labsBySectionSubject, labCapacityById, fixed, 25000)
        const next = { assignments: [...fixed, ...r.assignments], unscheduled: r.unscheduled, budgetExceeded: r.budgetExceeded }
        if (!next.budgetExceeded && next.unscheduled.length === 0 && validateAll(next.assignments).length === 0) { result = next; break }
        if (quality(next.assignments, next.unscheduled) <= quality(cur.assignments, cur.unscheduled)) cur = next
        radius = Math.min(radius + 1, 3)
      }
    }
  }
  if (!result) result = runOrder([{ units }])
  const { assignments, unscheduled, budgetExceeded } = result
  const conflicts = [] as GenerationResult['conflicts']
  const warnings: string[] = []
  if (budgetExceeded) warnings.push('Solver search budget was exhausted; no complete timetable was proven within the search budget.')
  if (unscheduled.length > 0) conflicts.push(...diagnoseUnscheduled(unscheduled, faculty, unavailability, units, labsBySubject, labsBySectionSubject))

  const postConflicts = independentValidate({
    assignments,
    sections,
    subjects,
    sectionSubjects,
    teachingAssignments,
    faculty,
    unavailability,
    labs,
    config,
    labsBySubject,
    labsBySectionSubject,
  })
  conflicts.push(...postConflicts)

  if (conflicts.length === 0 && floatingOfferings.length > 0) {
    const facultyById = new Map(faculty.map(f => [f.id, f]))
    const periodsList = config.periods.filter(p => p.schedulable !== false).map(p => p.index)
    const unavailable = new Set(unavailability.map(u => `${u.facultyId}|${u.day}|${u.period}`))
    const libraryRows: groupAssignments = []        // Library placements, kept apart from the solved timetable
    const all = () => [...assignments, ...libraryRows]
    const busy = (skip?: Assignment) => {
      const sec = new Set<string>(), fac = new Set<string>(), weekly = new Map<string, number>(), daily = new Map<string, number>()
      for (const a of all()) {
        if (a === skip) continue
        for (let p = a.startPeriod; p <= a.endPeriod; p++) {
          sec.add(`${a.sectionId}|${a.day}|${p}`); fac.add(`${a.facultyId}|${a.day}|${p}`)
          weekly.set(a.facultyId, (weekly.get(a.facultyId) ?? 0) + 1); daily.set(`${a.facultyId}|${a.day}`, (daily.get(`${a.facultyId}|${a.day}`) ?? 0) + 1)
        }
      }
      return { sec, fac, weekly, daily }
    }
    const teacherOk = (b: ReturnType<typeof busy>, fid: string, day: string, p: number) => {
      const f = facultyById.get(fid)
      return !!f && !b.fac.has(`${fid}|${day}|${p}`) && !unavailable.has(`${fid}|${day}|${p}`) &&
        (b.weekly.get(fid) ?? 0) + 1 <= f.maxWeeklyPeriods && (b.daily.get(`${fid}|${day}`) ?? 0) + 1 <= f.maxDailyPeriods
    }
    const libRow = (off: (typeof floatingOfferings)[number], fid: string, day: string, p: number): Assignment =>
      ({ day, startPeriod: p, endPeriod: p, sectionId: off.sectionId, courseId: off.subjectId, subjectId: off.subjectId, sectionSubjectId: off.id, facultyId: fid, blockType: 'THEORY', batch: null })

    for (const off of floatingOfferings) {
      const ta = floatingTA.find(t => t.sectionSubjectId === off.id)
      if (!ta || !facultyById.get(ta.facultyId)) { warnings.push(`Library for ${off.sectionId} has no teacher, so it was left out.`); continue }
      const fid = ta.facultyId
      const slots = config.workingDays.flatMap(d => periodsList.map(p => [d, p] as const))
      let b = busy()
      // 1) a slot that is free for both the section and the Library teacher
      const direct = slots.find(([d, p]) => !b.sec.has(`${off.sectionId}|${d}|${p}`) && teacherOk(b, fid, d, p))
      if (direct) { libraryRows.push(libRow(off, fid, direct[0], direct[1])); continue }

      // 2) swap: move one ordinary period of this section into its free slot, and put Library where it was
      const free = slots.filter(([d, p]) => !b.sec.has(`${off.sectionId}|${d}|${p}`))
      let done = false
      for (const A of assignments.filter(x => x.sectionId === off.sectionId && x.blockType === 'THEORY' && x.startPeriod === x.endPeriod)) {
        if (done) break
        const bNo = busy(A)
        if (!teacherOk(bNo, fid, A.day, A.startPeriod)) continue
        for (const [fd, fp] of free) {
          if (!teacherOk(bNo, A.facultyId, fd, fp)) continue
          const from = { day: A.day, p: A.startPeriod }
          A.day = fd; A.startPeriod = fp; A.endPeriod = fp
          if (validateAll(assignments).length === 0) { libraryRows.push(libRow(off, fid, from.day, from.p)); done = true; break }
          A.day = from.day; A.startPeriod = from.p; A.endPeriod = from.p     // not allowed there: put it back
        }
      }
      if (!done) warnings.push(`Library could not be fitted into ${off.sectionId} without breaking another rule, so it was left out.`)
    }
    assignments.push(...libraryRows)
  }

  const status: GenerationResult['status'] = conflicts.length > 0 ? 'RED' : 'GREEN'
  const runId = await createRun(status, warnings)
  if (status === 'GREEN') await saveAssignments(runId, assignments)
  if (conflicts.length > 0) await saveConflicts(runId, conflicts)
  if (unscheduled.length > 0) await saveUnscheduled(runId, unscheduled)

  let infeasibilityReport: GenerationResult['infeasibilityReport'] = undefined
  if (conflicts.length > 0 || unscheduled.length > 0) {
    const reportItems = conflicts.map(c => ({
      sectionId: c.sectionId,
      subjectId: c.courseId,
      component: c.type.includes('LAB') ? 'LAB' : 'THEORY',
      facultyId: c.facultyId,
      violatedConstraint: c.type,
      severity: (c.type === 'INVALID_INPUT' ? 'CRITICAL' : 'HIGH') as 'CRITICAL' | 'HIGH' | 'WARNING',
      explanation: c.message,
      suggestedInputArea: c.type.includes('FACULTY')
        ? 'Faculty Workload / Requested Capacity'
        : c.type.includes('LAB')
        ? 'Physical Lab Resource Mapping'
        : 'Section Offering & Schedule Configuration',
    }))

    infeasibilityReport = {
      generationRunId: runId,
      academicYear: '2026-27',
      ...scopeLabel(scope, sections),
      items: reportItems,
      summary: `Generation incomplete: ${conflicts.length} conflict(s) and ${unscheduled.length} unscheduled unit(s) detected.`,
    }
  }

  return { status, runId, assignments: status === 'GREEN' ? assignments : [], unscheduled, conflicts, warnings, infeasibilityReport, generatedAt: new Date().toISOString() }
}

async function persistFailure(conflicts: GenerationResult['conflicts'], scope?: GenerationScope[]): Promise<GenerationResult> {
  const runId = await createRun('RED', [])
  await saveConflicts(runId, conflicts)
  const reportItems = conflicts.map(c => ({
    sectionId: c.sectionId,
    subjectId: c.courseId,
    component: c.type.includes('LAB') ? 'LAB' : 'THEORY',
    facultyId: c.facultyId,
    violatedConstraint: c.type,
    severity: 'CRITICAL' as const,
    explanation: c.message,
    suggestedInputArea: c.type.includes('FACULTY')
      ? 'Faculty Workload / Requested Capacity'
      : c.type.includes('LAB')
      ? 'Physical Lab Resource Mapping'
      : 'Section Offering & Schedule Configuration',
  }))

  return {
    status: 'RED',
    runId,
    assignments: [],
    unscheduled: [],
    conflicts,
    warnings: [],
    infeasibilityReport: {
      generationRunId: runId,
      academicYear: '2026-27',
      ...scopeLabel(scope, []),
      items: reportItems,
      summary: `Generation blocked during pre-validation: ${conflicts.length} error(s) found.`,
    },
    generatedAt: new Date().toISOString(),
  }
}
