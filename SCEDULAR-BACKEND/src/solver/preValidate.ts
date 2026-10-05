import type { Conflict, Faculty, FacultyUnavailability, ScheduleConfig, Section, SectionSubject, Subject, TeachingAssignment } from '../types.js'
import { contiguousGroups } from '../utils/grid.js'

export interface CanonicalPreValidationInput {
  faculty: Faculty[]
  sections: Section[]
  subjects: Subject[]
  sectionSubjects: SectionSubject[]
  teachingAssignments: TeachingAssignment[]
  unavailability: FacultyUnavailability[]
  config: ScheduleConfig
  labsBySubject: Map<string, string[]>
  labsBySectionSubject?: Map<string, string[]>
}

// Stage 3: validate the canonical scheduling model immediately before it is
// expanded into solver units. This deliberately knows nothing about Excel or
// the legacy Course tables.
export function preValidate(input: CanonicalPreValidationInput): Conflict[] {
  const labsBySectionSubject = input.labsBySectionSubject ?? new Map<string, string[]>()
  const conflicts: Conflict[] = []
  const facultyIds = new Set(input.faculty.map(f => f.id))
  const sectionIds = new Set(input.sections.map(s => s.id))
  const subjectIds = new Set(input.subjects.map(s => s.id))
  const facultyById = new Map(input.faculty.map(f => [f.id, f]))
  const offeringById = new Map(input.sectionSubjects.map(s => [s.id, s]))
  const groups = contiguousGroups(input.config.periods)
  const maxContiguousRun = groups.length ? Math.max(...groups.map(g => g.length)) : 0
  const slotSet = new Set<string>()
  for (const day of input.config.workingDays) {
    for (const p of input.config.periods) if (p.schedulable) slotSet.add(`${day}:${p.index}`)
  }

  const offeringSeen = new Set<string>()
  for (const o of input.sectionSubjects) {
    const key = `${o.sectionId}::${o.subjectId}`
    if (offeringSeen.has(key)) conflicts.push({ type: 'INVALID_INPUT', message: `Duplicate section-subject requirement ${key}`, sectionId: o.sectionId, courseId: o.subjectId })
    offeringSeen.add(key)
    if (!sectionIds.has(o.sectionId)) conflicts.push({ type: 'INVALID_INPUT', message: `Section-subject references unknown section ${o.sectionId}`, sectionId: o.sectionId, courseId: o.subjectId })
    if (!subjectIds.has(o.subjectId)) conflicts.push({ type: 'INVALID_INPUT', message: `Section-subject references unknown subject ${o.subjectId}`, sectionId: o.sectionId, courseId: o.subjectId })
    if (o.theoryPeriods < 0 || o.labPeriods < 0 || (o.theoryPeriods === 0 && o.labPeriods === 0)) conflicts.push({ type: 'INVALID_INPUT', message: `Section-subject ${key} must have a positive theory or lab requirement`, sectionId: o.sectionId, courseId: o.subjectId })
    if (o.labPeriods > 0) {
      const block = o.labBlockLength ?? 3
      if (block <= 0 || o.labPeriods % block !== 0) conflicts.push({ type: 'INVALID_INPUT', message: `Lab requirement for ${key} must be a multiple of block length ${block}`, sectionId: o.sectionId, courseId: o.subjectId })
      if (block > maxContiguousRun) conflicts.push({ type: 'INVALID_INPUT', message: `Lab block ${block} for ${key} cannot fit the configured schedule grid`, sectionId: o.sectionId, courseId: o.subjectId })
      const specificLabs = labsBySectionSubject.get(`${o.sectionId}::${o.subjectId}`) ?? []
      const globalLabs = input.labsBySubject.get(o.subjectId) ?? []
      if (specificLabs.length === 0 && globalLabs.length === 0) conflicts.push({ type: 'INVALID_INPUT', message: `No laboratory is mapped to subject ${o.subjectId} for section ${o.sectionId}`, sectionId: o.sectionId, courseId: o.subjectId })
    }
  }

  const assignmentsByOfferingComponent = new Map<string, TeachingAssignment[]>()
  const taSeen = new Set<string>()
  for (const ta of input.teachingAssignments) {
    const offering = offeringById.get(ta.sectionSubjectId)
    const key = `${ta.sectionSubjectId}::${ta.component}::${ta.batch ?? ''}`
    if (taSeen.has(key + `::${ta.facultyId}`)) conflicts.push({ type: 'INVALID_INPUT', message: `Duplicate teaching assignment ${key} for faculty ${ta.facultyId}`, facultyId: ta.facultyId })
    taSeen.add(key + `::${ta.facultyId}`)
    if (!facultyIds.has(ta.facultyId)) conflicts.push({ type: 'INVALID_INPUT', message: `Teaching assignment references unknown faculty ${ta.facultyId}`, facultyId: ta.facultyId })
    if (!offering) {
      conflicts.push({ type: 'INVALID_INPUT', message: `Teaching assignment references unknown section-subject ${ta.sectionSubjectId}` })
      continue
    }
    const arr = assignmentsByOfferingComponent.get(`${ta.sectionSubjectId}::${ta.component}`) ?? []
    arr.push(ta)
    assignmentsByOfferingComponent.set(`${ta.sectionSubjectId}::${ta.component}`, arr)
  }

  for (const o of input.sectionSubjects) {
    for (const component of ['THEORY', 'LAB'] as const) {
      const required = component === 'THEORY' ? o.theoryPeriods : o.labPeriods
      if (required <= 0) continue
      const eligible = assignmentsByOfferingComponent.get(`${o.id}::${component}`) ?? []
      if (eligible.length === 0) {
        conflicts.push({ type: 'INVALID_INPUT', message: `No faculty assignment exists for ${component} of ${o.sectionId}/${o.subjectId}`, sectionId: o.sectionId, courseId: o.subjectId })
      }
      const seenBatches = new Set<string>()
      for (const ta of eligible) {
        if (ta.batch != null && ta.batch !== '') seenBatches.add(ta.batch)
      }
      if (component === 'LAB' && seenBatches.size > 1) {
        const section = input.sections.find(s => s.id === o.sectionId)
        if (!section) continue
        // Parallel batches intentionally each receive the declared lab demand.
        const compatible = labsBySectionSubject.get(`${o.sectionId}::${o.subjectId}`) ?? input.labsBySubject.get(o.subjectId) ?? []
        if (compatible.length < seenBatches.size) {
          conflicts.push({ type: 'LAB_CONFLICT', message: `${o.sectionId}/${o.subjectId} declares ${seenBatches.size} lab batches but only ${compatible.length} compatible lab(s) exist`, sectionId: o.sectionId, courseId: o.subjectId })
        }
      }
      for (const ta of eligible) {
        const f = facultyById.get(ta.facultyId)
        if (!f) continue
        if (required > f.maxWeeklyPeriods && !ta.batch) conflicts.push({ type: 'FACULTY_SHORTAGE', message: `Faculty ${f.id} has capacity ${f.maxWeeklyPeriods}, below the ${required}-period requirement of ${o.subjectId}`, facultyId: f.id, courseId: o.subjectId, sectionId: o.sectionId })
      }
    }
  }

  for (const u of input.unavailability) {
    if (!facultyIds.has(u.facultyId)) conflicts.push({ type: 'INVALID_INPUT', message: `Faculty unavailability references unknown faculty ${u.facultyId}`, facultyId: u.facultyId })
    if (!slotSet.has(`${u.day}:${u.period}`)) conflicts.push({ type: 'INVALID_INPUT', message: `Faculty unavailability references non-schedulable or unknown slot ${u.day} P${u.period}`, facultyId: u.facultyId, day: u.day, period: u.period })
  }
  return conflicts
}
