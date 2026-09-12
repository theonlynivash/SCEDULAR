import type {
  Assignment,
  Conflict,
  Course,
  CourseRequirement,
  Faculty,
  FacultyUnavailability,
  ScheduleConfig,
} from '../types.js'
import { contiguousGroups } from '../utils/grid.js'

// Pipeline step 7 (Section 16 "Post-validation"): replays every hard
// constraint against the generated master timetable, written completely
// independently of the solver's own bookkeeping. If this fails, the
// schedule is rejected even though the solver reported success -- an LLM
// or the solver's internal state is never trusted as the final authority.
export function independentValidate(
  assignments: Assignment[],
  requirements: CourseRequirement[],
  faculty: Faculty[],
  unavailability: FacultyUnavailability[],
  courses: Map<string, Course>,
  config: ScheduleConfig,
  labsByCourse: Map<string, string[]>
): Conflict[] {
  const conflicts: Conflict[] = []
  const periodByIndex = new Map(config.periods.map(p => [p.index, p]))
  const groups = contiguousGroups(config.periods)
  const facultyById = new Map(faculty.map(f => [f.id, f]))
  const unavailableSet = new Map<string, Set<string>>()
  for (const u of unavailability) {
    if (!unavailableSet.has(u.facultyId)) unavailableSet.set(u.facultyId, new Set())
    unavailableSet.get(u.facultyId)!.add(`${u.day}:${u.period}`)
  }

  const sectionSlots = new Map<string, Assignment[]>()
  const facultySlots = new Map<string, Assignment[]>()
  const labSlots = new Map<string, Assignment[]>()

  for (const a of assignments) {
    for (let p = a.startPeriod; p <= a.endPeriod; p++) {
      pushSlot(sectionSlots, a.sectionId, a, p)
      pushSlot(facultySlots, a.facultyId, a, p)
      if (a.labId) pushSlot(labSlots, a.labId, a, p)

      const period = periodByIndex.get(p)
      if (!period || !period.schedulable) {
        conflicts.push({
          type: 'INVALID_INPUT',
          message: `Assignment placed on a non-schedulable period ${p} (${a.day})`,
          sectionId: a.sectionId,
          courseId: a.courseId,
          facultyId: a.facultyId,
          day: a.day,
          period: p,
        })
      }

      if (unavailableSet.get(a.facultyId)?.has(`${a.day}:${p}`)) {
        conflicts.push({
          type: 'TEACHER_UNAVAILABLE',
          message: `Faculty ${a.facultyId} is scheduled during a declared unavailable slot (${a.day} P${p})`,
          facultyId: a.facultyId,
          courseId: a.courseId,
          sectionId: a.sectionId,
          day: a.day,
          period: p,
        })
      }
    }

    // Lab blocks must not cross BREAK/LUNCH -- i.e. every period in the
    // block must belong to the same contiguous group.
    if (a.blockType === 'LAB') {
      const group = groups.find(g => g.includes(a.startPeriod))
      const spanOk = group && a.endPeriod <= group[group.length - 1] && group.includes(a.endPeriod)
      if (!spanOk) {
        conflicts.push({
          type: 'INVALID_INPUT',
          message: `Lab block for course ${a.courseId} / section ${a.sectionId} on ${a.day} crosses BREAK or LUNCH`,
          courseId: a.courseId,
          sectionId: a.sectionId,
          day: a.day,
        })
      }
      if (!a.labId) {
        conflicts.push({
          type: 'LAB_CONFLICT',
          message: `Lab block for course ${a.courseId} / section ${a.sectionId} has no physical lab assigned`,
          courseId: a.courseId,
          sectionId: a.sectionId,
          day: a.day,
        })
      } else if (!(labsByCourse.get(a.courseId) ?? []).includes(a.labId)) {
        conflicts.push({
          type: 'LAB_CONFLICT',
          message: `Lab ${a.labId} is not configured to host course ${a.courseId}`,
          courseId: a.courseId,
          sectionId: a.sectionId,
          day: a.day,
        })
      }
    }
  }

  // Section cannot have two courses in the same period.
  for (const [sectionId, slots] of sectionSlots) {
    checkCollisions(slots, conflicts, 'SECTION_CONFLICT', s =>
      `Section ${sectionId} has overlapping assignments on ${s.day} P${overlapPeriod(s)}`
    )
  }
  // Teacher cannot teach two sections simultaneously.
  for (const [facultyId, slots] of facultySlots) {
    checkCollisions(slots, conflicts, 'TEACHER_UNAVAILABLE', s =>
      `Faculty ${facultyId} is double-booked on ${s.day} P${overlapPeriod(s)}`
    )
  }
  // A physical lab cannot host two sections simultaneously.
  for (const [labId, slots] of labSlots) {
    checkCollisions(slots, conflicts, 'LAB_CONFLICT', s =>
      `Lab ${labId} is double-booked on ${s.day} P${overlapPeriod(s)}`
    )
  }

  // Faculty daily/weekly capacity caps.
  const dailyTotals = new Map<string, number>()
  const weeklyTotals = new Map<string, number>()
  for (const a of assignments) {
    const len = a.endPeriod - a.startPeriod + 1
    const dailyKey = `${a.facultyId}:${a.day}`
    dailyTotals.set(dailyKey, (dailyTotals.get(dailyKey) ?? 0) + len)
    weeklyTotals.set(a.facultyId, (weeklyTotals.get(a.facultyId) ?? 0) + len)
  }
  for (const f of faculty) {
    const weekly = weeklyTotals.get(f.id) ?? 0
    if (weekly > f.maxWeeklyPeriods) {
      conflicts.push({
        type: 'FACULTY_SHORTAGE',
        message: `Faculty ${f.id} is assigned ${weekly} periods/week, exceeding capacity of ${f.maxWeeklyPeriods}`,
        facultyId: f.id,
      })
    }
    for (const day of config.workingDays) {
      const daily = dailyTotals.get(`${f.id}:${day}`) ?? 0
      if (daily > f.maxDailyPeriods) {
        conflicts.push({
          type: 'FACULTY_SHORTAGE',
          message: `Faculty ${f.id} is assigned ${daily} periods on ${day}, exceeding daily cap of ${f.maxDailyPeriods}`,
          facultyId: f.id,
          day,
        })
      }
    }
  }

  // Completeness: every required weekly assignment must be scheduled exactly.
  const theoryCount = new Map<string, number>()
  const labCount = new Map<string, number>()
  for (const a of assignments) {
    const key = `${a.courseId}::${a.sectionId}`
    const len = a.endPeriod - a.startPeriod + 1
    if (a.blockType === 'THEORY') theoryCount.set(key, (theoryCount.get(key) ?? 0) + len)
    else labCount.set(key, (labCount.get(key) ?? 0) + len)
  }
  for (const req of requirements) {
    const key = `${req.courseId}::${req.sectionId}`
    const theory = theoryCount.get(key) ?? 0
    const lab = labCount.get(key) ?? 0
    if (theory !== req.weeklyTheoryPeriods || lab !== req.weeklyLabPeriods) {
      conflicts.push({
        type: 'WEEKLY_REQUIREMENT_UNSATISFIED',
        message: `Course ${req.courseId} / section ${req.sectionId} requires ${req.weeklyTheoryPeriods} theory + ${req.weeklyLabPeriods} lab periods/week but only ${theory} theory + ${lab} lab were scheduled`,
        courseId: req.courseId,
        sectionId: req.sectionId,
      })
    }
  }

  return conflicts
}

function pushSlot(map: Map<string, Assignment[]>, key: string, a: Assignment, _p: number) {
  if (!map.has(key)) map.set(key, [])
  const arr = map.get(key)!
  if (arr[arr.length - 1] !== a) arr.push(a)
}

function overlapPeriod(a: Assignment): string {
  return a.startPeriod === a.endPeriod ? `${a.startPeriod}` : `${a.startPeriod}-${a.endPeriod}`
}

function checkCollisions(
  slots: Assignment[],
  conflicts: Conflict[],
  type: Conflict['type'],
  message: (a: Assignment) => string
) {
  const byDay = new Map<string, { start: number; end: number; a: Assignment }[]>()
  for (const a of slots) {
    if (!byDay.has(a.day)) byDay.set(a.day, [])
    byDay.get(a.day)!.push({ start: a.startPeriod, end: a.endPeriod, a })
  }
  for (const [, ranges] of byDay) {
    ranges.sort((x, y) => x.start - y.start)
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].start <= ranges[i - 1].end) {
        conflicts.push({
          type,
          message: message(ranges[i].a),
          sectionId: ranges[i].a.sectionId,
          courseId: ranges[i].a.courseId,
          facultyId: ranges[i].a.facultyId,
          day: ranges[i].a.day,
          period: ranges[i].start,
        })
      }
    }
  }
}
