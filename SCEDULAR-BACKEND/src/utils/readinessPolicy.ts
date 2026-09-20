/**
 * SCEDULAR - Readiness Policy (Backend)
 * Pure, side-effect-free readiness computation. Single source of truth.
 */

export interface SemesterReadiness {
  year: string
  semester: string
  academicYear: string
  isOdd: boolean
  curriculumReady: boolean
  sectionsReady: boolean
  facultyReady: boolean
  weightageReady: boolean
  labsReady: boolean
  configReady: boolean
  allocationReady: boolean
  timetableReady: boolean
  canGenerate: boolean
  missingItems: string[]
  sectionCount: number
  subjectCount: number
}

export const YEAR_TO_SEMESTERS: Record<string, [string, string]> = {
  'Year 1': ['I', 'II'],
  'Year 2': ['III', 'IV'],
  'Year 3': ['V', 'VI'],
  'Year 4': ['VII', 'VIII'],
}

export function getSemesterLabel(year: string, isOdd: boolean): string {
  const [odd, even] = YEAR_TO_SEMESTERS[year] ?? ['?', '?']
  return isOdd ? odd : even
}

export function getYearNumber(year: string): number {
  const match = year.match(/\d+/)
  return match ? parseInt(match[0], 10) : 0
}

export interface SemesterReadinessParams {
  year: string
  semester: string
  isOdd: boolean
  academicYear: string
  subjectCount: number
  sectionCount: number
  totalFacultyCount: number
  sectionSubjectCount: number
  totalLabCount: number
  hasConfiguredSchedule: boolean
  approvedPreferenceCount: number
  weightageValid?: boolean
  weightageMissingCount?: number
  allocationValid?: boolean
  unallocatedSubjectCount?: number
  shortageDetails?: string[]
  labsMapped?: boolean
}

export function computeSemesterReadiness(p: SemesterReadinessParams): SemesterReadiness {
  const curriculumReady = p.subjectCount > 0
  const sectionsReady = p.sectionCount > 0
  const facultyReady = p.totalFacultyCount > 0
  const labsReady = p.totalLabCount > 0
  const configReady = p.hasConfiguredSchedule
  const weightageReady = p.weightageValid ?? (p.sectionSubjectCount > 0 ? true : (curriculumReady && sectionsReady))
  const allocationReady = p.allocationValid ?? (facultyReady && p.approvedPreferenceCount > 0)

  const canGenerate =
    curriculumReady && sectionsReady && facultyReady &&
    weightageReady && labsReady && configReady && allocationReady

  const missingItems: string[] = []
  if (!curriculumReady) missingItems.push(`Curriculum not loaded for ${p.year} Semester ${p.semester}`)
  if (!sectionsReady) missingItems.push(`Section roster not configured for ${p.year} Semester ${p.semester}`)
  if (!facultyReady) missingItems.push('Faculty roster is empty')
  if (!weightageReady) missingItems.push(`Weekly subject weightage incomplete for ${p.year} Semester ${p.semester} (${p.weightageMissingCount ?? 0} invalid offerings)`)
  if (!labsReady) missingItems.push('Laboratory resources not configured')
  if (!configReady) missingItems.push('Schedule configuration (working days/periods) incomplete')
  if (!allocationReady) {
    if (p.shortageDetails && p.shortageDetails.length > 0) {
      missingItems.push(...p.shortageDetails)
    } else {
      missingItems.push(`Faculty section allocation incomplete for ${p.year} Semester ${p.semester}`)
    }
  }

  return {
    year: p.year, semester: p.semester, academicYear: p.academicYear, isOdd: p.isOdd,
    curriculumReady, sectionsReady, facultyReady, weightageReady, labsReady,
    configReady, allocationReady, timetableReady: canGenerate, canGenerate, missingItems,
    sectionCount: p.sectionCount, subjectCount: p.subjectCount,
  }
}

export function canGenerateSemester(r: SemesterReadiness): boolean {
  return r.canGenerate
}

export function getBlockedMessage(r: SemesterReadiness): string {
  const yearNum = getYearNumber(r.year)
  return `YEAR ${yearNum} / SEMESTER ${r.semester} CANNOT GENERATE`
}

export const ALL_YEAR_SEMESTER_PAIRS = [
  { year: 'Year 1', isOdd: true },
  { year: 'Year 1', isOdd: false },
  { year: 'Year 2', isOdd: true },
  { year: 'Year 2', isOdd: false },
  { year: 'Year 3', isOdd: true },
  { year: 'Year 3', isOdd: false },
  { year: 'Year 4', isOdd: true },
  { year: 'Year 4', isOdd: false },
] as const
