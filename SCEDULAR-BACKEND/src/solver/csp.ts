import type { Assignment, Conflict, Faculty, FacultyUnavailability, ScheduleConfig, SchedulableUnit } from '../types.js'
import { contiguousGroups } from '../utils/grid.js'

const MAX_BACKTRACK_STEPS = 2_000_000

interface Candidate {
  day: string
  startPeriod: number
  endPeriod: number
  labId?: string
  score: number
}

interface SolveContext {
  config: ScheduleConfig
  facultyById: Map<string, Faculty>
  facultyUnavailable: Map<string, Set<string>> // facultyId -> set of "day:period"
  sectionBusy: Map<string, Set<string>>
  facultyBusy: Map<string, Set<string>>
  facultyDailyCount: Map<string, number> // `${facultyId}:${day}`
  facultyWeeklyCount: Map<string, number>
  sectionDailyCount: Map<string, number> // `${sectionId}:${day}`
  labBusy: Map<string, Set<string>>
  groups: number[][]
  // Every course's lab options, fetched once by the pipeline before the
  // solve starts -- the backtracking loop below never touches the
  // database, it only reads this in-memory map.
  labsByCourse: Map<string, string[]>
}

function slotKey(day: string, period: number) {
  return `${day}:${period}`
}

function buildContext(
  faculty: Faculty[],
  unavailability: FacultyUnavailability[],
  config: ScheduleConfig,
  labsByCourse: Map<string, string[]>
): SolveContext {
  const facultyUnavailable = new Map<string, Set<string>>()
  for (const u of unavailability) {
    if (!facultyUnavailable.has(u.facultyId)) facultyUnavailable.set(u.facultyId, new Set())
    facultyUnavailable.get(u.facultyId)!.add(slotKey(u.day, u.period))
  }
  return {
    config,
    facultyById: new Map(faculty.map(f => [f.id, f])),
    facultyUnavailable,
    sectionBusy: new Map(),
    facultyBusy: new Map(),
    facultyDailyCount: new Map(),
    facultyWeeklyCount: new Map(),
    sectionDailyCount: new Map(),
    labBusy: new Map(),
    groups: contiguousGroups(config.periods),
    labsByCourse,
  }
}

function getSet(map: Map<string, Set<string>>, key: string): Set<string> {
  let s = map.get(key)
  if (!s) {
    s = new Set()
    map.set(key, s)
  }
  return s
}

function candidateLabsFor(ctx: SolveContext, courseId: string): string[] {
  return ctx.labsByCourse.get(courseId) ?? []
}

// Step 4 + forward-checking domain computation for a single unit.
function getDomain(unit: SchedulableUnit, ctx: SolveContext): Candidate[] {
  const faculty = ctx.facultyById.get(unit.facultyId)
  if (!faculty) return []
  const unavailable = ctx.facultyUnavailable.get(unit.facultyId) ?? new Set<string>()
  const domain: Candidate[] = []
  const weeklyCount = ctx.facultyWeeklyCount.get(unit.facultyId) ?? 0
  if (weeklyCount + unit.length > faculty.maxWeeklyPeriods) return []

  for (const day of ctx.config.workingDays) {
    const dailyKey = `${unit.facultyId}:${day}`
    const dailyCount = ctx.facultyDailyCount.get(dailyKey) ?? 0
    if (dailyCount + unit.length > faculty.maxDailyPeriods) continue

    if (unit.blockType === 'THEORY') {
      for (const p of ctx.config.periods) {
        if (!p.schedulable) continue
        const key = slotKey(day, p.index)
        if (unavailable.has(key)) continue
        if (getSet(ctx.sectionBusy, unit.sectionId).has(key)) continue
        if (getSet(ctx.facultyBusy, unit.facultyId).has(key)) continue
        const sectionDayCount = ctx.sectionDailyCount.get(`${unit.sectionId}:${day}`) ?? 0
        domain.push({
          day,
          startPeriod: p.index,
          endPeriod: p.index,
          score: sectionDayCount * 2 + dailyCount,
        })
      }
    } else {
      const labs = candidateLabsFor(ctx, unit.courseId)
      if (labs.length === 0) continue
      for (let gi = 0; gi < ctx.groups.length; gi++) {
        const group = ctx.groups[gi]
        for (let start = 0; start + unit.length <= group.length; start++) {
          const range = group.slice(start, start + unit.length)
          const keys = range.map(p => slotKey(day, p))
          if (keys.some(k => unavailable.has(k))) continue
          if (keys.some(k => getSet(ctx.sectionBusy, unit.sectionId).has(k))) continue
          if (keys.some(k => getSet(ctx.facultyBusy, unit.facultyId).has(k))) continue
          const freeLabs = labs.filter(labId => !keys.some(k => getSet(ctx.labBusy, labId).has(k)))
          if (freeLabs.length === 0) continue
          const sectionDayCount = ctx.sectionDailyCount.get(`${unit.sectionId}:${day}`) ?? 0
          for (const labId of freeLabs) {
            domain.push({
              day,
              startPeriod: range[0],
              endPeriod: range[range.length - 1],
              labId,
              score: sectionDayCount * 2 + dailyCount + gi,
            })
          }
        }
      }
    }
  }

  domain.sort((a, b) => a.score - b.score)
  return domain
}

function place(unit: SchedulableUnit, c: Candidate, ctx: SolveContext) {
  const periods = periodRange(c)
  for (const p of periods) {
    const key = slotKey(c.day, p)
    getSet(ctx.sectionBusy, unit.sectionId).add(key)
    getSet(ctx.facultyBusy, unit.facultyId).add(key)
    if (c.labId) getSet(ctx.labBusy, c.labId).add(key)
  }
  ctx.facultyDailyCount.set(`${unit.facultyId}:${c.day}`, (ctx.facultyDailyCount.get(`${unit.facultyId}:${c.day}`) ?? 0) + unit.length)
  ctx.facultyWeeklyCount.set(unit.facultyId, (ctx.facultyWeeklyCount.get(unit.facultyId) ?? 0) + unit.length)
  ctx.sectionDailyCount.set(`${unit.sectionId}:${c.day}`, (ctx.sectionDailyCount.get(`${unit.sectionId}:${c.day}`) ?? 0) + unit.length)
}

function unplace(unit: SchedulableUnit, c: Candidate, ctx: SolveContext) {
  const periods = periodRange(c)
  for (const p of periods) {
    const key = slotKey(c.day, p)
    getSet(ctx.sectionBusy, unit.sectionId).delete(key)
    getSet(ctx.facultyBusy, unit.facultyId).delete(key)
    if (c.labId) getSet(ctx.labBusy, c.labId).delete(key)
  }
  ctx.facultyDailyCount.set(`${unit.facultyId}:${c.day}`, (ctx.facultyDailyCount.get(`${unit.facultyId}:${c.day}`) ?? 0) - unit.length)
  ctx.facultyWeeklyCount.set(unit.facultyId, (ctx.facultyWeeklyCount.get(unit.facultyId) ?? 0) - unit.length)
  ctx.sectionDailyCount.set(`${unit.sectionId}:${c.day}`, (ctx.sectionDailyCount.get(`${unit.sectionId}:${c.day}`) ?? 0) - unit.length)
}

function periodRange(c: Candidate): number[] {
  const periods: number[] = []
  for (let p = c.startPeriod; p <= c.endPeriod; p++) periods.push(p)
  return periods
}

// Most-constrained-first: a teacher shared across many sections (or with
// heavy total load) has the least slack in the week, so their units are
// placed while other sections still have open slots, rather than being
// forced into whatever periods happen to be left over. Without this, a
// zero-slack instance (every section's week fully packed, as a real
// department timetable typically is) can look falsely infeasible purely
// because of unit ordering, even though a valid arrangement exists.
function orderUnits(units: SchedulableUnit[]): SchedulableUnit[] {
  const facultyLoad = new Map<string, number>()
  for (const u of units) facultyLoad.set(u.facultyId, (facultyLoad.get(u.facultyId) ?? 0) + u.length)

  return [...units].sort((a, b) => {
    if (a.blockType !== b.blockType) return a.blockType === 'LAB' ? -1 : 1
    const loadA = facultyLoad.get(a.facultyId) ?? 0
    const loadB = facultyLoad.get(b.facultyId) ?? 0
    if (loadA !== loadB) return loadB - loadA
    if (a.length !== b.length) return b.length - a.length
    if (a.sectionId !== b.sectionId) return a.sectionId.localeCompare(b.sectionId)
    if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId)
    return a.unitId.localeCompare(b.unitId)
  })
}

export interface SolveResult {
  assignments: Assignment[]
  unscheduled: SchedulableUnit[]
  budgetExceeded: boolean
}

// Steps 4-6 of the pipeline: deterministic CSP/backtracking solver with
// soft-constraint-biased domain ordering (Section 13). Runs a real
// backtracking search bounded by MAX_BACKTRACK_STEPS so a genuinely
// infeasible instance still terminates and is reported honestly rather
// than hanging or faking a result.
export function solve(
  units: SchedulableUnit[],
  faculty: Faculty[],
  unavailability: FacultyUnavailability[],
  config: ScheduleConfig,
  labsByCourse: Map<string, string[]>
): SolveResult {
  // Static heuristic order (Section 13 soft bias) is only the tie-break
  // seed here. The actual variable choice at each node is dynamic
  // most-constrained-first (fail-first / MRV): among units not yet
  // placed, always branch on whichever currently has the FEWEST legal
  // remaining slots (labs before theory, ties broken by the static
  // order). For a near-zero-slack instance -- every section's week fully
  // packed, several teachers shared across many sections, exactly the
  // shape of a real department timetable -- a static ordering computed
  // once up front can force the search down enormous unproductive
  // branches; MRV recomputed at every node is what actually keeps the
  // search small enough to finish, because a unit with only one legal
  // slot left gets committed immediately instead of being deferred while
  // other, easier units eat the slots it needed.
  const ordered = orderUnits(units)
  const n = ordered.length
  const ctx = buildContext(faculty, unavailability, config, labsByCourse)
  const active = new Array<boolean>(n).fill(true)
  const assignedCandidate: (Candidate | null)[] = new Array(n).fill(null)
  let steps = 0
  let budgetExceeded = false

  function pickNext(): { idx: number; domain: Candidate[] } | null {
    let anyLabRemaining = false
    for (let i = 0; i < n; i++) {
      if (active[i] && ordered[i].blockType === 'LAB') {
        anyLabRemaining = true
        break
      }
    }
    let bestIdx = -1
    let bestDomain: Candidate[] | null = null
    let bestSize = Infinity
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue
      if (anyLabRemaining && ordered[i].blockType !== 'LAB') continue
      const domain = getDomain(ordered[i], ctx)
      if (domain.length < bestSize) {
        bestSize = domain.length
        bestIdx = i
        bestDomain = domain
        if (bestSize === 0) break // an already-dead unit -- fail this branch immediately
      }
    }
    if (bestIdx === -1) return null
    return { idx: bestIdx, domain: bestDomain! }
  }

  function backtrack(remaining: number): boolean {
    if (remaining === 0) return true
    steps++
    if (steps > MAX_BACKTRACK_STEPS) {
      budgetExceeded = true
      return false
    }
    const pick = pickNext()
    if (!pick || pick.domain.length === 0) return false
    const { idx, domain } = pick
    const unit = ordered[idx]
    active[idx] = false
    for (const candidate of domain) {
      place(unit, candidate, ctx)
      assignedCandidate[idx] = candidate
      if (backtrack(remaining - 1)) return true
      unplace(unit, candidate, ctx)
      assignedCandidate[idx] = null
      if (budgetExceeded) break
    }
    active[idx] = true
    return false
  }

  const success = backtrack(n)

  if (success) {
    const assignments: Assignment[] = ordered.map((unit, i) => {
      const c = assignedCandidate[i]!
      return {
        day: c.day,
        startPeriod: c.startPeriod,
        endPeriod: c.endPeriod,
        sectionId: unit.sectionId,
        courseId: unit.courseId,
        facultyId: unit.facultyId,
        blockType: unit.blockType,
        labId: c.labId,
      }
    })
    return { assignments, unscheduled: [], budgetExceeded: false }
  }

  // No fully-consistent assignment of ALL units was found within budget.
  // Fall back to a best-effort greedy pass (steps 4-5 without full
  // backtracking) so we can report exactly which units are unschedulable,
  // instead of discarding everything a partial success could have shown.
  // Crucially, keep reporting whether the *backtracking* search actually
  // exhausted the tree (a real proof of infeasibility) or merely hit its
  // step budget (search ran out of time, not proof of anything) -- the
  // greedy pass itself is not exhaustive and must never be mistaken for
  // that proof.
  return greedyFallback(ordered, faculty, unavailability, config, labsByCourse, budgetExceeded)
}

function greedyFallback(
  ordered: SchedulableUnit[],
  faculty: Faculty[],
  unavailability: FacultyUnavailability[],
  config: ScheduleConfig,
  labsByCourse: Map<string, string[]>,
  budgetExceeded: boolean
): SolveResult {
  const ctx = buildContext(faculty, unavailability, config, labsByCourse)
  const assignments: Assignment[] = []
  const unscheduled: SchedulableUnit[] = []

  for (const unit of ordered) {
    const domain = getDomain(unit, ctx)
    if (domain.length === 0) {
      unscheduled.push(unit)
      continue
    }
    const c = domain[0]
    place(unit, c, ctx)
    assignments.push({
      day: c.day,
      startPeriod: c.startPeriod,
      endPeriod: c.endPeriod,
      sectionId: unit.sectionId,
      courseId: unit.courseId,
      facultyId: unit.facultyId,
      blockType: unit.blockType,
      labId: c.labId,
    })
  }

  return { assignments, unscheduled, budgetExceeded }
}

// Produces structured diagnostics (Section 10) explaining exactly why a unit
// could not be scheduled, used when the solver leaves units unscheduled.
// `allUnits` (the full expanded demand, not just what's unscheduled) lets us
// tell a genuine capacity shortage (Section 9: eligibility vs. capacity)
// apart from an incidental slot/lab collision.
export function diagnoseUnscheduled(
  unscheduled: SchedulableUnit[],
  faculty: Faculty[],
  unavailability: FacultyUnavailability[],
  allUnits: SchedulableUnit[],
  labsByCourse: Map<string, string[]>
): Conflict[] {
  const conflicts: Conflict[] = []
  const facultyById = new Map(faculty.map(f => [f.id, f]))
  const unavailByFaculty = new Map<string, number>()
  for (const u of unavailability) unavailByFaculty.set(u.facultyId, (unavailByFaculty.get(u.facultyId) ?? 0) + 1)

  const demandByFaculty = new Map<string, number>()
  for (const u of allUnits) demandByFaculty.set(u.facultyId, (demandByFaculty.get(u.facultyId) ?? 0) + u.length)

  const shortageReported = new Set<string>()
  for (const unit of unscheduled) {
    const f = facultyById.get(unit.facultyId)
    const demand = demandByFaculty.get(unit.facultyId) ?? 0
    if (f && demand > f.maxWeeklyPeriods) {
      if (!shortageReported.has(f.id)) {
        shortageReported.add(f.id)
        conflicts.push({
          type: 'FACULTY_SHORTAGE',
          message: `Faculty ${f.id} needs ${demand} periods/week across all assigned sections but has capacity for only ${f.maxWeeklyPeriods}`,
          facultyId: f.id,
        })
      }
      continue
    }
    if (unit.blockType === 'LAB' && (labsByCourse.get(unit.courseId) ?? []).length === 0) {
      conflicts.push({
        type: 'LAB_CONFLICT',
        message: `No physical laboratory is mapped to course ${unit.courseId}; cannot place lab block for section ${unit.sectionId}`,
        courseId: unit.courseId,
        sectionId: unit.sectionId,
        facultyId: unit.facultyId,
      })
      continue
    }
    if (f && (unavailByFaculty.get(unit.facultyId) ?? 0) >= 40) {
      conflicts.push({
        type: 'TEACHER_UNAVAILABLE',
        message: `Faculty ${unit.facultyId} has no free periods remaining given explicit unavailability constraints`,
        facultyId: unit.facultyId,
        courseId: unit.courseId,
        sectionId: unit.sectionId,
      })
      continue
    }
    conflicts.push({
      type: 'WEEKLY_REQUIREMENT_UNSATISFIED',
      message: `Could not place a conflict-free ${unit.blockType.toLowerCase()} slot for course ${unit.courseId} / section ${unit.sectionId} (teacher ${unit.facultyId}); likely a section, teacher or lab collision given current load`,
      courseId: unit.courseId,
      sectionId: unit.sectionId,
      facultyId: unit.facultyId,
    })
  }
  return conflicts
}
