import type { CanonicalImportDataset, ImportDiagnostic } from './types.js'

function duplicates(values: string[]): string[] {
  const seen = new Set<string>(), dup = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) dup.add(value)
    seen.add(value)
  }
  return [...dup]
}

export function validateDataset(dataset: CanonicalImportDataset): { errors: ImportDiagnostic[]; warnings: ImportDiagnostic[] } {
  const errors: ImportDiagnostic[] = []
  const warnings: ImportDiagnostic[] = []
  const add = (d: ImportDiagnostic) => (d.severity === 'ERROR' ? errors : warnings).push(d)

  for (const [entity, ids] of [
    ['SECTION', dataset.sections.map(x => x.id)],
    ['SUBJECT', dataset.subjects.map(x => x.id)],
    ['FACULTY', dataset.faculty.map(x => x.id)],
    ['LAB', dataset.labs.map(x => x.id)],
  ] as const) {
    for (const id of duplicates(ids)) add({ code: `DUPLICATE_${entity}`, severity: 'ERROR', entity, entityId: id, message: `Duplicate ${entity.toLowerCase()} id "${id}".` })
  }

  const sectionSet = new Set(dataset.sections.map(x => x.id))
  const subjectMap = new Map(dataset.subjects.map(x => [x.id, x]))
  const facultySet = new Set(dataset.faculty.map(x => x.id))
  const labSet = new Set(dataset.labs.map(x => x.id))
  const offeringKeys = new Set<string>()
  const offerings = new Map<string, typeof dataset.sectionSubjects[number]>()

  for (const offering of dataset.sectionSubjects) {
    const key = `${offering.sectionId}::${offering.subjectId}`
    if (offeringKeys.has(key)) add({ code: 'DUPLICATE_SECTION_SUBJECT', severity: 'ERROR', entity: 'SECTION_SUBJECT', entityId: key, message: `Duplicate section-subject requirement "${key}".` })
    offeringKeys.add(key)
    offerings.set(key, offering)
    if (!sectionSet.has(offering.sectionId)) add({ code: 'SECTION_NOT_FOUND', severity: 'ERROR', entity: 'SECTION_SUBJECT', entityId: offering.sectionId, message: `Section "${offering.sectionId}" is referenced but does not exist.` })
    const subject = subjectMap.get(offering.subjectId)
    if (!subject) {
      add({ code: 'SUBJECT_NOT_FOUND', severity: 'ERROR', entity: 'SECTION_SUBJECT', entityId: offering.subjectId, message: `Subject "${offering.subjectId}" is referenced but does not exist.` })
      continue
    }
    if (subject.deliveryType === 'THEORY' && offering.labPeriods > 0) add({ code: 'THEORY_SUBJECT_HAS_LAB', severity: 'ERROR', entity: 'SUBJECT', entityId: subject.id, message: `THEORY subject "${subject.name}" cannot require lab periods.` })
    if (subject.deliveryType === 'LAB' && offering.theoryPeriods > 0) add({ code: 'LAB_SUBJECT_HAS_THEORY', severity: 'ERROR', entity: 'SUBJECT', entityId: subject.id, message: `LAB subject "${subject.name}" cannot require theory periods.` })
    if (subject.deliveryType === 'INTEGRATED' && (offering.theoryPeriods === 0 || offering.labPeriods === 0)) add({ code: 'INTEGRATED_REQUIREMENT_INCOMPLETE', severity: 'ERROR', entity: 'SECTION_SUBJECT', entityId: key, message: `INTEGRATED subject "${subject.name}" must have both theory and lab periods.` })
  }

  const assignmentKeys = new Set<string>()
  const assignmentCount = new Map<string, number>()
  for (const a of dataset.teachingAssignments) {
    const key = `${a.sectionId}::${a.subjectId}`
    const unique = `${a.facultyId}::${key}::${a.component}::${a.batch ?? ''}`
    if (assignmentKeys.has(unique)) add({ code: 'DUPLICATE_TEACHING_ASSIGNMENT', severity: 'ERROR', entityId: unique, message: `Duplicate teaching assignment "${unique}".` })
    assignmentKeys.add(unique)
    if (!facultySet.has(a.facultyId)) add({ code: 'FACULTY_NOT_FOUND', severity: 'ERROR', entityId: a.facultyId, message: `Faculty "${a.facultyId}" is referenced by a teaching assignment but does not exist.` })
    if (!sectionSet.has(a.sectionId)) add({ code: 'SECTION_NOT_FOUND', severity: 'ERROR', entityId: a.sectionId, message: `Section "${a.sectionId}" is referenced by a teaching assignment but does not exist.` })
    const subject = subjectMap.get(a.subjectId)
    if (!subject) add({ code: 'SUBJECT_NOT_FOUND', severity: 'ERROR', entityId: a.subjectId, message: `Subject "${a.subjectId}" is referenced by a teaching assignment but does not exist.` })
    if (!offerings.has(key)) add({ code: 'SECTION_SUBJECT_NOT_FOUND', severity: 'ERROR', entityId: key, message: `Teaching assignment references ${key}, but no SECTION_SUBJECTS requirement exists.` })
    const offering = offerings.get(key)
    if (offering) {
      const required = a.component === 'THEORY' ? offering.theoryPeriods : offering.labPeriods
      if (required === 0) add({ code: 'ASSIGNMENT_COMPONENT_NOT_REQUIRED', severity: 'ERROR', entityId: unique, message: `${a.component} assignment exists for ${key}, but that component has zero required periods.` })
    }
    assignmentCount.set(`${key}::${a.component}`, (assignmentCount.get(`${key}::${a.component}`) ?? 0) + 1)
  }

  for (const [key, offering] of offerings) {
    if (offering.theoryPeriods > 0 && !assignmentCount.has(`${key}::THEORY`)) add({ code: 'MISSING_THEORY_FACULTY', severity: 'ERROR', entityId: key, message: `No THEORY teaching assignment exists for ${key}.` })
    if (offering.labPeriods > 0 && !assignmentCount.has(`${key}::LAB`)) add({ code: 'MISSING_LAB_FACULTY', severity: 'ERROR', entityId: key, message: `No LAB teaching assignment exists for ${key}.` })
  }

  const mappingKeys = new Set<string>()
  for (const m of dataset.labMappings) {
    const key = `${m.labId}::${m.subjectId}::${m.sectionId ?? ''}`
    if (mappingKeys.has(key)) add({ code: 'DUPLICATE_LAB_MAPPING', severity: 'ERROR', entityId: key, message: `Duplicate lab mapping "${key}".` })
    mappingKeys.add(key)
    if (!labSet.has(m.labId)) add({ code: 'LAB_NOT_FOUND', severity: 'ERROR', entityId: m.labId, message: `Lab "${m.labId}" is referenced by LAB_MAPPING but does not exist.` })
    if (!subjectMap.has(m.subjectId)) add({ code: 'SUBJECT_NOT_FOUND', severity: 'ERROR', entityId: m.subjectId, message: `Subject "${m.subjectId}" is referenced by LAB_MAPPING but does not exist.` })
    if (m.sectionId && !sectionSet.has(m.sectionId)) add({ code: 'SECTION_NOT_FOUND', severity: 'ERROR', entity: 'LAB_MAPPING', entityId: m.sectionId, message: `Section "${m.sectionId}" is referenced by LAB_MAPPING but does not exist.` })
  }

  for (const offering of dataset.sectionSubjects) {
    if (offering.labPeriods <= 0) continue
    const subject = subjectMap.get(offering.subjectId)
    const specific = dataset.labMappings.filter(m => m.subjectId === offering.subjectId && m.sectionId === offering.sectionId && labSet.has(m.labId))
    const global = dataset.labMappings.filter(m => m.subjectId === offering.subjectId && !m.sectionId && labSet.has(m.labId))
    const compatible = specific.length > 0 ? specific : global
    if (specific.length > 0 && global.length > 0) {
      add({ code: 'GLOBAL_LAB_MAPPING_IGNORED', severity: 'WARNING', entity: 'SECTION_SUBJECT', entityId: `${offering.sectionId}::${offering.subjectId}`, message: `Section-specific lab mappings exist for ${offering.sectionId}/${offering.subjectId}; global mappings for the same subject will be ignored for this section.` })
    }
    if (compatible.length === 0) add({ code: 'LAB_MAPPING_MISSING', severity: 'ERROR', entity: 'SECTION_SUBJECT', entityId: `${offering.sectionId}::${offering.subjectId}`, message: `Lab requirement for "${subject?.name ?? offering.subjectId}" has no compatible laboratory mapping for section ${offering.sectionId}.` })
    const section = dataset.sections.find(s => s.id === offering.sectionId)
    if (section?.studentCount != null) {
      const capacities = compatible.map(m => dataset.labs.find(l => l.id === m.labId)?.capacity).filter((x): x is number => x != null)
      if (capacities.length > 0 && Math.max(...capacities) < section.studentCount && Math.max(...capacities) >= 10) add({ code: 'LAB_CAPACITY_INSUFFICIENT', severity: 'ERROR', entityId: `${offering.sectionId}::${offering.subjectId}`, message: `No compatible lab has capacity for section ${offering.sectionId} (${section.studentCount} students).` })
    }
  }

  for (const u of dataset.facultyUnavailability) {
    const key = `${u.facultyId}::${u.day}::${u.period}`
    if (!facultySet.has(u.facultyId)) add({ code: 'FACULTY_NOT_FOUND', severity: 'ERROR', entityId: u.facultyId, message: `Faculty "${u.facultyId}" is referenced by FACULTY_UNAVAILABILITY but does not exist.` })
    if (dataset.facultyUnavailability.filter(x => `${x.facultyId}::${x.day}::${x.period}` === key).length > 1) add({ code: 'DUPLICATE_UNAVAILABILITY', severity: 'ERROR', entityId: key, message: `Duplicate faculty-unavailability slot "${key}".` })
  }

  // A warning rather than an error: the dataset may still be schedulable when a
  // faculty member's stated weekly cap is close to their assigned demand because
  // parallel batches or future solver semantics can affect actual occupancy.
  for (const faculty of dataset.faculty) {
    const assigned = dataset.teachingAssignments.filter(a => a.facultyId === faculty.id)
    if (assigned.length > faculty.maxWeeklyPeriods) add({ code: 'FACULTY_ASSIGNMENT_COUNT_HIGH', severity: 'WARNING', entity: 'FACULTY', entityId: faculty.id, message: `Faculty "${faculty.name}" has ${assigned.length} teaching-assignment rows against a weekly cap of ${faculty.maxWeeklyPeriods}.` })
  }

  return { errors, warnings }
}
