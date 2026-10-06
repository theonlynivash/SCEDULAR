import fs from 'node:fs'
import { storageMode } from './storage.js'
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
import { deriveComponentType } from '../subjectConfig.js'
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
  WorkloadTemplate,
  FacultyWorkloadAllocation,
  FacultyResult,
  LeaveRequest,
  Substitution,
  Reminder,
  MailLogEntry,
  ChatMessage,
} from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// SCEDULAR_DB_FILE lets tests and separate datasets use their own database file.
const DB_FILE = process.env.SCEDULAR_DB_FILE
  ? path.resolve(process.env.SCEDULAR_DB_FILE)
  : path.resolve(__dirname, '../../data/scedular_local_db.json')
const DB_DIR = path.dirname(DB_FILE)

export const DEFAULT_WORKLOAD_TEMPLATES: WorkloadTemplate[] = [
  { id: 'WKL-T1L0', name: '1T + 0L (1 Theory / Section)', theoryPeriodsPerSection: 1, labPeriodsPerSection: 0, description: '1 Theory period per section' },
  { id: 'WKL-T2L0', name: '2T + 0L (2 Theory / Section)', theoryPeriodsPerSection: 2, labPeriodsPerSection: 0, description: '2 Theory periods per section' },
  { id: 'WKL-T3L0', name: '3T + 0L (3 Theory / Section)', theoryPeriodsPerSection: 3, labPeriodsPerSection: 0, description: '3 Theory periods per section' },
  { id: 'WKL-T4L0', name: '4T + 0L (4 Theory / Section)', theoryPeriodsPerSection: 4, labPeriodsPerSection: 0, description: '4 Theory periods per section' },
  { id: 'WKL-T2L2', name: '2T + 2L (Integrated 2T + 2L / Section)', theoryPeriodsPerSection: 2, labPeriodsPerSection: 2, description: '2 Theory + 2 Lab periods per section' },
  { id: 'WKL-T3L2', name: '3T + 2L (Integrated 3T + 2L / Section)', theoryPeriodsPerSection: 3, labPeriodsPerSection: 2, description: '3 Theory + 2 Lab periods per section' },
  { id: 'WKL-T4L4', name: '4T + 4L (4 Theory + 4 Lab / Section)', theoryPeriodsPerSection: 4, labPeriodsPerSection: 4, description: '4 Theory + 4 Lab periods per section' },
  { id: 'WKL-T0L3', name: '0T + 3L (3 Lab Only / Section)', theoryPeriodsPerSection: 0, labPeriodsPerSection: 3, description: '3 Lab periods per section' },
]

export interface LocalDbState {
  /**
   * Once true the database file is the single source of truth: startup never merges the built-in
   * seed rosters/curriculum back in (which would resurrect deleted teachers/assignments or overwrite
   * subjects edited in the app).
   */
  appOwned?: boolean
  /** facultyId -> bcrypt hash. Kept apart from the faculty rows so hashes never leak through faculty listings. */
  facultyPasswords?: Record<string, string>
  /** small profile pictures (JPEG/PNG/WebP data URLs), by faculty id */
  facultyPhotos?: Record<string, { data: string; at: string }>
  /** pending "forgot password" codes (hashed), by faculty id: they survive restarts and other server instances */
  passwordResets?: Record<string, { codeHash: string; expires: number; attempts: number; sentAt: number }>
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
  workloadTemplates: WorkloadTemplate[]
  facultyWorkloadAllocations: FacultyWorkloadAllocation[]
  facultyResults: FacultyResult[]
  mailLog: MailLogEntry[]
  /** leave letters and the classes other teachers take in place (optional: older data files do not have them yet) */
  leaveRequests?: LeaveRequest[]
  substitutions?: Substitution[]
  nextLeaveId?: number
  nextSubstitutionId?: number
  /** calendar reminders (optional: older data files do not have them yet) */
  reminders?: Reminder[]
  nextReminderId?: number
  messages: ChatMessage[]
  nextMessageId: number
  nextResultId: number
  nextMailId: number
  nextPreferenceId: number
  nextRunId: number
  nextSectionSubjectId: number
  nextTeachingAssignmentId: number
  nextWorkloadAllocationId: number
}

export function deriveInitialCourses(subjects: Subject[]): Course[] {
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
      // Map category + deliveryType to the correct ComponentType
      const comp = deriveComponentType(s.category, s.deliveryType)
      converted.push({
        id: s.code,
        code: s.code,
        name: s.name,
        componentType: comp as any,
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
    appOwned: true,
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
    workloadTemplates: [...DEFAULT_WORKLOAD_TEMPLATES],
    facultyWorkloadAllocations: [],
    facultyResults: [],
    mailLog: [],
    messages: [],
    nextMessageId: 1,
    nextResultId: 1,
    nextMailId: 1,
    nextPreferenceId: 1,
    nextRunId: 1,
    nextSectionSubjectId: initialSectionSubjects.length + 1,
    nextTeachingAssignmentId: initialTeachingAssignments.length + 1,
    nextWorkloadAllocationId: 1,
  }
}

/** An empty dataset: no sections, subjects, teachers (except the HOD) or assignments. Labs and the period grid are kept. */
export function createBlankDbState(): LocalDbState {
  const base = createDefaultDbState()
  return {
    ...base,
    appOwned: true,
    faculty: base.faculty.filter(f => f.role === 'HOD'),
    facultyPasswords: {},
    sections: [],
    subjects: [],
    courses: [],
    sectionSubjects: [],
    teachingAssignments: [],
    labMappings: [],
    facultyUnavailability: [],
    facultyPreferences: [],
    facultySubjectHistory: [],
    generationRuns: [],
    assignments: [],
    conflicts: [],
    unscheduled: [],
    sessions: [],
    facultyWorkloadAllocations: [],
    facultyResults: [],
    mailLog: [],
    messages: [],
    nextMessageId: 1,
    nextResultId: 1,
    nextMailId: 1,
    nextPreferenceId: 1,
    nextRunId: 1,
    nextSectionSubjectId: 1,
    nextTeachingAssignmentId: 1,
    nextWorkloadAllocationId: 1,
  }
}

let dbState: LocalDbState | null = null

/**
 * Persistence hooks. In file mode the JSON file is written here; in postgres mode (see sync.ts) a driver takes over and
 * `saveLocalDb()` only marks the document as changed - it is written to the database before the response is sent.
 */
let driver: { markDirty(): void } | null = null
export function useStorageDriver(d: { markDirty(): void } | null) { driver = d }

/** Replace the contents of the live state IN PLACE (other modules hold a reference to the same object). */
export function installState(next: LocalDbState): LocalDbState {
  if (!dbState) { dbState = next; return dbState }
  for (const k of Object.keys(dbState)) delete (dbState as any)[k]
  Object.assign(dbState, next)
  return dbState
}
/**
 * Run a multi-step change as ONE unit: if anything fails half-way, every change made so far is undone, so the data is never
 * left half imported / half merged. (Single-threaded, so nothing else changes the data while `fn` runs between awaits only
 * if it awaits; the data layer's own calls are in-memory, so in practice no other request interleaves.)
 */
export async function runAtomic<T>(fn: () => Promise<T>): Promise<T> {
  const before = structuredClone(getLocalDb())
  try { return await fn() }
  catch (err) { installState(before); saveLocalDb(); throw err }
}

export const newDefaultState = (): LocalDbState => (process.env.SCEDULAR_START_BLANK === 'true' ? createBlankDbState() : createDefaultDbState())

/** Replace the whole dataset with an empty one (keeps the HOD login, labs and period grid). */
export function resetToBlankDb(): LocalDbState {
  // Mutate in place: repo.ts holds a reference to this object, so replacing it would orphan that reference.
  const target = getLocalDb() as unknown as Record<string, unknown>
  const blank = createBlankDbState()
  const hodIds = new Set(blank.faculty.map(f => f.id))
  blank.sessions = ((target.sessions as SessionRecord[]) ?? []).filter(x => hodIds.has(x.facultyId)) // the HOD stays logged in
  for (const k of Object.keys(target)) delete target[k]
  Object.assign(target, blank)
  saveLocalDbSync()
  return dbState!
}

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

      if (parsed.appOwned) {
        // The file is authoritative: no seed merging, no "repairs" (a legitimately empty table stays empty).
        const base = createBlankDbState()
        const merged: LocalDbState = { ...base, ...parsed }
        merged.nextSectionSubjectId = Math.max(merged.nextSectionSubjectId ?? 1, ...merged.sectionSubjects.map(x => x.id + 1), 1)
        merged.nextTeachingAssignmentId = Math.max(merged.nextTeachingAssignmentId ?? 1, ...merged.teachingAssignments.map(x => x.id + 1), 1)
        dbState = merged
        console.log(`[LocalDB] Loaded ${DB_FILE} (${merged.faculty.length} faculty, ${merged.subjects.length} subjects, ${merged.sections.length} sections, ${merged.labs.length} labs, ${merged.sectionSubjects.length} sectionSubjects)`)
        return dbState
      }
      const defaults = createDefaultDbState()

      // Use canonical sections and subjects from DB (or defaults if missing)
      const sections: Section[] = parsed.sections?.length ? parsed.sections : defaults.sections
      const subjects: Subject[] = parsed.subjects?.length ? parsed.subjects : defaults.subjects

      // Migrate legacy subject categories to the canonical SubjectCategory enum.
      // Old DB snapshots may contain LABORATORY, EMPLOYABILITY, PROFESSIONAL_CORE,
      // "BASIC SCIENCE" (with spaces), ELECTIVE, etc.  Normalize them so the
      // rest of the system sees only the canonical underscore-separated set.
      let needsRepair = false
      const legacyCategoryMap: Record<string, string> = {
        LABORATORY: 'LAB_ONLY',
        EMPLOYABILITY: 'ADDITIONAL',
        PROFESSIONAL_CORE: 'CORE',
        ELECTIVE: 'PROFESSIONAL_ELECTIVE',
        'BASIC SCIENCE': 'BASIC_SCIENCE',
        'ENGINEERING SCIENCE': 'ENGINEERING_SCIENCE',
        'HUMANITIES': 'HUMANITIES',
        'PROFESSIONAL ELECTIVE': 'PROFESSIONAL_ELECTIVE',
        'OPEN ELECTIVE': 'OPEN_ELECTIVE',
        BS: 'BASIC_SCIENCE',
        ES: 'ENGINEERING_SCIENCE',
        HS: 'HUMANITIES',
        PC: 'CORE',
        PE: 'PROFESSIONAL_ELECTIVE',
        OE: 'OPEN_ELECTIVE',
        EEC: 'ADDITIONAL',
        MC: 'MANDATORY',
        SKILL: 'ADDITIONAL',
      }
      let migrated = false
      for (const s of subjects) {
        const mapped = legacyCategoryMap[s.category]
        if (mapped) {
          s.category = mapped as any
          migrated = true
        }
      }
      if (migrated) {
        needsRepair = true
        console.log('[LocalDB] Migrated legacy subject categories to canonical enum')
      }

      // Sync canonical subject deliveryType, theoryPeriods, labPeriods from REGULATION_2024_CURRICULUM
      const currMap = new Map(REGULATION_2024_CURRICULUM.map(c => [c.code, c]))
      let dtMigrated = false
      for (const s of subjects) {
        const c = currMap.get(s.code)
        if (c) {
          if (s.deliveryType !== c.deliveryType || s.theoryPeriods !== c.theoryPeriods || s.labPeriods !== c.labPeriods) {
            s.deliveryType = c.deliveryType as any
            s.theoryPeriods = c.theoryPeriods
            s.labPeriods = c.labPeriods
            dtMigrated = true
          }
        }
      }
      if (dtMigrated) {
        needsRepair = true
        console.log('[LocalDB] Synced subject deliveryTypes & periods to canonical curriculum roster')
      }

      // Repair sectionSubjects if missing or empty — derive canonically and persist
      let sectionSubjects: SectionSubject[]
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
      merged.appOwned = true
      needsRepair = true
      dbState = merged

      if (needsRepair) {
        saveLocalDbSync()
        console.log(`[LocalDB] Repaired and persisted sectionSubjects/teachingAssignments to ${DB_FILE}`)
      }

      console.log(`[LocalDB] Loaded ${DB_FILE} (${merged.faculty.length} faculty, ${merged.subjects.length} subjects, ${merged.sections.length} sections, ${merged.labs.length} labs, ${merged.sectionSubjects.length} sectionSubjects)`)
    } else {
      // SCEDULAR_START_BLANK=true starts an empty dataset (build everything in the app);
      // otherwise a new install begins with the bundled sample department.
      dbState = process.env.SCEDULAR_START_BLANK === 'true' ? createBlankDbState() : createDefaultDbState()
      saveLocalDbSync()
      console.log(`[LocalDB] Created new ${process.env.SCEDULAR_START_BLANK === 'true' ? 'blank' : 'sample'} local database at ${DB_FILE}`)
    }
  } catch (err) {
    // Never fall back to the sample data here: the next save would overwrite the real (merely unreadable) file with it.
    try { if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, `${DB_FILE}.unreadable-${Date.now()}`) } catch { /* best effort */ }
    throw new Error(`The database file ${DB_FILE} could not be read (${(err as Error).message}). A copy was kept next to it. Fix or restore the file, then start again.`)
  }

  return dbState!
}

export function resetWorkflowState(): LocalDbState {
  const db = getLocalDb()
  db.facultyPreferences = []
  db.teachingAssignments = []
  db.facultyWorkloadAllocations = []
  db.generationRuns = []
  db.assignments = []
  db.conflicts = []
  db.unscheduled = []
  db.nextPreferenceId = 1
  db.nextRunId = 1
  db.nextTeachingAssignmentId = 1
  db.nextWorkloadAllocationId = 1
  saveLocalDbSync()
  console.log('[LocalDB] Reset workflow transaction state. Master entities preserved.')
  return db
}

export function getLocalDb(): LocalDbState {
  if (!dbState) {
    // postgres mode: a placeholder that sync.ts replaces (in place) with the stored data before any request is served
    if (storageMode === 'postgres') { dbState = createBlankDbState(); return dbState }
    return initLocalDb()
  }
  return dbState
}

let saveTimeout: NodeJS.Timeout | null = null

export function saveLocalDb(): void {
  if (driver) return driver.markDirty()
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveLocalDbSync()
  }, 100)
}

export function saveLocalDbSync(): void {
  if (!dbState) return
  if (driver) return driver.markDirty()
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
