import type { Faculty, SectionSubject, SchedulableUnit, Subject, TeachingAssignment } from '../types.js'

export interface CanonicalExpansionInput {
  sectionSubjects: SectionSubject[]
  subjects: Map<string, Subject>
  teachingAssignments: TeachingAssignment[]
  faculty: Map<string, Faculty>
  labsBySubject: Map<string, string[]>
  labsBySectionSubject?: Map<string, string[]>
}

// Convert canonical academic requirements into atomic solver variables.
// Faculty assignments without a batch are alternatives: the solver chooses
// the teacher for each occurrence. Distinct LAB batches are parallel demand
// streams, so each declared batch receives the offering's lab requirement.
export function expandRequirements(input: CanonicalExpansionInput): SchedulableUnit[] {
  const byComponent = new Map<string, TeachingAssignment[]>()
  for (const ta of input.teachingAssignments) {
    const key = `${ta.sectionSubjectId}::${ta.component}`
    const arr = byComponent.get(key) ?? []
    arr.push(ta)
    byComponent.set(key, arr)
  }

  const units: SchedulableUnit[] = []
  for (const offering of input.sectionSubjects) {
    const subject = input.subjects.get(offering.subjectId)
    if (!subject) continue
    const theoryAssignments = byComponent.get(`${offering.id}::THEORY`) ?? []
    const labAssignments = byComponent.get(`${offering.id}::LAB`) ?? []
    const theoryFaculty = [...new Set(theoryAssignments.map(a => a.facultyId).filter(id => input.faculty.has(id)))]
    const batches = [...new Set(labAssignments.map(a => a.batch).filter((b): b is string => !!b))]
    const labFacultyDefault = [...new Set(labAssignments.filter(a => !a.batch).map(a => a.facultyId).filter(id => input.faculty.has(id)))]
    const labBatches = batches.length ? batches : [null]
    const labBlock = offering.labBlockLength ?? 3
    const specificLabs = input.labsBySectionSubject?.get(`${offering.sectionId}::${offering.subjectId}`) ?? []
    const labs = specificLabs.length > 0 ? specificLabs : (input.labsBySubject.get(offering.subjectId) ?? [])

    for (let i = 0; i < offering.theoryPeriods; i++) {
      units.push({
        unitId: `${offering.sectionId}:${offering.subjectId}:THEORY:${i}`,
        sectionId: offering.sectionId,
        courseId: offering.subjectId,
        subjectId: offering.subjectId,
        sectionSubjectId: offering.id,
        facultyIds: theoryFaculty,
        blockType: 'THEORY',
        length: 1,
      })
    }

    for (const batch of labBatches) {
      const batchFaculty = batch
        ? [...new Set(labAssignments.filter(a => a.batch === batch).map(a => a.facultyId).filter(id => input.faculty.has(id)))]
        : labFacultyDefault
      const facultyIds = batchFaculty.length ? batchFaculty : labFacultyDefault
      for (let i = 0; i < offering.labPeriods / labBlock; i++) {
        units.push({
          unitId: `${offering.sectionId}:${offering.subjectId}:LAB:${batch ?? 'ALL'}:${i}`,
          sectionId: offering.sectionId,
          courseId: offering.subjectId,
          subjectId: offering.subjectId,
          sectionSubjectId: offering.id,
          facultyIds,
          blockType: 'LAB',
          length: labBlock,
          batch,
          labIds: labs,
        })
      }
    }
  }
  return units
}
