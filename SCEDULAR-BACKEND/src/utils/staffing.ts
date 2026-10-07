/**
 * Staffing arithmetic, kept pure so it can be tested on its own.
 *
 *  - A subject needs one teacher per ~`avgSectionsPerTeacher` sections. Maths in 10 sections (4 periods each = 40T) with an
 *    average of 3 sections per teacher wants ceil(10/3) = 4 teachers, so only 4 preferences are accepted for it.
 *  - A teacher can carry at most `maxWeeklyPeriods` (default 22) periods a week. Total demand = sections x subjects x periods;
 *    divided by that cap it gives the number of teachers the department needs, and the shortfall is "need N more teachers".
 */
import type { AllocationConfig } from './allocationPolicy.js'
import type { Faculty, Section, SectionSubject, Subject, TeachingAssignment } from '../types.js'

export const DEFAULT_AVG_SECTIONS_PER_TEACHER = 3
export const DEFAULT_MAX_WEEKLY_PERIODS = 22

export interface StaffingPolicy { avgSectionsPerTeacher: number; maxWeeklyPeriods: number }

export function staffingPolicy(cfg?: Partial<AllocationConfig> | null): StaffingPolicy {
  const avg = Number(cfg?.avgSectionsPerTeacher)
  const max = Number(cfg?.maxWeeklyPeriods)
  return {
    avgSectionsPerTeacher: Number.isFinite(avg) && avg >= 1 ? Math.floor(avg) : DEFAULT_AVG_SECTIONS_PER_TEACHER,
    maxWeeklyPeriods: Number.isFinite(max) && max >= 1 ? Math.floor(max) : DEFAULT_MAX_WEEKLY_PERIODS,
  }
}

/** Teachers a subject wants = its sections / average sections per teacher, rounded up (0 when nobody offers it). */
export function subjectQuota(sections: number, avgSectionsPerTeacher: number): number {
  return sections <= 0 ? 0 : Math.max(1, Math.ceil(sections / Math.max(1, avgSectionsPerTeacher)))
}

export interface StaffingInput {
  semesters: string[]
  faculty: Faculty[]
  sections: Section[]
  subjects: Subject[]
  sectionSubjects: SectionSubject[]
  teachingAssignments: TeachingAssignment[]
  preferences: { subjectId: string; facultyId: string; status: string }[]
  policy: StaffingPolicy
}

export interface StaffingReport {
  maxWeeklyPeriods: number
  avgSectionsPerTeacher: number
  teachers: number
  totalDemandPeriods: number
  assignedPeriods: number
  openPeriods: number
  /** teachers needed if the whole demand were spread evenly at the weekly cap */
  teachersNeeded: number
  /** teachers still missing once existing assignments and free capacity are counted */
  moreTeachersNeeded: number
  enough: boolean
  message: string
  bySemester: { semester: string; sections: number; demandPeriods: number; assignedPeriods: number; openPeriods: number }[]
  subjects: {
    subjectId: string; code: string; name: string; semester: string
    sections: number; periodsPerSection: number; totalPeriods: number
    teachersWanted: number; chosen: number; slotsLeft: number; openSections: number
  }[]
}

export function computeStaffing(i: StaffingInput): StaffingReport {
  const cap = i.policy.maxWeeklyPeriods
  const avg = i.policy.avgSectionsPerTeacher
  const sems = new Set(i.semesters)
  const activeSec = new Set(i.sections.filter(s => s.active !== false && s.semester && sems.has(s.semester)).map(s => s.id))
  const offerings = i.sectionSubjects.filter(o => activeSec.has(o.sectionId))
  const offById = new Map(offerings.map(o => [o.id, o]))
  const subj = new Map(i.subjects.map(s => [s.id, s]))
  const secSem = new Map(i.sections.map(s => [s.id, s.semester ?? '']))

  const periodsOf = (o: SectionSubject) => o.theoryPeriods + o.labPeriods
  const staffed = new Set(i.teachingAssignments.filter(t => offById.has(t.sectionSubjectId)).map(t => t.sectionSubjectId))

  // load per teacher counts every period they were assigned (all semesters), because the weekly cap is shared
  const ssAll = new Map(i.sectionSubjects.map(o => [o.id, o]))
  const load = new Map<string, number>()
  for (const t of i.teachingAssignments) {
    const o = ssAll.get(t.sectionSubjectId); if (!o) continue
    load.set(t.facultyId, (load.get(t.facultyId) ?? 0) + (t.component === 'LAB' ? o.labPeriods : o.theoryPeriods))
  }

  const teachers = i.faculty.filter(f => f.role !== 'HOD')
  const demand = offerings.reduce((n, o) => n + periodsOf(o), 0)
  const assigned = offerings.filter(o => staffed.has(o.id)).reduce((n, o) => n + periodsOf(o), 0)
  const open = demand - assigned
  const freeCapacity = teachers.reduce((n, f) => n + Math.max(0, cap - (load.get(f.id) ?? 0)), 0)
  const missingPeriods = Math.max(0, open - freeCapacity)
  const more = Math.ceil(missingPeriods / cap)
  const needed = Math.ceil(demand / cap)

  const bySemester = i.semesters.map(semester => {
    const os = offerings.filter(o => secSem.get(o.sectionId) === semester)
    const d = os.reduce((n, o) => n + periodsOf(o), 0)
    const a = os.filter(o => staffed.has(o.id)).reduce((n, o) => n + periodsOf(o), 0)
    return { semester, sections: new Set(os.map(o => o.sectionId)).size, demandPeriods: d, assignedPeriods: a, openPeriods: d - a }
  }).filter(s => s.sections > 0)

  const bySubject = new Map<string, SectionSubject[]>()
  for (const o of offerings) bySubject.set(o.subjectId, [...(bySubject.get(o.subjectId) ?? []), o])
  const chosenBy = new Map<string, Set<string>>()
  for (const p of i.preferences) if (p.status === 'SUBMITTED' || p.status === 'APPROVED') chosenBy.set(p.subjectId, (chosenBy.get(p.subjectId) ?? new Set()).add(p.facultyId))

  const subjects = [...bySubject.entries()].map(([id, os]) => {
    const s = subj.get(id)
    const wanted = subjectQuota(os.length, avg)
    const chosen = chosenBy.get(id)?.size ?? 0
    return {
      subjectId: id, code: s?.code ?? id, name: s?.name ?? id, semester: s?.semester ?? '',
      sections: os.length, periodsPerSection: periodsOf(os[0]), totalPeriods: os.reduce((n, o) => n + periodsOf(o), 0),
      teachersWanted: wanted, chosen, slotsLeft: Math.max(0, wanted - chosen), openSections: os.filter(o => !staffed.has(o.id)).length,
    }
  }).sort((a, b) => a.semester.localeCompare(b.semester) || a.code.localeCompare(b.code))

  const message = demand === 0 ? 'There are no sections with subjects yet.'
    : more > 0 ? `Need ${more} more teacher${more === 1 ? '' : 's'}: ${open} periods are still unassigned but the ${teachers.length} teachers have room for only ${freeCapacity} more (limit ${cap} a week each).`
    : `Enough teachers: ${demand} periods a week need at least ${needed} teachers at ${cap} periods each, and you have ${teachers.length}.`

  return {
    maxWeeklyPeriods: cap, avgSectionsPerTeacher: avg, teachers: teachers.length,
    totalDemandPeriods: demand, assignedPeriods: assigned, openPeriods: open,
    teachersNeeded: needed, moreTeachersNeeded: more, enough: more === 0, message, bySemester, subjects,
  }
}
