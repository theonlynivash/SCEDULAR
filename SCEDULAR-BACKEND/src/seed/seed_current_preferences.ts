import 'dotenv/config'
// Mirrors the CURRENT teaching allocation into faculty subject preferences.
// For every teacher, each subject they teach in the current academic cycle
// becomes an APPROVED preference (requestedSections = sections they handle),
// so the teacher login, the HOD board and the real TeachingAssignments agree.
// Idempotent: replaces all preferences of the current cycle's semesters.
import { ensureInitialized } from '../db/client.js'
import { getLocalDb, saveLocalDbSync } from '../db/localDb.js'
import {
  getCurrentAcademicCycle, listSubjects, listSectionSubjects, listTeachingAssignments, saveFacultyPreferences,
} from '../db/repo.js'
import { semesterInCycle } from '../utils/academicCycle.js'

async function main() {
  await ensureInitialized()
  const cycle = await getCurrentAcademicCycle()
  const [subjects, sectionSubjects, assignments] = await Promise.all([listSubjects(), listSectionSubjects(), listTeachingAssignments()])
  const subById = new Map(subjects.map(s => [s.id, s]))
  const ssById = new Map(sectionSubjects.map(s => [s.id, s]))

  const byFaculty = new Map<string, Map<string, Set<string>>>()
  for (const ta of assignments) {
    const ss = ssById.get(ta.sectionSubjectId)
    const sub = ss && subById.get(ss.subjectId)
    if (!ss || !sub || !semesterInCycle(sub.semester, cycle)) continue
    const subs = byFaculty.get(ta.facultyId) ?? new Map<string, Set<string>>()
    subs.set(sub.id, (subs.get(sub.id) ?? new Set()).add(ss.sectionId))
    byFaculty.set(ta.facultyId, subs)
  }

  const db = getLocalDb()
  db.facultyPreferences = db.facultyPreferences.filter(p => !semesterInCycle(p.semester, cycle))

  let total = 0
  for (const [facultyId, subs] of [...byFaculty.entries()].sort()) {
    const items = [...subs.entries()]
      .map(([subjectId, secs]) => ({ sub: subById.get(subjectId)!, sections: secs.size }))
      .sort((a, b) => b.sections - a.sections || a.sub.code.localeCompare(b.sub.code))
      .map((x, i) => ({
        subjectId: x.sub.id,
        academicYear: x.sub.year!,
        semester: x.sub.semester!,
        preferenceRank: i + 1,
        requestedSections: x.sections,
        labConfirmed: true,
      }))
    await saveFacultyPreferences(facultyId, items, 'APPROVED')
    for (const p of db.facultyPreferences.filter(x => x.facultyId === facultyId && x.status === 'APPROVED')) {
      p.reviewedAt = new Date().toISOString(); p.reviewedBy = 'FAC-001'; p.submittedAt = p.submittedAt ?? p.reviewedAt
    }
    total += items.length
  }
  saveLocalDbSync()
  console.log(`Cycle ${cycle}: ${total} APPROVED preferences for ${byFaculty.size} teachers.`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
