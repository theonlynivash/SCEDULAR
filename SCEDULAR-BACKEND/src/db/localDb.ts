import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultScheduleConfig } from '../utils/grid.js'
import { DEFAULT_ALLOCATION_CONFIG, type AllocationConfig } from '../utils/allocationPolicy.js'
import { DEFAULT_CURRENT_CYCLE, type AcademicCycle } from '../utils/academicCycle.js'
import { REAL_FACULTY_ROSTER } from '../seed/facultyRoster.js'
import { REGULATION_2024_CURRICULUM } from '../seed/curriculumRoster.js'
import { KNOWN_SECTIONS_ROSTER, KNOWN_LABS_ROSTER, KNOWN_LAB_MAPPINGS } from '../seed/resourceRoster.js'
import { CONFIRMED_TEACHING_ASSIGNMENTS_ODD } from '../seed/confirmedTeachingAssignments.js'
import { CONFIRMED_LAB_MAPPINGS_ODD } from '../seed/confirmedLabMappings.js'
import type {
  Assignment,
  Conflict,
  Course,
  Faculty,
  FacultyUnavailability,
  Lab,
  ScheduleConfig,
  Section,
  SchedulableUnit,
  Subject,
  SectionSubject,
  TeachingAssignment,
  TimetableStatus,
  FacultySubjectPreference,
  FacultySubjectHistory,
  SessionRecord,
} from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_DIR = path.resolve(__dirname, '../../data')
const DB_FILE = path.resolve(DB_DIR, 'scedular_local_db.json')

export interface LocalDbState {
  faculty: Faculty[]
  sections: Section[]
  subjects: Subject[]
  courses: Course[]
  sectionSubjects: SectionSubject[]
  teachingAssignments: TeachingAssignment[]
  labs: Lab[]
  labMappings: Array<{ labId: string; subjectId: string; sectionId: string | null }>
  facultyUnavailability: FacultyUnavailability[]
  scheduleConfig: ScheduleConfig
  facultyPreferences: FacultySubjectPreference[]
  allocationSettings: AllocationConfig
  currentAcademicCycle: AcademicCycle
  facultySubjectHistory: FacultySubjectHistory[]
  generationRuns: Array<{ id: number; status: TimetableStatus; generatedAt: string; warnings: string[] }>
  assignments: Array<Assignment & { runId: number }>
  conflicts: Array<Conflict & { runId: number }>
  unscheduled: Array<SchedulableUnit & { runId: number }>
  sessions: SessionRecord[]
  nextPreferenceId: number
  nextRunId: number
  nextSectionSubjectId: number
  nextTeachingAssignmentId: number
}

function deriveInitialCourses(subjects: Subject[]): Course[] {
  const converted: Course[] = []
  for (const s of subjects) {
    if (s.deliveryType === 'INTEGRATED') {
      converted.push({
        id: s.code,
        code: s.code,
        name: s.name,
        componentType: 'INTEGRATED_THEORY',
        labBlockLength: s.labPeriods || 3,
      })
      converted.push({
        id: `${s.code}_LAB`,
        code: `${s.code}_LAB`,
        name: `${s.name} Laboratory`,
        componentType: 'INTEGRATED_LAB',
        labBlockLength: s.labPeriods || 3,
      })
    } else if (s.deliveryType === 'LAB') {
      converted.push({
        id: s.code,
        code: s.code,
        name: s.name,
        componentType: 'LAB_ONLY',
        labBlockLength: s.labPeriods || 3,
      })
    } else {
      const comp = s.category === 'MANDATORY' ? 'MANDATORY' : s.category === 'ADDITIONAL' ? 'ADDITIONAL' : 'THEORY_ONLY'
      converted.push({
        id: s.code,
        code: s.code,
        name: s.name,
        componentType: comp,
        labBlockLength: 3,
      })
    }
  }
  return converted
}

function createDefaultDbState(): LocalDbState {
  const initialSubjects = [...REGULATION_2024_CURRICULUM] as Subject[]
  const initialSections = [...KNOWN_SECTIONS_ROSTER] as Section[]
  const initialSectionSubjects = deriveCanonicalSectionSubjects(initialSections, initialSubjects)
  const initialTeachingAssignments = resolveConfirmedTeachingAssignments(initialSectionSubjects, initialSubjects)
  return {
    faculty: [...REAL_FACULTY_ROSTER] as Faculty[],
    sections: initialSections,
    subjects: initialSubjects,
    courses: deriveInitialCourses(initialSubjects),
    sectionSubjects: initialSectionSubjects,
    teachingAssignments: initialTeachingAssignments,
    labs: [...KNOWN_LABS_ROSTER] as Lab[],
    // lab_mapping.subjectId must be the canonical subject id (matching every
    // other table's convention, e.g. section_subjects.subjectId), not the raw
    // subject code the roster is authored with -- otherwise every lookup
    // keyed by canonical id (preValidate, readiness) silently misses real
    // mappings. Resolve code -> canonical id here; unresolvable codes are
    // skipped and logged rather than mapped to a guess. Merges the small
    // illustrative KNOWN_LAB_MAPPINGS sample with the real, comprehensive
    // CONFIRMED_LAB_MAPPINGS_ODD set transcribed from the department's
    // per-lab-room timetables; de-duplicated by (lab, subject, section).
    labMappings: (() => {
      const idByCode = new Map(initialSubjects.map(s => [s.code, s.id]))
      const mapped: Array<{ labId: string; subjectId: string; sectionId: string | null }> = []
      const seen = new Set<string>()
      const addRow = (labId: string, subjectId: string, sectionId: string | null) => {
        const key = `${labId}::${subjectId}::${sectionId ?? 'GLOBAL'}`
        if (seen.has(key)) return
        seen.add(key)
        mapped.push({ labId, subjectId, sectionId })
      }
      for (const m of KNOWN_LAB_MAPPINGS) {
        const subjectId = idByCode.get(m.subjectCode)
        if (!subjectId) {
          console.warn(`[LocalDB] Skipping lab mapping (unknown subject code): ${m.labId} / ${m.subjectCode} / ${m.sectionId ?? 'GLOBAL'}`)
          continue
        }
        addRow(m.labId, subjectId, m.sectionId)
      }
      for (const row of resolveConfirmedLabMappings(initialSubjects)) {
        addRow(row.labId, row.subjectId, row.sectionId)
      }
      return mapped
    })(),
    facultyUnavailability: [],
    scheduleConfig: defaultScheduleConfig(),
    facultyPreferences: [],
    allocationSettings: DEFAULT_ALLOCATION_CONFIG,
    currentAcademicCycle: DEFAULT_CURRENT_CYCLE,
    facultySubjectHistory: [],
    generationRuns: [],
    assignments: [],
    conflicts: [],
    unscheduled: [],
    sessions: [],
    nextPreferenceId: 1,
    nextRunId: 1,
    nextSectionSubjectId: initialSectionSubjects.length + 1,
    nextTeachingAssignmentId: initialTeachingAssignments.length + 1,
  }
}

let dbState: LocalDbState | null = null

/**
 * Resolve the real, supplied ODD-semester confirmed-teaching-assignment seed
 * (CONFIRMED_TEACHING_ASSIGNMENTS_ODD -- Year 2/Sem III, Year 3/Sem V, Year
 * 4/Sem VII, transcribed from the actual department timetables and workload
 * sheet) against the already-derived section_subjects, producing real
 * teaching_assignments rows. Any row that cannot be resolved (unknown
 * section/subject combination) is skipped and logged -- never guessed.
 */
function resolveConfirmedTeachingAssignments(
  sectionSubjects: SectionSubject[],
  subjects: Subject[]
): TeachingAssignment[] {
  const subjectIdByCode = new Map(subjects.map(s => [s.code, s.id]))
  const ssIdByKey = new Map(sectionSubjects.map(ss => [`${ss.sectionId}::${ss.subjectId}`, ss.id]))
  const resolved: TeachingAssignment[] = []
  let nextId = 1
  for (const row of CONFIRMED_TEACHING_ASSIGNMENTS_ODD) {
    const subjectId = subjectIdByCode.get(row.subjectCode)
    const sectionSubjectId = subjectId ? ssIdByKey.get(`${row.sectionId}::${subjectId}`) : undefined
    if (!sectionSubjectId) {
      console.warn(`[LocalDB] Skipping confirmed teaching assignment (no matching section_subject): ${row.facultyId} / ${row.sectionId} / ${row.subjectCode} / ${row.component}`)
      continue
    }
    resolved.push({
      id: nextId++,
      facultyId: row.facultyId,
      sectionSubjectId,
      component: row.component,
      batch: row.batch,
    })
  }
  return resolved
}

/**
 * Resolve the real, supplied ODD-semester lab-room mapping seed
 * (CONFIRMED_LAB_MAPPINGS_ODD, transcribed from the department's per-lab
 * timetables) into lab_mapping rows keyed by canonical subject id. Rows
 * whose subject code doesn't resolve are skipped and logged.
 */
function resolveConfirmedLabMappings(
  subjects: Subject[]
): Array<{ labId: string; subjectId: string; sectionId: string | null }> {
  const subjectIdByCode = new Map(subjects.map(s => [s.code, s.id]))
  const resolved: Array<{ labId: string; subjectId: string; sectionId: string | null }> = []
  for (const row of CONFIRMED_LAB_MAPPINGS_ODD) {
    const subjectId = subjectIdByCode.get(row.subjectCode)
    if (!subjectId) {
      console.warn(`[LocalDB] Skipping confirmed lab mapping (unknown subject code): ${row.labId} / ${row.subjectCode} / ${row.sectionId}`)
      continue
    }
    resolved.push({ labId: row.labId, subjectId, sectionId: row.sectionId })
  }
  return resolved
}

/**
 * Derive canonical section_subjects from sections × subjects.
 * Exported so PostgreSQL bootstrap can use the same rule.
 */
export function deriveCanonicalSectionSubjects(sections: Section[], subjects: Subject[]): SectionSubject[] {
  const sectionSubjects: SectionSubject[] = []
  let nextId = 1
  for (const sec of sections) {
    if (!sec.semester || !sec.year || sec.active === false) continue
    const matchingSubjects = subjects.filter(s => s.semester === sec.semester && s.year === sec.year)
    for (const subj of matchingSubjects) {
      sectionSubjects.push({
        id: nextId++,
        sectionId: sec.id,
        subjectId: subj.id,
        theoryPeriods: subj.theoryPeriods ?? 0,
        labPeriods: subj.labPeriods ?? 0,
        labBlockLength: subj.labPeriods ? subj.labPeriods : null,
      })
    }
  }
  return sectionSubjects
}

export function initLocalDb(): LocalDbState {
  if (dbState) return dbState

  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true })
    }

    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8')
      const parsed = JSON.parse(content)
      const defaults = createDefaultDbState()

      // Use canonical sections and subjects from DB (or defaults if missing)
      const sections: Section[] = parsed.sections?.length ? parsed.sections : defaults.sections
      const subjects: Subject[] = parsed.subjects?.length ? parsed.subjects : defaults.subjects

      // Repair sectionSubjects if missing or empty — derive canonically and persist
      let sectionSubjects: SectionSubject[]
      let needsRepair = false
      if (!parsed.sectionSubjects?.length) {
        sectionSubjects = deriveCanonicalSectionSubjects(sections, subjects)
        needsRepair = true
        console.log(`[LocalDB] Repairing empty sectionSubjects: derived ${sectionSubjects.length} canonical entries`)
      } else {
        sectionSubjects = parsed.sectionSubjects
      }

      // Repair teachingAssignments if missing/empty — resolve the real supplied
      // Semester III confirmed-assignment seed against the (possibly just-repaired)
      // sectionSubjects, and persist.
      let teachingAssignments: LocalDbState['teachingAssignments']
      if (!parsed.teachingAssignments?.length) {
        teachingAssignments = resolveConfirmedTeachingAssignments(sectionSubjects, subjects)
        needsRepair = true
        console.log(`[LocalDB] Repairing empty teachingAssignments: resolved ${teachingAssignments.length} confirmed Semester III entries`)
      } else {
        // Merge in any confirmed rows newly added to the seed source (e.g. for
        // newly-added faculty) that aren't yet present in a persisted, older
        // snapshot. Never removes or overwrites a persisted assignment row.
        const freshlyResolved = resolveConfirmedTeachingAssignments(sectionSubjects, subjects)
        const persistedKeys = new Set(
          parsed.teachingAssignments.map(
            (t: TeachingAssignment) => `${t.facultyId}::${t.sectionSubjectId}::${t.component}::${t.batch ?? ''}`
          )
        )
        const missingFromAssignments = freshlyResolved.filter(
          t => !persistedKeys.has(`${t.facultyId}::${t.sectionSubjectId}::${t.component}::${t.batch ?? ''}`)
        )
        if (missingFromAssignments.length > 0) {
          let nextId = Math.max(0, ...parsed.teachingAssignments.map((t: TeachingAssignment) => t.id)) + 1
          teachingAssignments = [
            ...parsed.teachingAssignments,
            ...missingFromAssignments.map((t: TeachingAssignment) => ({ ...t, id: nextId++ })),
          ]
          needsRepair = true
          console.log(`[LocalDB] Repairing teachingAssignments: added ${missingFromAssignments.length} new confirmed entries`)
        } else {
          teachingAssignments = parsed.teachingAssignments
        }
      }

      // Repair labMappings if missing, empty, or persisted with the old
      // (buggy) subject-code-as-id shape -- every persisted subjectId must
      // resolve against the canonical subject id set.
      const subjectIdSet = new Set(subjects.map(s => s.id))
      const persistedLabMappingsValid =
        parsed.labMappings?.length > 0 &&
        parsed.labMappings.every((m: { subjectId: string }) => subjectIdSet.has(m.subjectId))
      let labMappings = persistedLabMappingsValid ? parsed.labMappings : defaults.labMappings
      if (!persistedLabMappingsValid && parsed.labMappings?.length > 0) {
        needsRepair = true
        console.log(`[LocalDB] Repairing labMappings persisted with stale subject codes: regenerated ${labMappings.length} canonical entries`)
      } else if (persistedLabMappingsValid) {
        // Merge in any confirmed lab-mapping rows newly added to the seed
        // source (e.g. a section's real room that was missing from an older
        // snapshot) that aren't yet present. Never removes or overwrites a
        // persisted mapping row.
        const freshlyResolved = resolveConfirmedLabMappings(subjects)
        const persistedMapKeys = new Set(
          parsed.labMappings.map((m: { labId: string; subjectId: string; sectionId: string | null }) => `${m.labId}::${m.subjectId}::${m.sectionId ?? ''}`)
        )
        const missingFromMappings = freshlyResolved.filter(
          m => !persistedMapKeys.has(`${m.labId}::${m.subjectId}::${m.sectionId ?? ''}`)
        )
        if (missingFromMappings.length > 0) {
          labMappings = [...parsed.labMappings, ...missingFromMappings]
          needsRepair = true
          console.log(`[LocalDB] Repairing labMappings: added ${missingFromMappings.length} new confirmed entries`)
        }
      }

      // Repair faculty roster -- add any canonical roster members (e.g. newly
      // added real faculty) that are missing from a persisted, older snapshot.
      // Never removes or overwrites a persisted faculty row.
      let faculty: Faculty[] = parsed.faculty?.length ? parsed.faculty : defaults.faculty
      if (parsed.faculty?.length) {
        const persistedIds = new Set(parsed.faculty.map((f: Faculty) => f.id))
        const missingFromRoster = defaults.faculty.filter(f => !persistedIds.has(f.id))
        if (missingFromRoster.length > 0) {
          faculty = [...parsed.faculty, ...missingFromRoster]
          needsRepair = true
          console.log(`[LocalDB] Repairing faculty roster: added ${missingFromRoster.length} new canonical faculty entries`)
        }
      }

      const merged: LocalDbState = {
        ...defaults,
        ...parsed,
        faculty,
        subjects,
        sections,
        labs: parsed.labs?.length ? parsed.labs : defaults.labs,
        labMappings,
        sectionSubjects,
        nextSectionSubjectId: sectionSubjects.length + 1,
        teachingAssignments,
        nextTeachingAssignmentId: Math.max(teachingAssignments.length + 1, parsed.nextTeachingAssignmentId ?? 1),
      }
      dbState = merged

      if (needsRepair) {
        saveLocalDbSync()
        console.log(`[LocalDB] Repaired and persisted sectionSubjects/teachingAssignments to ${DB_FILE}`)
      }

      console.log(`[LocalDB] Loaded ${DB_FILE} (${merged.faculty.length} faculty, ${merged.subjects.length} subjects, ${merged.sections.length} sections, ${merged.labs.length} labs, ${merged.sectionSubjects.length} sectionSubjects)`)
    } else {
      dbState = createDefaultDbState()
      saveLocalDbSync()
      console.log(`[LocalDB] Created new local database at ${DB_FILE}`)
    }
  } catch (err) {
    console.warn(`[LocalDB] Failed to read ${DB_FILE}, initializing default state in memory:`, err)
    dbState = createDefaultDbState()
  }

  return dbState!
}

export function resetWorkflowState(): LocalDbState {
  const db = getLocalDb()
  db.facultyPreferences = []
  db.teachingAssignments = []
  db.generationRuns = []
  db.assignments = []
  db.conflicts = []
  db.unscheduled = []
  db.nextPreferenceId = 1
  db.nextRunId = 1
  db.nextTeachingAssignmentId = 1
  saveLocalDbSync()
  console.log('[LocalDB] Reset workflow transaction state. Master entities preserved.')
  return db
}

export function getLocalDb(): LocalDbState {
  if (!dbState) {
    return initLocalDb()
  }
  return dbState
}

let saveTimeout: NodeJS.Timeout | null = null

export function saveLocalDb(): void {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveLocalDbSync()
  }, 100)
}

export function saveLocalDbSync(): void {
  if (!dbState) return
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true })
    }
    const tempFile = `${DB_FILE}.tmp`
    fs.writeFileSync(tempFile, JSON.stringify(dbState, null, 2), 'utf-8')
    fs.renameSync(tempFile, DB_FILE)
  } catch (err) {
    console.error(`[LocalDB] Error saving database to ${DB_FILE}:`, err)
  }
}
