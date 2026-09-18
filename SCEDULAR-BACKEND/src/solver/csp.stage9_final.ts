import type { Assignment, Conflict, Faculty, FacultyUnavailability, Lab, ScheduleConfig, SchedulableUnit } from '../types.js'
import { contiguousGroups } from '../utils/grid.js'

const MAX_BACKTRACK_STEPS = 2_000_000

// Hard cap: a section can have at most this many theory periods of the
// SAME course on the same day. Without this, nothing stops the solver from
// legally stacking every weekly occurrence of one subject onto a single
// day (e.g. 3x OOP on Monday, 0x the rest of the week) -- it satisfies
// every other rule but reads as a broken, unbalanced timetable. Exported
// so the independent post-validator (Section 16) checks the exact same
// number from scratch rather than trusting the solver kept to it.
export const MAX_SAME_COURSE_PER_DAY = 2
export const MAX_SAME_COURSE_SAME_PERIOD_PER_WEEK = 2

interface Candidate {
  facultyId: string
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
  sectionCourseDailyCount: Map<string, number> // `${sectionId}:${courseId}:${day}`
  sectionCoursePeriodCount: Map<string, number> // `${sectionId}:${courseId}:${periodIndex}` -- column balance
  labBusy: Map<string, Map<string, number>>
  labCapacityById: Map<string, number>
  groups: number[][]
  // Every course's lab options, fetched once by the pipeline before the
  // solve starts -- the backtracking loop below never touches the
  // database, it only reads this in-memory map.
  labsByCourse: Map<string, string[]>,
  labsBySectionCourse: Map<string, string[]>
}

function slotKey(day: string, period: number) {
  return `${day}:${period}`
}

function buildContext(
  faculty: Faculty[],
  unavailability: FacultyUnavailability[],
  config: ScheduleConfig,
  labsByCourse: Map<string, string[]>,
  labsBySectionCourse: Map<string, string[]>,
  labCapacityById: Map<string, number>
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
    sectionCourseDailyCount: new Map(),
    sectionCoursePeriodCount: new Map(),
    labBusy: new Map(),
    groups: contiguousGroups(config.periods),
    labsByCourse,
    labsBySectionCourse,
    labCapacityById,
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

function getLabUsage(ctx: SolveContext, labId: string, key: string): number {
  return ctx.labBusy.get(labId)?.get(key) ?? 0
}

function effectiveLabCapacity(ctx: SolveContext, labId: string): number {
  return ctx.labCapacityById.get(labId) ?? 1
}

function candidateLabsFor(ctx: SolveContext, unit: SchedulableUnit): string[] {
  return unit.labIds ?? ctx.labsBySectionCourse.get(`${unit.sectionId}::${unit.courseId}`) ?? ctx.labsByCourse.get(unit.courseId) ?? []
}

function candidateAfter(candidate: Candidate, floor?: Candidate): boolean {
  if (!floor) return true
  const c = `${candidate.day}::${candidate.startPeriod}`
  const f = `${floor.day}::${floor.startPeriod}`
  return c > f
}

// Step 4 + forward-checking domain computation for a single unit.
function getDomain(unit: SchedulableUnit, ctx: SolveContext, positionFloor?: Candidate): Candidate[] {
  const facultyIds = unit.facultyIds?.length ? unit.facultyIds : (unit.facultyId ? [unit.facultyId] : [])
  if (facultyIds.length === 0) return []
  const domain: Candidate[] = []

  for (const facultyId of facultyIds) {
    const faculty = ctx.facultyById.get(facultyId)
    if (!faculty) continue
    const unavailable = ctx.facultyUnavailable.get(facultyId) ?? new Set<string>()
    const weeklyCount = ctx.facultyWeeklyCount.get(facultyId) ?? 0
    if (weeklyCount + unit.length > faculty.maxWeeklyPeriods) continue

    for (const day of ctx.config.workingDays) {
      const dailyKey = `${facultyId}:${day}`
      const dailyCount = ctx.facultyDailyCount.get(dailyKey) ?? 0
      if (dailyCount + unit.length > faculty.maxDailyPeriods) continue

      if (unit.blockType === 'THEORY') {
        const courseDayCount = ctx.sectionCourseDailyCount.get(`${unit.sectionId}:${unit.courseId}:${day}`) ?? 0
        if (courseDayCount >= MAX_SAME_COURSE_PER_DAY) continue
        for (const p of ctx.config.periods) {
          if (!p.schedulable) continue
          const key = slotKey(day, p.index)
          if (unavailable.has(key)) continue
          if (getSet(ctx.sectionBusy, unit.sectionId).has(key)) continue
          if (getSet(ctx.facultyBusy, facultyId).has(key)) continue
          const sectionDayCount = ctx.sectionDailyCount.get(`${unit.sectionId}:${day}`) ?? 0
          const columnCount = ctx.sectionCoursePeriodCount.get(`${unit.sectionId}:${unit.courseId}:${p.index}`) ?? 0
          if (columnCount >= MAX_SAME_COURSE_SAME_PERIOD_PER_WEEK) continue
          const candidate = {
            day,
            startPeriod: p.index,
            endPeriod: p.index,
            facultyId,
            score: courseDayCount * 5 + columnCount * columnCount * 6 + sectionDayCount * 2 + dailyCount,
          }
          if (candidateAfter(candidate, positionFloor)) domain.push(candidate)
        }
      } else {
        const labs = candidateLabsFor(ctx, unit)
        if (labs.length === 0) continue
        for (let gi = 0; gi < ctx.groups.length; gi++) {
          const group = ctx.groups[gi]
          for (let start = 0; start + unit.length <= group.length; start++) {
            const range = group.slice(start, start + unit.length)
            const keys = range.map(p => slotKey(day, p))
            if (keys.some(k => unavailable.has(k))) continue
            if (keys.some(k => getSet(ctx.sectionBusy, unit.sectionId).has(k))) continue
            if (keys.some(k => getSet(ctx.facultyBusy, facultyId).has(k))) continue
            const freeLabs = labs.filter(labId => keys.every(k => getLabUsage(ctx, labId, k) < effectiveLabCapacity(ctx, labId)))
            if (freeLabs.length === 0) continue
            const sectionDayCount = ctx.sectionDailyCount.get(`${unit.sectionId}:${day}`) ?? 0
            for (const labId of freeLabs) {
              const candidate = {
                day,
                startPeriod: range[0],
                endPeriod: range[range.length - 1],
                facultyId,
                labId,
                score: sectionDayCount * 2 + dailyCount + gi,
              }
              if (candidateAfter(candidate, positionFloor)) domain.push(candidate)
            }
          }
        }
      }
    }
  }
  domain.sort((a, b) => a.score - b.score || a.facultyId.localeCompare(b.facultyId))
  return domain
}

function place(unit: SchedulableUnit, c: Candidate, ctx: SolveContext) {
  const periods = periodRange(c)
  for (const p of periods) {
    const key = slotKey(c.day, p)
    getSet(ctx.sectionBusy, unit.sectionId).add(key)
    getSet(ctx.facultyBusy, c.facultyId).add(key)
    if (c.labId) {
      const usage = ctx.labBusy.get(c.labId) ?? new Map<string, number>()
      usage.set(key, (usage.get(key) ?? 0) + 1)
      ctx.labBusy.set(c.labId, usage)
    }
  }
  ctx.facultyDailyCount.set(`${c.facultyId}:${c.day}`, (ctx.facultyDailyCount.get(`${c.facultyId}:${c.day}`) ?? 0) + unit.length)
  ctx.facultyWeeklyCount.set(c.facultyId, (ctx.facultyWeeklyCount.get(c.facultyId) ?? 0) + unit.length)
  ctx.sectionDailyCount.set(`${unit.sectionId}:${c.day}`, (ctx.sectionDailyCount.get(`${unit.sectionId}:${c.day}`) ?? 0) + unit.length)
  if (unit.blockType === 'THEORY') {
    const key = `${unit.sectionId}:${unit.courseId}:${c.day}`
    ctx.sectionCourseDailyCount.set(key, (ctx.sectionCourseDailyCount.get(key) ?? 0) + 1)
    const pkey = `${unit.sectionId}:${unit.courseId}:${c.startPeriod}`
    ctx.sectionCoursePeriodCount.set(pkey, (ctx.sectionCoursePeriodCount.get(pkey) ?? 0) + 1)
  }
}

function unplace(unit: SchedulableUnit, c: Candidate, ctx: SolveContext) {
  const periods = periodRange(c)
  for (const p of periods) {
    const key = slotKey(c.day, p)
    getSet(ctx.sectionBusy, unit.sectionId).delete(key)
    getSet(ctx.facultyBusy, c.facultyId).delete(key)
    if (c.labId) {
      const usage = ctx.labBusy.get(c.labId)
      if (usage) {
        const next = (usage.get(key) ?? 0) - 1
        if (next > 0) usage.set(key, next)
        else usage.delete(key)
      }
    }
  }
  ctx.facultyDailyCount.set(`${c.facultyId}:${c.day}`, (ctx.facultyDailyCount.get(`${c.facultyId}:${c.day}`) ?? 0) - unit.length)
  ctx.facultyWeeklyCount.set(c.facultyId, (ctx.facultyWeeklyCount.get(c.facultyId) ?? 0) - unit.length)
  ctx.sectionDailyCount.set(`${unit.sectionId}:${c.day}`, (ctx.sectionDailyCount.get(`${unit.sectionId}:${c.day}`) ?? 0) - unit.length)
  if (unit.blockType === 'THEORY') {
    const key = `${unit.sectionId}:${unit.courseId}:${c.day}`
    ctx.sectionCourseDailyCount.set(key, (ctx.sectionCourseDailyCount.get(key) ?? 0) - 1)
    const pkey = `${unit.sectionId}:${unit.courseId}:${c.startPeriod}`
    ctx.sectionCoursePeriodCount.set(pkey, (ctx.sectionCoursePeriodCount.get(pkey) ?? 0) - 1)
  }
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
  for (const u of units) {
    for (const id of (u.facultyIds?.length ? u.facultyIds : (u.facultyId ? [u.facultyId] : []))) {
      facultyLoad.set(id, (facultyLoad.get(id) ?? 0) + u.length)
    }
  }
  const tightness = (u: SchedulableUnit) => Math.max(...(u.facultyIds?.length ? u.facultyIds.map(id => facultyLoad.get(id) ?? 0) : [facultyLoad.get(u.facultyId ?? '') ?? 0]))
  return [...units].sort((a, b) => {
    if (a.blockType !== b.blockType) return a.blockType === 'LAB' ? -1 : 1
    const loadA = tightness(a)
    const loadB = tightness(b)
    if (loadA !== loadB) return loadB - loadA
    if (a.length !== b.length) return b.length - a.length
    if (a.sectionId !== b.sectionId) return a.sectionId.localeCompare(b.sectionId)
    if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId)
    return a.unitId.localeCompare(b.unitId)
  })
}

interface SymmetryInfo {
  previousIndex: Array<number | null>
}

function buildSymmetryInfo(units: SchedulableUnit[]): SymmetryInfo {
  const groups = new Map<string, number[]>()
  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    const facultyKey = (u.facultyIds?.length ? [...u.facultyIds].sort() : [u.facultyId ?? '']).join(',')
    const labKey = (u.labIds?.length ? [...u.labIds].sort() : []).join(',')
    const key = [u.sectionId, u.courseId, u.subjectId ?? u.courseId, u.blockType, u.length, u.batch ?? '', facultyKey, labKey].join('|')
    const list = groups.get(key) ?? []
    list.push(i)
    groups.set(key, list)
  }
  const previousIndex: Array<number | null> = new Array(units.length).fill(null)
  for (const list of groups.values()) {
    for (let i = 1; i < list.length; i++) previousIndex[list[i]] = list[i - 1]
  }
  return { previousIndex }
}


interface ConstructiveResult {
  assignments: Assignment[]
  unscheduled: SchedulableUnit[]
  conflictFree: boolean
}

function staticCandidates(unit: SchedulableUnit, ctx: SolveContext): Candidate[] {
  const facultyIds = unit.facultyIds?.length ? unit.facultyIds : (unit.facultyId ? [unit.facultyId] : [])
  if (facultyIds.length === 0) return []
  const domain: Candidate[] = []

  for (const facultyId of facultyIds) {
    const faculty = ctx.facultyById.get(facultyId)
    if (!faculty) continue
    const unavailable = ctx.facultyUnavailable.get(facultyId) ?? new Set<string>()
    if (unit.length > faculty.maxDailyPeriods || unit.length > faculty.maxWeeklyPeriods) continue

    for (let dayIndex = 0; dayIndex < ctx.config.workingDays.length; dayIndex++) {
      const day = ctx.config.workingDays[dayIndex]
      for (const p of ctx.config.periods) {
        if (unit.blockType === 'THEORY') {
          if (!p.schedulable) continue
          if (unavailable.has(slotKey(day, p.index))) continue
          domain.push({
            day,
            startPeriod: p.index,
            endPeriod: p.index,
            facultyId,
            score: dayIndex * 100 + p.index,
          })
          continue
        }
      }

      if (unit.blockType === 'LAB') {
        const labs = candidateLabsFor(ctx, unit)
        if (labs.length === 0) continue
        for (let gi = 0; gi < ctx.groups.length; gi++) {
          const group = ctx.groups[gi]
          for (let start = 0; start + unit.length <= group.length; start++) {
            const range = group.slice(start, start + unit.length)
            const keys = range.map(period => slotKey(day, period))
            if (keys.some(k => unavailable.has(k))) continue
            for (const labId of labs) {
              domain.push({
                day,
                startPeriod: range[0],
                endPeriod: range[range.length - 1],
                facultyId,
                labId,
                score: dayIndex * 100 + gi * 10 + start,
              })
            }
          }
        }
      }
    }
  }
  return domain
}

function constructivePlacementCost(unit: SchedulableUnit, candidate: Candidate, ctx: SolveContext): number {
  let cost = 0
  const periods = periodRange(candidate)
  const sectionDailyKey = `${unit.sectionId}:${candidate.day}`
  const facultyDailyKey = `${candidate.facultyId}:${candidate.day}`
  const sectionDayCount = ctx.sectionDailyCount.get(sectionDailyKey) ?? 0
  const facultyDayCount = ctx.facultyDailyCount.get(facultyDailyKey) ?? 0

  // Preserve a balanced timetable while resolving cross-section resources.
  cost += sectionDayCount * 1.0
  cost += facultyDayCount * 0.5

  for (const period of periods) {
    const key = slotKey(candidate.day, period)
    if (getSet(ctx.facultyBusy, candidate.facultyId).has(key)) cost += 100
    if (candidate.labId && getLabUsage(ctx, candidate.labId, key) >= effectiveLabCapacity(ctx, candidate.labId)) cost += 100
  }

  return cost
}

function constructiveOrder(units: SchedulableUnit[]): SchedulableUnit[] {
  const demandCount = new Map<string, number>()
  const facultyDemand = new Map<string, number>()
  const labResourceDemand = new Map<string, number>()
  for (const u of units) {
    const key = `${u.sectionId}::${u.courseId}::${u.blockType}::${u.batch ?? ''}`
    demandCount.set(key, (demandCount.get(key) ?? 0) + u.length)
    for (const facultyId of (u.facultyIds?.length ? u.facultyIds : (u.facultyId ? [u.facultyId] : []))) {
      facultyDemand.set(facultyId, (facultyDemand.get(facultyId) ?? 0) + u.length)
    }
    if (u.blockType === 'LAB') {
      for (const labId of (u.labIds ?? [])) labResourceDemand.set(labId, (labResourceDemand.get(labId) ?? 0) + u.length)
    }
  }
  const facultyTightness = (u: SchedulableUnit) => Math.max(...(u.facultyIds?.length ? u.facultyIds.map(id => facultyDemand.get(id) ?? 0) : [facultyDemand.get(u.facultyId ?? '') ?? 0]))
  const labTightness = (u: SchedulableUnit) => u.blockType === 'LAB' && (u.labIds?.length ?? 0) > 0
    ? Math.min(...(u.labIds ?? []).map(id => labResourceDemand.get(id) ?? 0))
    : 0
  return [...units].sort((a, b) => {
    if (a.blockType !== b.blockType) return a.blockType === 'LAB' ? -1 : 1
    if (a.blockType === 'LAB') {
      const la = labTightness(a), lb = labTightness(b)
      if (la !== lb) return lb - la
      if ((a.labIds?.length ?? 0) !== (b.labIds?.length ?? 0)) return (a.labIds?.length ?? 0) - (b.labIds?.length ?? 0)
      if (a.length !== b.length) return b.length - a.length
    } else {
      const fa = facultyTightness(a), fb = facultyTightness(b)
      if (fa !== fb) return fb - fa
      if ((a.facultyIds?.length ?? 1) !== (b.facultyIds?.length ?? 1)) return (a.facultyIds?.length ?? 1) - (b.facultyIds?.length ?? 1)
      const da = demandCount.get(`${a.sectionId}::${a.courseId}::${a.blockType}::${a.batch ?? ''}`) ?? 0
      const db = demandCount.get(`${b.sectionId}::${b.courseId}::${b.blockType}::${b.batch ?? ''}`) ?? 0
      if (da !== db) return db - da
    }
    if (a.sectionId !== b.sectionId) return a.sectionId.localeCompare(b.sectionId)
    if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId)
    return a.unitId.localeCompare(b.unitId)
  })
}


interface ScheduledRecord {
  unit: SchedulableUnit
  candidate: Candidate
  assignment: Assignment
}

function facultyCollisionCount(records: ScheduledRecord[]): number {
  const counts = new Map<string, number>()
  for (const record of records) {
    for (const period of periodRange(record.candidate)) {
      const key = slotKey(record.candidate.day, period)
      const mapKey = `${record.candidate.facultyId}::${key}`
      counts.set(mapKey, (counts.get(mapKey) ?? 0) + 1)
    }
  }
  let conflicts = 0
  for (const count of counts.values()) conflicts += Math.max(0, count - 1)
  return conflicts
}


function labCapacityViolationCount(records: ScheduledRecord[], ctx: SolveContext): number {
  const usage = new Map<string, number>()
  for (const record of records) {
    if (!record.candidate.labId) continue
    for (const period of periodRange(record.candidate)) {
      const key = `${record.candidate.labId}::${slotKey(record.candidate.day, period)}`
      usage.set(key, (usage.get(key) ?? 0) + 1)
    }
  }
  let violations = 0
  for (const [key, count] of usage) {
    const labId = key.split('::')[0]
    violations += Math.max(0, count - effectiveLabCapacity(ctx, labId))
  }
  return violations
}

function refreshAssignmentFromCandidate(target: Assignment, unit: SchedulableUnit, candidate: Candidate) {
  target.day = candidate.day
  target.startPeriod = candidate.startPeriod
  target.endPeriod = candidate.endPeriod
  target.sectionId = unit.sectionId
  target.courseId = unit.courseId
  target.subjectId = unit.subjectId ?? unit.courseId
  target.sectionSubjectId = unit.sectionSubjectId
  target.facultyId = candidate.facultyId
  target.blockType = unit.blockType
  target.batch = unit.batch ?? null
  target.labId = candidate.labId
}

function repairTheoryFacultyConflicts(records: ScheduledRecord[], ctx: SolveContext): void {
  const bySection = new Map<string, ScheduledRecord[]>()
  for (const record of records) {
    if (record.unit.blockType !== 'THEORY') continue
    const list = bySection.get(record.unit.sectionId) ?? []
    list.push(record)
    bySection.set(record.unit.sectionId, list)
  }

  for (let pass = 0; pass < 8; pass++) {
    let improved = false
    const beforePass = facultyCollisionCount(records)
    if (beforePass === 0) return

    for (const list of bySection.values()) {
      for (let ai = 0; ai < list.length && !improved; ai++) {
        for (let bi = ai + 1; bi < list.length; bi++) {
          const a = list[ai]
          const b = list[bi]
          if (a.candidate.day === b.candidate.day && a.candidate.startPeriod === b.candidate.startPeriod) continue

          const originalA = { ...a.candidate }
          const originalB = { ...b.candidate }
          unplace(a.unit, a.candidate, ctx)
          unplace(b.unit, b.candidate, ctx)

          const candidateA: Candidate = {
            facultyId: originalA.facultyId,
            day: originalB.day,
            startPeriod: originalB.startPeriod,
            endPeriod: originalB.endPeriod,
            score: 0,
          }
          const candidateB: Candidate = {
            facultyId: originalB.facultyId,
            day: originalA.day,
            startPeriod: originalA.startPeriod,
            endPeriod: originalA.endPeriod,
            score: 0,
          }

          const legalA = getDomain(a.unit, ctx).some(c => c.facultyId === candidateA.facultyId && c.day === candidateA.day && c.startPeriod === candidateA.startPeriod)
          const legalB = getDomain(b.unit, ctx).some(c => c.facultyId === candidateB.facultyId && c.day === candidateB.day && c.startPeriod === candidateB.startPeriod)
          if (legalA && legalB) {
            place(a.unit, candidateA, ctx)
            place(b.unit, candidateB, ctx)
            a.candidate = candidateA
            b.candidate = candidateB
            refreshAssignmentFromCandidate(a.assignment, a.unit, candidateA)
            refreshAssignmentFromCandidate(b.assignment, b.unit, candidateB)
          }

          const after = legalA && legalB ? facultyCollisionCount(records) : Number.POSITIVE_INFINITY
          if (after < beforePass) {
            improved = true
            break
          }

          // Restore original state if the swap was not an improvement.
          if (legalA && legalB) {
            unplace(a.unit, candidateA, ctx)
            unplace(b.unit, candidateB, ctx)
          }
          place(a.unit, originalA, ctx)
          place(b.unit, originalB, ctx)
          a.candidate = originalA
          b.candidate = originalB
          refreshAssignmentFromCandidate(a.assignment, a.unit, originalA)
          refreshAssignmentFromCandidate(b.assignment, b.unit, originalB)
        }
      }
      if (improved) break
    }
    if (!improved) return
  }
}

export function constructiveGreedy(units: SchedulableUnit[], faculty: Faculty[], unavailability: FacultyUnavailability[], config: ScheduleConfig, labsByCourse: Map<string, string[]>, labsBySectionCourse: Map<string, string[]>, labCapacityById: Map<string, number> = new Map()): ConstructiveResult {
  const ordered = constructiveOrder(units)
  const ctx = buildContext(faculty, unavailability, config, labsByCourse, labsBySectionCourse, labCapacityById)
  const assignments: Assignment[] = []
  const scheduledRecords: ScheduledRecord[] = []
  const unscheduled: SchedulableUnit[] = []
  let hadCrossResourceConflict = false

  for (const unit of ordered) {
    const domain = staticCandidates(unit, ctx)
      .filter(candidate => {
        const periods = periodRange(candidate)
        const sectionBusy = getSet(ctx.sectionBusy, unit.sectionId)
        if (periods.some(p => sectionBusy.has(slotKey(candidate.day, p)))) return false
        const faculty = ctx.facultyById.get(candidate.facultyId)
        if (!faculty) return false
        const facultyWeekly = ctx.facultyWeeklyCount.get(candidate.facultyId) ?? 0
        if (facultyWeekly + unit.length > faculty.maxWeeklyPeriods) return false
        const facultyDaily = ctx.facultyDailyCount.get(`${candidate.facultyId}:${candidate.day}`) ?? 0
        if (facultyDaily + unit.length > faculty.maxDailyPeriods) return false
        if (unit.blockType === 'THEORY') {
          const courseDay = ctx.sectionCourseDailyCount.get(`${unit.sectionId}:${unit.courseId}:${candidate.day}`) ?? 0
          if (courseDay + 1 > MAX_SAME_COURSE_PER_DAY) return false
          const coursePeriod = ctx.sectionCoursePeriodCount.get(`${unit.sectionId}:${unit.courseId}:${candidate.startPeriod}`) ?? 0
          if (coursePeriod + 1 > MAX_SAME_COURSE_SAME_PERIOD_PER_WEEK) return false
        }
        return true
      })
      .sort((a, b) => {
        const ca = constructivePlacementCost(unit, a, ctx)
        const cb = constructivePlacementCost(unit, b, ctx)
        if (ca !== cb) return ca - cb
        return a.score - b.score || a.facultyId.localeCompare(b.facultyId) || (a.labId ?? '').localeCompare(b.labId ?? '')
      })

    if (domain.length === 0) {
      unscheduled.push(unit)
      continue
    }

    const c = domain[0]
    const periods = periodRange(c)
    if (periods.some(p => getSet(ctx.facultyBusy, c.facultyId).has(slotKey(c.day, p)))) hadCrossResourceConflict = true
    if (c.labId && periods.some(p => getLabUsage(ctx, c.labId!, slotKey(c.day, p)) >= effectiveLabCapacity(ctx, c.labId!))) hadCrossResourceConflict = true
    place(unit, c, ctx)
    const assignment: Assignment = {
      day: c.day,
      startPeriod: c.startPeriod,
      endPeriod: c.endPeriod,
      sectionId: unit.sectionId,
      courseId: unit.courseId,
      subjectId: unit.subjectId ?? unit.courseId,
      sectionSubjectId: unit.sectionSubjectId,
      facultyId: c.facultyId,
      blockType: unit.blockType,
      batch: unit.batch ?? null,
      labId: c.labId,
    }
    assignments.push(assignment)
    scheduledRecords.push({ unit, candidate: { ...c }, assignment })
  }

  repairTheoryFacultyConflicts(scheduledRecords, ctx)

  // A constructive result is only considered safe as a solver success if it
  // has no known dynamic hard conflicts. The independent validator remains the
  // final authority before a timetable can be published.
  const conflictFree = unscheduled.length === 0 && facultyCollisionCount(scheduledRecords) === 0 && labCapacityViolationCount(scheduledRecords, ctx) === 0
  return { assignments, unscheduled, conflictFree }
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
  labsByCourse: Map<string, string[]>,
  labsBySectionCourse: Map<string, string[]>,
  labCapacityById: Map<string, number> = new Map()
): SolveResult {
  // Symmetry breaking is applied to identical demand units (same section, subject,
  // component, length, batch, faculty option set and lab option set): equivalent
  // copies are scheduled in canonical lexicographic slot order. This removes the
  // factorial permutations of otherwise indistinguishable weekly occurrences.
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
  const constructive = constructiveGreedy(units, faculty, unavailability, config, labsByCourse, labsBySectionCourse, labCapacityById)
  if (constructive.conflictFree) return { assignments: constructive.assignments, unscheduled: [], budgetExceeded: false }

  const ordered = orderUnits(units)
  const n = ordered.length
  const symmetry = buildSymmetryInfo(ordered)
  const ctx = buildContext(faculty, unavailability, config, labsByCourse, labsBySectionCourse, labCapacityById)
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
      const prevIdx = symmetry.previousIndex[i]
      if (prevIdx !== null && active[prevIdx]) continue
      if (anyLabRemaining && ordered[i].blockType !== 'LAB') continue
      const prevCandidate = prevIdx !== null ? assignedCandidate[prevIdx] ?? undefined : undefined
      const domain = getDomain(ordered[i], ctx, prevCandidate)
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
        subjectId: unit.subjectId ?? unit.courseId,
        sectionSubjectId: unit.sectionSubjectId,
        facultyId: c.facultyId,
        blockType: unit.blockType,
        batch: unit.batch ?? null,
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
  const constructiveFallback = constructiveGreedy(units, faculty, unavailability, config, labsByCourse, labsBySectionCourse, labCapacityById)
  return { assignments: constructiveFallback.assignments, unscheduled: constructiveFallback.unscheduled, budgetExceeded }
}

function greedyFallback(
  ordered: SchedulableUnit[],
  faculty: Faculty[],
  unavailability: FacultyUnavailability[],
  config: ScheduleConfig,
  labsByCourse: Map<string, string[]>,
  labsBySectionCourse: Map<string, string[]>,
  budgetExceeded: boolean,
  labCapacityById: Map<string, number> = new Map()
): SolveResult {
  const ctx = buildContext(faculty, unavailability, config, labsByCourse, labsBySectionCourse, labCapacityById)
  const assignments: Assignment[] = []
  const scheduledRecords: ScheduledRecord[] = []
  const unscheduled: SchedulableUnit[] = []
  let hadCrossResourceConflict = false

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
      facultyId: c.facultyId,
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
  labsByCourse: Map<string, string[]>,
  labsBySectionCourse: Map<string, string[]>
): Conflict[] {
  const conflicts: Conflict[] = []
  const facultyById = new Map(faculty.map(f => [f.id, f]))
  const unavailByFaculty = new Map<string, number>()
  for (const u of unavailability) unavailByFaculty.set(u.facultyId, (unavailByFaculty.get(u.facultyId) ?? 0) + 1)

  const demandByFaculty = new Map<string, number>()
  for (const u of allUnits) {
    for (const id of (u.facultyIds?.length ? u.facultyIds : (u.facultyId ? [u.facultyId] : []))) {
      demandByFaculty.set(id, (demandByFaculty.get(id) ?? 0) + u.length)
    }
  }

  const shortageReported = new Set<string>()
  for (const unit of unscheduled) {
    const candidateIds = unit.facultyIds?.length ? unit.facultyIds : (unit.facultyId ? [unit.facultyId] : [])
    const f = candidateIds.map(id => facultyById.get(id)).find(Boolean)
    const demand = f ? demandByFaculty.get(f.id) ?? 0 : 0
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
    if (unit.blockType === 'LAB' && (labsBySectionCourse.get(`${unit.sectionId}::${unit.courseId}`) ?? labsByCourse.get(unit.courseId) ?? []).length === 0) {
      conflicts.push({
        type: 'LAB_CONFLICT',
        message: `No physical laboratory is mapped to course ${unit.courseId}; cannot place lab block for section ${unit.sectionId}`,
        courseId: unit.courseId,
        sectionId: unit.sectionId,
        facultyId: f?.id ?? unit.facultyIds?.[0] ?? unit.facultyId ?? 'UNKNOWN',
      })
      continue
    }
    if (f && (unavailByFaculty.get(f.id) ?? 0) >= 40) {
      conflicts.push({
        type: 'TEACHER_UNAVAILABLE',
        message: `Faculty ${f?.id ?? unit.facultyIds?.join(',') ?? unit.facultyId} has no free periods remaining given explicit unavailability constraints`,
        facultyId: f?.id ?? unit.facultyIds?.[0] ?? unit.facultyId ?? 'UNKNOWN',
        courseId: unit.courseId,
        sectionId: unit.sectionId,
      })
      continue
    }
    conflicts.push({
      type: 'WEEKLY_REQUIREMENT_UNSATISFIED',
      message: `Could not place a conflict-free ${unit.blockType.toLowerCase()} slot for course ${unit.courseId} / section ${unit.sectionId} (eligible faculty ${unit.facultyIds?.join(',') ?? unit.facultyId ?? 'unknown'}); likely a section, teacher or lab collision given current load`,
      courseId: unit.courseId,
      sectionId: unit.sectionId,
      facultyId: f?.id ?? unit.facultyIds?.[0] ?? unit.facultyId ?? 'UNKNOWN',
    })
  }
  return conflicts
}
