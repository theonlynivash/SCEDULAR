import type {
  Assignment,
  Conflict,
  Faculty,
  FacultyUnavailability,
  Lab,
  ScheduleConfig,
  Section,
  SectionSubject,
  Subject,
  TeachingAssignment,
} from '../types.js'
import { contiguousGroups } from '../utils/grid.js'
import { MAX_SAME_COURSE_PER_DAY, MAX_SAME_COURSE_SAME_PERIOD_PER_WEEK } from './csp.js'

export interface CanonicalValidationInput {
  assignments: Assignment[]
  sections: Section[]
  subjects: Subject[]
  sectionSubjects: SectionSubject[]
  teachingAssignments: TeachingAssignment[]
  faculty: Faculty[]
  unavailability: FacultyUnavailability[]
  labs: Lab[]
  config: ScheduleConfig
  labsBySubject: Map<string, string[]>
  labsBySectionSubject?: Map<string, string[]>
}

// Final authority for a generated timetable. This validator intentionally
// consumes the canonical academic/resource model directly rather than an
// adapter that makes the solver's data look like the old Course model.
// It never repairs a schedule; it only proves or rejects it.
export function independentValidate(input: CanonicalValidationInput): Conflict[] {
  const {
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
    labsBySectionSubject = new Map(),
  } = input

  const conflicts: Conflict[] = []
  const periodByIndex = new Map(config.periods.map(p => [p.index, p]))
  const groups = contiguousGroups(config.periods)
  const facultyById = new Map(faculty.map(f => [f.id, f]))
  const subjectById = new Map(subjects.map(s => [s.id, s]))
  const sectionById = new Map(sections.map(s => [s.id, s]))
  const offeringById = new Map(sectionSubjects.map(o => [String(o.id), o]))
  const offeringByPair = new Map(sectionSubjects.map(o => [`${o.sectionId}::${o.subjectId}`, o]))
  const labById = new Map(labs.map(l => [l.id, l]))

  const unavailabilitySet = new Set(unavailability.map(u => `${u.facultyId}:${u.day}:${u.period}`))

  const authorized = new Map<string, Set<string>>()
  for (const ta of teachingAssignments) {
    const key = `${ta.sectionSubjectId}::${ta.component}`
    const set = authorized.get(key) ?? new Set<string>()
    set.add(`${ta.facultyId}::${ta.batch ?? ''}`)
    authorized.set(key, set)
  }

  const sectionSlots = new Map<string, Assignment[]>()
  const facultySlots = new Map<string, Assignment[]>()
  const labSlots = new Map<string, Assignment[]>()
  const requirementCounts = new Map<string, { theory: number; lab: number }>()
  const batchRequirementCounts = new Map<string, number>()

  for (const a of assignments) {
    const offering = a.sectionSubjectId != null
      ? offeringById.get(String(a.sectionSubjectId))
      : offeringByPair.get(`${a.sectionId}::${a.subjectId ?? a.courseId}`)
    const subjectId = a.subjectId ?? a.courseId
    const subject = subjectById.get(subjectId)
    const section = sectionById.get(a.sectionId)

    if (!subject) {
      conflicts.push(issue('INVALID_INPUT', `Assignment references unknown subject ${subjectId}`, a))
    }
    if (!section) {
      conflicts.push(issue('INVALID_INPUT', `Assignment references unknown section ${a.sectionId}`, a))
    }
    if (!offering) {
      conflicts.push(issue('INVALID_INPUT', `Assignment ${subjectId}/${a.sectionId} does not reference a valid section-subject requirement`, a))
      continue
    }

    if (a.sectionSubjectId != null && String(a.sectionSubjectId) !== String(offering.id)) {
      conflicts.push(issue('INVALID_INPUT', `Assignment points to section-subject ${a.sectionSubjectId}, but its section/subject pair is ${offering.sectionId}/${offering.subjectId}`, a))
    }
    if (offering.sectionId !== a.sectionId || offering.subjectId !== subjectId) {
      conflicts.push(issue('INVALID_INPUT', `Assignment section/subject does not match section-subject requirement ${offering.id}`, a))
    }

    const expectedPeriods = a.blockType === 'THEORY' ? offering.theoryPeriods : offering.labPeriods
    if (expectedPeriods <= 0) {
      conflicts.push(issue('INVALID_INPUT', `${a.blockType} assignment exists for ${subjectId}, but that component has zero required periods`, a))
    }

    const length = a.endPeriod - a.startPeriod + 1
    if (length <= 0) {
      conflicts.push(issue('INVALID_INPUT', `Assignment has an invalid period range ${a.startPeriod}-${a.endPeriod}`, a))
    }

    const faculty = facultyById.get(a.facultyId)
    if (!faculty) {
      conflicts.push(issue('INVALID_INPUT', `Assignment references unknown faculty ${a.facultyId}`, a))
    } else {
      const component = a.blockType
      const batchKey = a.batch ?? ''
      const allowed = authorized.get(`${offering.id}::${component}`) ?? new Set<string>()
      if (!allowed.has(`${a.facultyId}::${batchKey}`)) {
        conflicts.push(issue('INVALID_INPUT', `Faculty ${a.facultyId} is not authorized to teach ${component} for ${subjectId}/${a.sectionId}${a.batch ? ` batch ${a.batch}` : ''}`, a))
      }
      if (a.blockType === 'THEORY' && a.batch != null) {
        conflicts.push(issue('INVALID_INPUT', `Theory assignment ${subjectId}/${a.sectionId} cannot carry lab batch ${a.batch}`, a))
      }
      for (let p = a.startPeriod; p <= a.endPeriod; p++) {
        if (unavailabilitySet.has(`${a.facultyId}:${a.day}:${p}`)) {
          conflicts.push(issue('TEACHER_UNAVAILABLE', `Faculty ${a.facultyId} is scheduled during unavailable slot ${a.day} P${p}`, a, p))
        }
      }
    }

    // Store each assignment once for interval collision checks. A multi-period
    // lab occupies several slots, but duplicating the same assignment in the
    // collision arrays would make the validator report the assignment as
    // overlapping with itself. Individual periods are still checked below.
    pushSlot(sectionSlots, a.sectionId, a)
    if (facultyById.has(a.facultyId)) pushSlot(facultySlots, a.facultyId, a)
    if (a.labId) pushSlot(labSlots, a.labId, a)

    for (let p = a.startPeriod; p <= a.endPeriod; p++) {
      const period = periodByIndex.get(p)
      if (!period || !period.schedulable) {
        conflicts.push(issue('INVALID_INPUT', `Assignment is placed on non-schedulable period ${p} (${a.day})`, a, p))
      }
    }

    const key = `${offering.id}`
    const counts = requirementCounts.get(key) ?? { theory: 0, lab: 0 }
    if (a.blockType === 'THEORY') counts.theory += length
    else counts.lab += length
    requirementCounts.set(key, counts)

    if (a.blockType === 'LAB' && a.batch) {
      const batchKey = `${offering.id}::${a.batch}`
      batchRequirementCounts.set(batchKey, (batchRequirementCounts.get(batchKey) ?? 0) + length)
    }

    if (a.blockType === 'LAB') {
      const blockLength = offering.labBlockLength ?? 3
      if (length !== blockLength) {
        conflicts.push(issue('INVALID_INPUT', `Lab assignment for ${subjectId}/${a.sectionId} is ${length} periods long; required block length is ${blockLength}`, a))
      }
      if (offering.labPeriods % blockLength !== 0) {
        conflicts.push(issue('INVALID_INPUT', `Lab requirement for ${subjectId}/${a.sectionId} is ${offering.labPeriods} periods, which is not divisible by block length ${blockLength}`, a))
      }
      const group = groups.find(g => g.includes(a.startPeriod))
      const spanOk = !!group && group.includes(a.endPeriod) && a.endPeriod <= group[group.length - 1]
      if (!spanOk) {
        conflicts.push(issue('INVALID_INPUT', `Lab block for ${subjectId}/${a.sectionId} on ${a.day} crosses a break or lunch`, a))
      }
      if (!a.labId) {
        conflicts.push(issue('LAB_CONFLICT', `Lab block for ${subjectId}/${a.sectionId} has no physical laboratory assigned`, a))
      } else {
        const compatible = labsBySectionSubject.get(`${a.sectionId}::${subjectId}`) ?? labsBySubject.get(subjectId) ?? []
        if (!compatible.includes(a.labId)) {
          conflicts.push(issue('LAB_CONFLICT', `Lab ${a.labId} is not mapped as compatible with subject ${subjectId}`, a))
        }
        if (!labById.has(a.labId)) {
          conflicts.push(issue('LAB_CONFLICT', `Assignment references unknown laboratory ${a.labId}`, a))
        }
        // For non-batched labs the section is the complete demand. Batched
        // sections need an explicit batch-size model before capacity can be
        // proved exactly, so we deliberately do not guess a batch size.
        if (!a.batch) {
          const capacity = labById.get(a.labId)?.capacity ?? null
          const students = section?.studentCount ?? null
          if (capacity != null && students != null && capacity >= 10 && students > capacity) {
            conflicts.push(issue('LAB_CONFLICT', `Lab ${a.labId} capacity ${capacity} is below section ${a.sectionId} size ${students}`, a))
          }
        }
      }
    }
  }

  // Every scheduled unit must be uniquely represented by its actual placement.
  // Exact duplicates are always invalid even before collision checks.
  const duplicateKeys = new Set<string>()
  const seen = new Set<string>()
  for (const a of assignments) {
    const key = `${a.sectionId}|${a.subjectId ?? a.courseId}|${a.blockType}|${a.batch ?? ''}|${a.day}|${a.startPeriod}|${a.endPeriod}|${a.facultyId}|${a.labId ?? ''}`
    if (seen.has(key)) duplicateKeys.add(key)
    seen.add(key)
  }
  for (const key of duplicateKeys) {
    const a = assignments.find(x => `${x.sectionId}|${x.subjectId ?? x.courseId}|${x.blockType}|${x.batch ?? ''}|${x.day}|${x.startPeriod}|${x.endPeriod}|${x.facultyId}|${x.labId ?? ''}` === key)!
    conflicts.push(issue('DUPLICATE_SCHEDULED_UNIT', `Duplicate scheduled assignment detected for ${a.subjectId ?? a.courseId}/${a.sectionId} on ${a.day} P${a.startPeriod}-${a.endPeriod}`, a))
  }

  for (const [sectionId, slots] of sectionSlots) {
    checkCollisions(slots, conflicts, 'SECTION_CONFLICT', a => `Section ${sectionId} has overlapping assignments on ${a.day} P${a.startPeriod}-${a.endPeriod}`)
  }
  for (const [facultyId, slots] of facultySlots) {
    checkCollisions(slots, conflicts, 'TEACHER_COLLISION', a => `Faculty ${facultyId} is double-booked on ${a.day} P${a.startPeriod}-${a.endPeriod}`)
  }
  // Laboratories may represent a physical lab/centre with more than one
  // simultaneous teaching position. Enforce the declared parallel capacity
  // per lab and per period rather than treating every lab as a single-seat
  // resource. A missing capacity remains conservative at 1.
  for (const [labId, slots] of labSlots) {
    const capacity = labById.get(labId)?.capacity ?? 1
    const usageByDayPeriod = new Map<string, Assignment[]>()
    for (const a of slots) {
      for (let p = a.startPeriod; p <= a.endPeriod; p++) {
        const key = `${a.day}:${p}`
        const arr = usageByDayPeriod.get(key) ?? []
        arr.push(a)
        usageByDayPeriod.set(key, arr)
      }
    }
    for (const [key, arr] of usageByDayPeriod) {
      if (arr.length > capacity) {
        const [day, period] = key.split(':')
        conflicts.push({
          type: 'LAB_CONFLICT',
          message: `Lab ${labId} has ${arr.length} simultaneous assignments on ${day} P${period}, exceeding capacity ${capacity}`,
          sectionId: arr[0]?.sectionId,
          courseId: arr[0] ? (arr[0].subjectId ?? arr[0].courseId) : undefined,
          facultyId: arr[0]?.facultyId,
          day,
          period: Number(period),
        })
      }
    }
  }

  const dailyTotals = new Map<string, number>()
  const weeklyTotals = new Map<string, number>()
  for (const a of assignments) {
    const len = a.endPeriod - a.startPeriod + 1
    dailyTotals.set(`${a.facultyId}:${a.day}`, (dailyTotals.get(`${a.facultyId}:${a.day}`) ?? 0) + len)
    weeklyTotals.set(a.facultyId, (weeklyTotals.get(a.facultyId) ?? 0) + len)
  }
  for (const f of faculty) {
    const weekly = weeklyTotals.get(f.id) ?? 0
    if (weekly > f.maxWeeklyPeriods) conflicts.push({ type: 'FACULTY_SHORTAGE', message: `Faculty ${f.id} is assigned ${weekly} periods/week, exceeding capacity ${f.maxWeeklyPeriods}`, facultyId: f.id })
    for (const day of config.workingDays) {
      const daily = dailyTotals.get(`${f.id}:${day}`) ?? 0
      if (daily > f.maxDailyPeriods) conflicts.push({ type: 'FACULTY_SHORTAGE', message: `Faculty ${f.id} is assigned ${daily} periods on ${day}, exceeding daily capacity ${f.maxDailyPeriods}`, facultyId: f.id, day })
    }
  }

  // These are currently hard scheduling rules in the existing CSP. Keep the
  // validator aligned with that solver until they are made configurable.
  const theoryPerSectionCourseDay = new Map<string, number>()
  const theoryPerSectionCoursePeriod = new Map<string, number>()
  for (const a of assignments) {
    if (a.blockType !== 'THEORY') continue
    const dayKey = `${a.sectionId}::${a.subjectId ?? a.courseId}::${a.day}`
    theoryPerSectionCourseDay.set(dayKey, (theoryPerSectionCourseDay.get(dayKey) ?? 0) + 1)
    const periodKey = `${a.sectionId}::${a.subjectId ?? a.courseId}::${a.startPeriod}`
    theoryPerSectionCoursePeriod.set(periodKey, (theoryPerSectionCoursePeriod.get(periodKey) ?? 0) + 1)
  }
  for (const [key, count] of theoryPerSectionCourseDay) {
    if (count > MAX_SAME_COURSE_PER_DAY) {
      const [sectionId, courseId, day] = key.split('::')
      conflicts.push({ type: 'DAILY_SUBJECT_LIMIT_EXCEEDED', message: `Section ${sectionId} has ${count} theory periods of ${courseId} on ${day}, exceeding ${MAX_SAME_COURSE_PER_DAY}/day`, sectionId, courseId, day })
    }
  }
  for (const [key, count] of theoryPerSectionCoursePeriod) {
    if (count > MAX_SAME_COURSE_SAME_PERIOD_PER_WEEK) {
      const [sectionId, courseId, period] = key.split('::')
      conflicts.push({ type: 'COLUMN_SUBJECT_LIMIT_EXCEEDED', message: `Section ${sectionId} has ${courseId} in period ${period} on ${count} days, exceeding ${MAX_SAME_COURSE_SAME_PERIOD_PER_WEEK}/week`, sectionId, courseId, period: Number(period) })
    }
  }

  // Exact completeness. Batched labs intentionally multiply the lab demand by
  // the number of declared batches because each batch is a parallel demand stream.
  for (const offering of sectionSubjects) {
    const counts = requirementCounts.get(String(offering.id)) ?? { theory: 0, lab: 0 }
    const batchNames = [...new Set(teachingAssignments.filter(ta => ta.sectionSubjectId === offering.id && ta.component === 'LAB' && ta.batch).map(ta => ta.batch!))]
    const expectedLab = offering.labPeriods * (batchNames.length || 1)
    if (counts.theory !== offering.theoryPeriods || counts.lab !== expectedLab) {
      conflicts.push({ type: 'WEEKLY_REQUIREMENT_UNSATISFIED', message: `Section ${offering.sectionId} / subject ${offering.subjectId} requires ${offering.theoryPeriods} theory + ${expectedLab} lab periods/week, but scheduled ${counts.theory} theory + ${counts.lab} lab`, sectionId: offering.sectionId, courseId: offering.subjectId })
    }
    for (const batch of batchNames) {
      const scheduled = batchRequirementCounts.get(`${offering.id}::${batch}`) ?? 0
      if (scheduled !== offering.labPeriods) {
        conflicts.push({ type: 'WEEKLY_REQUIREMENT_UNSATISFIED', message: `Batch ${batch} of ${offering.sectionId}/${offering.subjectId} requires ${offering.labPeriods} lab periods/week, but scheduled ${scheduled}`, sectionId: offering.sectionId, courseId: offering.subjectId })
      }
    }
  }

  return dedupeConflicts(conflicts)
}

function pushSlot(map: Map<string, Assignment[]>, key: string, a: Assignment) {
  const arr = map.get(key) ?? []
  arr.push(a)
  map.set(key, arr)
}

function issue(type: Conflict['type'], message: string, a: Assignment, period?: number): Conflict {
  return { type, message, sectionId: a.sectionId, courseId: a.subjectId ?? a.courseId, facultyId: a.facultyId, day: a.day, period }
}

function checkCollisions(
  slots: Assignment[],
  conflicts: Conflict[],
  type: Conflict['type'],
  message: (a: Assignment) => string
) {
  const byDay = new Map<string, Assignment[]>()
  for (const a of slots) {
    const arr = byDay.get(a.day) ?? []
    arr.push(a)
    byDay.set(a.day, arr)
  }
  for (const ranges of byDay.values()) {
    ranges.sort((x, y) => x.startPeriod - y.startPeriod || x.endPeriod - y.endPeriod)
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].startPeriod <= ranges[i - 1].endPeriod) {
        conflicts.push(issue(type, message(ranges[i]), ranges[i], ranges[i].startPeriod))
      }
    }
  }
}

function dedupeConflicts(conflicts: Conflict[]): Conflict[] {
  const seen = new Set<string>()
  return conflicts.filter(c => {
    const key = `${c.type}|${c.sectionId ?? ''}|${c.courseId ?? ''}|${c.facultyId ?? ''}|${c.day ?? ''}|${c.period ?? ''}|${c.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
