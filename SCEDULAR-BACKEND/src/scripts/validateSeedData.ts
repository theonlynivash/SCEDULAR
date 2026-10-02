/**
 * Pre-import validation script for SCEDULAR seed data.
 * Run: npx tsx src/scripts/validateSeedData.ts
 *
 * Checks all seed data sources for completeness per semester and reports
 * exactly what's ready, what's partially filled, and what's missing.
 */

import { REAL_FACULTY_ROSTER } from '../seed/facultyRoster.js'
import { REGULATION_2024_CURRICULUM } from '../seed/curriculumRoster.js'
import { KNOWN_SECTIONS_ROSTER, KNOWN_LABS_ROSTER, KNOWN_LAB_MAPPINGS } from '../seed/resourceRoster.js'
import { CONFIRMED_TEACHING_ASSIGNMENTS_ODD } from '../seed/confirmedTeachingAssignments.js'
import { CONFIRMED_LAB_MAPPINGS_ODD } from '../seed/confirmedLabMappings.js'

type SemesterKey = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII'
type YearKey = 'Year 1' | 'Year 2' | 'Year 3' | 'Year 4'

interface SemesterAudit {
  year: YearKey
  semester: SemesterKey
  sectionCount: number
  subjectCount: number
  sectionSubjectCount: number
  teachingAssignmentCount: number
  labMappingCount: number
  untaughtSubjects: string[]
  unmappedLabSubjects: string[]
  unresolvedFaculty: string[]
  unresolvedSubjects: string[]
  canGenerate: boolean
  blockers: string[]
}

const ALL_SEMESTERS: Array<{ year: YearKey; semester: SemesterKey }> = [
  { year: 'Year 1', semester: 'I' },
  { year: 'Year 1', semester: 'II' },
  { year: 'Year 2', semester: 'III' },
  { year: 'Year 2', semester: 'IV' },
  { year: 'Year 3', semester: 'V' },
  { year: 'Year 3', semester: 'VI' },
  { year: 'Year 4', semester: 'VII' },
  { year: 'Year 4', semester: 'VIII' },
]

function audit(): SemesterAudit[] {
  const facultyIds = new Set(REAL_FACULTY_ROSTER.map(f => f.id))
  const subjectCodeToId = new Map(REGULATION_2024_CURRICULUM.map(s => [s.code, s.id]))
  const subjectIdToMeta = new Map(REGULATION_2024_CURRICULUM.map(s => [s.id, s]))

  const sectionsBySem = new Map<string, typeof KNOWN_SECTIONS_ROSTER>()
  for (const sec of KNOWN_SECTIONS_ROSTER) {
    const key = `${sec.year}::${sec.semester}`
    const arr = sectionsBySem.get(key) ?? []
    arr.push(sec)
    sectionsBySem.set(key, arr)
  }

  const subjectsBySem = new Map<string, typeof REGULATION_2024_CURRICULUM>()
  for (const sub of REGULATION_2024_CURRICULUM) {
    const key = `${sub.year}::${sub.semester}`
    const arr = subjectsBySem.get(key) ?? []
    arr.push(sub)
    subjectsBySem.set(key, arr)
  }

  // Build section_subject index (same derivation as deriveCanonicalSectionSubjects)
  const sectionSubjectsBySem = new Map<string, Array<{ sectionId: string; subjectId: string; subjectCode: string }>>()
  for (const sec of KNOWN_SECTIONS_ROSTER) {
    if (!sec.active) continue
    const key = `${sec.year}::${sec.semester}`
    const subs = subjectsBySem.get(key) ?? []
    const arr = sectionSubjectsBySem.get(key) ?? []
    for (const sub of subs) {
      arr.push({ sectionId: sec.id, subjectId: sub.id, subjectCode: sub.code })
    }
    sectionSubjectsBySem.set(key, arr)
  }

  // Build teaching assignment index
  const taBySectionSubject = new Map<string, typeof CONFIRMED_TEACHING_ASSIGNMENTS_ODD>()
  for (const ta of CONFIRMED_TEACHING_ASSIGNMENTS_ODD) {
    const subId = subjectCodeToId.get(ta.subjectCode)
    if (!subId) continue
    const key = `${ta.sectionId}::${subId}::${ta.component}`
    const arr = taBySectionSubject.get(key) ?? []
    arr.push(ta)
    taBySectionSubject.set(key, arr)
  }

  // Build lab mapping index (confirmed + resource roster)
  const labMappingBySectionSubject = new Map<string, Array<{ labId: string }>>()
  const allLabMappings = [
    ...KNOWN_LAB_MAPPINGS.map(m => ({ labId: m.labId, subjectCode: m.subjectCode, sectionId: m.sectionId })),
    ...CONFIRMED_LAB_MAPPINGS_ODD.map(m => ({ labId: m.labId, subjectCode: m.subjectCode, sectionId: m.sectionId })),
  ]
  for (const lm of allLabMappings) {
    const subId = subjectCodeToId.get(lm.subjectCode)
    if (!subId) continue
    const key = `${lm.sectionId}::${subId}`
    const arr = labMappingBySectionSubject.get(key) ?? []
    arr.push({ labId: lm.labId })
    labMappingBySectionSubject.set(key, arr)
  }

  const results: SemesterAudit[] = []

  for (const { year, semester } of ALL_SEMESTERS) {
    const key = `${year}::${semester}`
    const sections = sectionsBySem.get(key) ?? []
    const activeSections = sections.filter(s => s.active)
    const subjects = subjectsBySem.get(key) ?? []
    const sectionSubjects = sectionSubjectsBySem.get(key) ?? []

    const unresolvedFaculty: string[] = []
    const unresolvedSubjects: string[] = []
    const untaughtSubjects: string[] = []
    const unmappedLabSubjects: string[] = []
    const blockers: string[] = []

    // Check teaching assignments for each section-subject
    const taughtSubjects = new Set<string>()
    for (const ss of sectionSubjects) {
      const taKey = `${ss.sectionId}::${ss.subjectId}::THEORY`
      const taKeyLab = `${ss.sectionId}::${ss.subjectId}::LAB`
      const hasTheory = taBySectionSubject.has(taKey)
      const hasLab = taBySectionSubject.has(taKeyLab)

      const subj = subjectIdToMeta.get(ss.subjectId)
      if (!subj) continue

      // Determine scheduling behavior from deliveryType, NOT category.
      // Category (curriculum taxonomy) and deliveryType are independent axes —
      // deliveryType alone decides whether THEORY/LAB teaching assignments
      // are required. PROJECT delivery is a non-schedulable placeholder.
      if (subj.deliveryType === 'THEORY') {
        if (!hasTheory) untaughtSubjects.push(`${ss.sectionId}/${subj.code} (${subj.name})`)
        else taughtSubjects.add(`${ss.sectionId}::${ss.subjectId}`)
      } else if (subj.deliveryType === 'INTEGRATED') {
        if (!hasTheory) untaughtSubjects.push(`${ss.sectionId}/${subj.code} THEORY (${subj.name})`)
        if (!hasLab) untaughtSubjects.push(`${ss.sectionId}/${subj.code} LAB (${subj.name})`)
        if (hasTheory || hasLab) taughtSubjects.add(`${ss.sectionId}::${ss.subjectId}`)
      } else if (subj.deliveryType === 'LAB') {
        if (!hasLab) untaughtSubjects.push(`${ss.sectionId}/${subj.code} LAB (${subj.name})`)
        else taughtSubjects.add(`${ss.sectionId}::${ss.subjectId}`)
      } else if (subj.deliveryType === 'PROJECT') {
        // PROJECT delivery is a non-schedulable placeholder — no TA required
        taughtSubjects.add(`${ss.sectionId}::${ss.subjectId}`)
      }

      // Check lab mappings for INTEGRATED and LAB subjects
      if (subj.deliveryType === 'INTEGRATED' || subj.deliveryType === 'LAB') {
        if (subj.labPeriods > 0) {
          const lmKey = `${ss.sectionId}::${ss.subjectId}`
          const hasMapping = labMappingBySectionSubject.has(lmKey)
          if (!hasMapping) {
            unmappedLabSubjects.push(`${ss.sectionId}/${subj.code} (${subj.name})`)
          }
        }
      }
    }

    // Check faculty resolution
    for (const ta of CONFIRMED_TEACHING_ASSIGNMENTS_ODD) {
      const subId = subjectCodeToId.get(ta.subjectCode)
      const sectionMatch = activeSections.find(s => s.id === ta.sectionId)
      if (sectionMatch && subId) {
        if (!facultyIds.has(ta.facultyId)) {
          unresolvedFaculty.push(ta.facultyId)
        }
      }
    }

    // Check subject code resolution
    for (const ta of CONFIRMED_TEACHING_ASSIGNMENTS_ODD) {
      const subId = subjectCodeToId.get(ta.subjectCode)
      const sectionMatch = activeSections.find(s => s.id === ta.sectionId)
      if (sectionMatch && !subId) {
        unresolvedSubjects.push(ta.subjectCode)
      }
    }

    // Determine canGenerate
    const hasSections = activeSections.length > 0
    const hasSubjects = subjects.length > 0
    const hasFaculty = REAL_FACULTY_ROSTER.length > 0
    const hasLabs = KNOWN_LABS_ROSTER.length > 0
    const hasConfig = true // schedule config is always set
    const allSubjectsTaught = untaughtSubjects.length === 0 && sectionSubjects.length > 0
    const allLabsMapped = unmappedLabSubjects.length === 0

    if (!hasSections) blockers.push('No active sections')
    if (!hasSubjects) blockers.push('No subjects in curriculum')
    if (!hasFaculty) blockers.push('Faculty roster empty')
    if (!hasLabs) blockers.push('No lab rooms configured')
    if (!allSubjectsTaught) blockers.push(`${untaughtSubjects.length} subject(s) missing teaching assignments`)
    if (!allLabsMapped) blockers.push(`${unmappedLabSubjects.length} subject(s) missing lab mappings`)

    results.push({
      year,
      semester,
      sectionCount: activeSections.length,
      subjectCount: subjects.length,
      sectionSubjectCount: sectionSubjects.length,
      teachingAssignmentCount: sectionSubjects.filter(ss => taughtSubjects.has(`${ss.sectionId}::${ss.subjectId}`)).length,
      labMappingCount: [...labMappingBySectionSubject.keys()].filter(k => k.includes(`::`)).length,
      untaughtSubjects: [...new Set(untaughtSubjects)],
      unmappedLabSubjects: [...new Set(unmappedLabSubjects)],
      unresolvedFaculty: [...new Set(unresolvedFaculty)],
      unresolvedSubjects: [...new Set(unresolvedSubjects)],
      canGenerate: blockers.length === 0,
      blockers,
    })
  }

  return results
}

// Run
console.log('═'.repeat(70))
console.log('  SCEDULAR SEED DATA VALIDATION REPORT')
console.log('═'.repeat(70))
console.log()

const results = audit()

for (const r of results) {
  const icon = r.canGenerate ? '✅' : r.sectionCount > 0 ? '⚠️' : '❌'
  console.log(`${icon} ${r.year} / Semester ${r.semester}`)
  console.log(`   Sections: ${r.sectionCount} | Subjects: ${r.subjectCount} | Section-Subjects: ${r.sectionSubjectCount}`)
  console.log(`   Teaching Assignments: ${r.teachingAssignmentCount}/${r.sectionSubjectCount}`)
  if (r.blockers.length > 0) {
    console.log(`   Blockers:`)
    for (const b of r.blockers) console.log(`     • ${b}`)
  }
  if (r.untaughtSubjects.length > 0) {
    console.log(`   Untaught subjects (${r.untaughtSubjects.length}):`)
    for (const u of r.untaughtSubjects.slice(0, 5)) console.log(`     • ${u}`)
    if (r.untaughtSubjects.length > 5) console.log(`     ... and ${r.untaughtSubjects.length - 5} more`)
  }
  if (r.unmappedLabSubjects.length > 0) {
    console.log(`   Unmapped lab subjects (${r.unmappedLabSubjects.length}):`)
    for (const u of r.unmappedLabSubjects.slice(0, 5)) console.log(`     • ${u}`)
    if (r.unmappedLabSubjects.length > 5) console.log(`     ... and ${r.unmappedLabSubjects.length - 5} more`)
  }
  if (r.unresolvedFaculty.length > 0) console.log(`   Unresolved faculty: ${r.unresolvedFaculty.join(', ')}`)
  if (r.unresolvedSubjects.length > 0) console.log(`   Unresolved subject codes: ${r.unresolvedSubjects.join(', ')}`)
  console.log()
}

const ready = results.filter(r => r.canGenerate)
const partial = results.filter(r => !r.canGenerate && r.sectionCount > 0)
const empty = results.filter(r => r.sectionCount === 0)

console.log('═'.repeat(70))
console.log(`  SUMMARY: ${ready.length} ready | ${partial.length} partial | ${empty.length} not configured`)
console.log('═'.repeat(70))
if (ready.length > 0) console.log(`  Ready for generation: ${ready.map(r => `${r.year}/Sem ${r.semester}`).join(', ')}`)
if (partial.length > 0) console.log(`  Partially configured: ${partial.map(r => `${r.year}/Sem ${r.semester}`).join(', ')}`)
if (empty.length > 0) console.log(`  Not configured:       ${empty.map(r => `${r.year}/Sem ${r.semester}`).join(', ')}`)
console.log('═'.repeat(70))
