// Canonical academic-cycle model for the frontend — mirrors the backend
// src/utils/academicCycle.ts. This is the ONE source of truth for ODD/EVEN/BOTH
// semester groupings and the semester→year mapping. No component hardcodes
// semester lists; the *current* cycle is always read from the backend
// (/faculty/cycle-context) so it is DB-configurable, never baked into React.

export type AcademicCycle = 'ODD' | 'EVEN' | 'BOTH'

export const ALL_SEMESTERS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const
export type SpecificSemester = (typeof ALL_SEMESTERS)[number]

export const ODD_SEMESTERS: readonly string[] = ['I', 'III', 'V', 'VII']
export const EVEN_SEMESTERS: readonly string[] = ['II', 'IV', 'VI', 'VIII']

export const CYCLE_VALUES: readonly AcademicCycle[] = ['ODD', 'EVEN', 'BOTH']

export const SEMESTER_TO_YEAR: Record<string, string> = {
  I: 'Year 1', II: 'Year 1',
  III: 'Year 2', IV: 'Year 2',
  V: 'Year 3', VI: 'Year 3',
  VII: 'Year 4', VIII: 'Year 4',
}

// Human-readable filter labels (single source; used by Subject Management).
export const CYCLE_LABELS: Record<AcademicCycle, string> = {
  BOTH: 'BOTH (Sem I–VIII)',
  ODD: 'ODD (I, III, V, VII)',
  EVEN: 'EVEN (II, IV, VI, VIII)',
}

export const SEMESTER_ORDER: Record<string, number> = ALL_SEMESTERS.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {} as Record<string, number>
)

export function isOddSemester(sem: string): boolean {
  return ODD_SEMESTERS.includes(sem)
}

export function cycleOfSemester(sem: string): 'ODD' | 'EVEN' | null {
  if (ODD_SEMESTERS.includes(sem)) return 'ODD'
  if (EVEN_SEMESTERS.includes(sem)) return 'EVEN'
  return null
}

export function semestersForCycle(cycle: AcademicCycle): string[] {
  if (cycle === 'ODD') return [...ODD_SEMESTERS]
  if (cycle === 'EVEN') return [...EVEN_SEMESTERS]
  return [...ALL_SEMESTERS]
}

export function semesterInCycle(sem: string, cycle: AcademicCycle): boolean {
  if (cycle === 'BOTH') return (ALL_SEMESTERS as readonly string[]).includes(sem)
  return semestersForCycle(cycle).includes(sem)
}

export interface SemesterOption {
  value: string
  label: string
  year: string
}

/** Build the semester option list for a cycle, in canonical I..VIII order. */
export function semesterOptionsForCycle(cycle: AcademicCycle): SemesterOption[] {
  return semestersForCycle(cycle)
    .slice()
    .sort((a, b) => (SEMESTER_ORDER[a] ?? 0) - (SEMESTER_ORDER[b] ?? 0))
    .map(value => ({ value, label: `Semester ${value}`, year: SEMESTER_TO_YEAR[value] }))
}
