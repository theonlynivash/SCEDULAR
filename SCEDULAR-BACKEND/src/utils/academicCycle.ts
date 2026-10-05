// Canonical academic-cycle model — the single source of truth for ODD/EVEN/BOTH
// semester groupings and the semester→year mapping. Every backend module that
// reasons about cycles imports from here; nothing hardcodes these lists inline.
//
// A "specific semester" is always one of I..VIII and is bound to a canonical
// subject record. ODD/EVEN/BOTH are academic-cycle *contexts* (filters), never
// duplicate subject categories.

export type AcademicCycle = 'ODD' | 'EVEN' | 'BOTH'

export const ALL_SEMESTERS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const
export type SpecificSemester = (typeof ALL_SEMESTERS)[number]

export const ODD_SEMESTERS: readonly SpecificSemester[] = ['I', 'III', 'V', 'VII']
export const EVEN_SEMESTERS: readonly SpecificSemester[] = ['II', 'IV', 'VI', 'VIII']

export const CYCLE_VALUES: readonly AcademicCycle[] = ['ODD', 'EVEN', 'BOTH']

// The current SCEDULAR academic cycle. Configurable at runtime through the DB
// (see repo.getCurrentAcademicCycle / setCurrentAcademicCycle); this constant is
// only the default when no configuration has been persisted yet.
export const DEFAULT_CURRENT_CYCLE: AcademicCycle = 'ODD'

export const SEMESTER_TO_YEAR: Record<string, string> = {
  I: 'Year 1', II: 'Year 1',
  III: 'Year 2', IV: 'Year 2',
  V: 'Year 3', VI: 'Year 3',
  VII: 'Year 4', VIII: 'Year 4',
}

export function isSpecificSemester(v: unknown): v is SpecificSemester {
  return typeof v === 'string' && (ALL_SEMESTERS as readonly string[]).includes(v.trim())
}

export function isAcademicCycle(v: unknown): v is AcademicCycle {
  return typeof v === 'string' && (CYCLE_VALUES as readonly string[]).includes(v.trim().toUpperCase())
}

/** Coerce an arbitrary persisted/configured value to a valid cycle, else fallback. */
export function normalizeCycle(v: unknown, fallback: AcademicCycle = DEFAULT_CURRENT_CYCLE): AcademicCycle {
  if (isAcademicCycle(v)) return String(v).trim().toUpperCase() as AcademicCycle
  return fallback
}

/** ODD or EVEN for a specific semester; null if not a specific semester. */
export function cycleOfSemester(sem: unknown): 'ODD' | 'EVEN' | null {
  if (typeof sem !== 'string') return null
  const s = sem.trim()
  if ((ODD_SEMESTERS as readonly string[]).includes(s)) return 'ODD'
  if ((EVEN_SEMESTERS as readonly string[]).includes(s)) return 'EVEN'
  return null
}

/** The specific semesters that belong to a cycle (BOTH → all I..VIII). */
export function semestersForCycle(cycle: AcademicCycle): SpecificSemester[] {
  if (cycle === 'ODD') return [...ODD_SEMESTERS]
  if (cycle === 'EVEN') return [...EVEN_SEMESTERS]
  return [...ALL_SEMESTERS]
}

/** True when a specific semester is offered under the given cycle context. */
export function semesterInCycle(sem: unknown, cycle: AcademicCycle): boolean {
  if (!isSpecificSemester(sem)) return false
  if (cycle === 'BOTH') return true
  return (semestersForCycle(cycle) as readonly string[]).includes(String(sem).trim())
}
