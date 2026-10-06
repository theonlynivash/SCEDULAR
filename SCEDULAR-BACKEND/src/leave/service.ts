/**
 * Leave and substitution rules, kept apart from the HTTP layer so they can be tested directly.
 *
 * A leave request names a teacher and a range of dates. Her classes inside that range are read from the latest valid
 * timetable (so the sections and periods always match what is really on the timetable). For every such class the app can
 * say exactly who is free in that period; the HOD then picks a substitute for each class.
 */
import {
  getAssignmentsForRun, getLatestValidRun, getScheduleConfig, listFaculty, listFacultyUnavailability, listSectionSubjects,
  listSections, listSubjects, listTeachingAssignments,
} from '../db/repo.js'
import { getLocalDb } from '../db/localDb.js'
import type { Assignment, Faculty, LeaveRequest, LeaveSlot, ScheduleConfig, Section, SectionSubject, Subject, Substitution, TeachingAssignment } from '../types.js'

export const MAX_LEAVE_DAYS = 31
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export const todayIst = (now = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s
export const dayOf = (date: string) => DAY_NAMES[new Date(date + 'T00:00:00Z').getUTCDay()]
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** the live leave / substitution tables (created on first use: older data files do not have them) */
export function leaveTables() {
  const db = getLocalDb()
  db.leaveRequests ??= []
  db.substitutions ??= []
  db.nextLeaveId ??= Math.max(1, ...db.leaveRequests.map(l => l.id + 1))
  db.nextSubstitutionId ??= Math.max(1, ...db.substitutions.map(s => s.id + 1))
  return db as typeof db & { leaveRequests: LeaveRequest[]; substitutions: Substitution[]; nextLeaveId: number; nextSubstitutionId: number }
}

export interface Ctx {
  runId: number | null
  assignments: Assignment[]
  config: ScheduleConfig
  faculty: Faculty[]
  teaching: TeachingAssignment[]
  offerings: SectionSubject[]
  subjects: Subject[]
  sections: Section[]
  unavailable: Set<string>
  /** facultyId|day|period for every period a teacher has a class in the timetable */
  busy: Set<string>
  /** periods per week each teacher has in the timetable */
  load: Map<string, number>
  leaves: LeaveRequest[]
  subs: Substitution[]
}

export async function loadCtx(): Promise<Ctx> {
  const run = await getLatestValidRun()
  const [assignments, config, faculty, teaching, offerings, subjects, sections, un] = await Promise.all([
    run ? getAssignmentsForRun(run.id) : Promise.resolve([] as Assignment[]),
    getScheduleConfig(), listFaculty(), listTeachingAssignments(), listSectionSubjects(), listSubjects(), listSections(), listFacultyUnavailability(),
  ])
  const t = leaveTables()
  return {
    runId: run?.id ?? null, assignments, config, faculty, teaching, offerings, subjects, sections,
    unavailable: new Set(un.map(u => `${u.facultyId}|${u.day}|${u.period}`)),
    load: assignments.reduce((m, a) => m.set(a.facultyId, (m.get(a.facultyId) ?? 0) + a.endPeriod - a.startPeriod + 1), new Map<string, number>()),
    busy: new Set(assignments.flatMap(a => Array.from({ length: a.endPeriod - a.startPeriod + 1 }, (_, i) => `${a.facultyId}|${a.day}|${a.startPeriod + i}`))),
    leaves: t.leaveRequests, subs: t.substitutions,
  }
}

export const slotKey = (date: string, sectionId: string, startPeriod: number) => `${date}|${sectionId}|${startPeriod}`

/** every class the teacher has on the dates of the leave, from the timetable */
export function buildSlots(ctx: Ctx, facultyId: string, from: string, to: string): LeaveSlot[] {
  const slots: LeaveSlot[] = []
  const days = new Set(ctx.config.workingDays)
  for (const date of datesBetween(from, to)) {
    const day = dayOf(date)
    if (!days.has(day)) continue
    for (const a of ctx.assignments.filter(x => x.facultyId === facultyId && x.day === day)) {
      slots.push({ key: slotKey(date, a.sectionId, a.startPeriod), date, day, startPeriod: a.startPeriod, endPeriod: a.endPeriod, sectionId: a.sectionId, subjectId: a.subjectId ?? a.courseId, blockType: a.blockType, labId: a.labId ?? null })
    }
  }
  return slots.sort((a, b) => a.date.localeCompare(b.date) || a.sectionId.localeCompare(b.sectionId, undefined, { numeric: true }) || a.startPeriod - b.startPeriod)
}

const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 <= b2 && b1 <= a2
/** a leave that actually takes the teacher out of class on that date */
const onLeave = (ctx: Ctx, facultyId: string, date: string) => ctx.leaves.some(l => l.facultyId === facultyId && l.status === 'APPROVED' && l.fromDate <= date && date <= l.toDate)

export interface Candidate {
  facultyId: string
  name: string
  designation: string | null
  /** teaches this section (any subject) */
  staffOfSection: boolean
  /** teaches this very subject somewhere */
  sameSubject: boolean
  /** the leave-taker named this teacher in her letter */
  proposed: boolean
  /** periods this teacher once took for the requester (so the requester may ask them back), and the other way round */
  covered: { forMe: number; byMe: number }
  weeklyLoad: number
  substitutionsThatWeek: number
}

/** teachers who are completely free for the whole class (timetable, unavailability, leave and other substitutions) */
export function freeFor(ctx: Ctx, slot: LeaveSlot, o: { requesterId: string; proposed?: string[]; ignoreSubId?: number }): Candidate[] {
  const proposed = new Set(o.proposed ?? [])
  const subjectsTeacher = new Set(ctx.teaching.filter(t => { const off = ctx.offerings.find(x => x.id === t.sectionSubjectId); return off?.subjectId === slot.subjectId }).map(t => t.facultyId))
  const sectionTeachers = new Set(ctx.teaching.filter(t => ctx.offerings.find(x => x.id === t.sectionSubjectId)?.sectionId === slot.sectionId).map(t => t.facultyId))
  const weekStart = Date.parse(slot.date + 'T00:00:00Z') - ((new Date(slot.date + 'T00:00:00Z').getUTCDay() + 6) % 7) * 86_400_000
  const inWeek = (d: string) => { const t = Date.parse(d + 'T00:00:00Z'); return t >= weekStart && t < weekStart + 7 * 86_400_000 }
  const load = ctx.load
  const out: Candidate[] = []
  for (const f of ctx.faculty) {
    if (f.id === o.requesterId) continue
    if (onLeave(ctx, f.id, slot.date)) continue
    let busy = false
    for (let p = slot.startPeriod; p <= slot.endPeriod && !busy; p++) {
      if (ctx.unavailable.has(`${f.id}|${slot.day}|${p}`)) busy = true
      if (ctx.busy.has(`${f.id}|${slot.day}|${p}`)) busy = true
    }
    if (busy) continue
    if (ctx.subs.some(s => s.id !== o.ignoreSubId && s.substituteFacultyId === f.id && s.date === slot.date && overlaps(s.startPeriod, s.endPeriod, slot.startPeriod, slot.endPeriod))) continue
    out.push({
      facultyId: f.id, name: f.name, designation: f.designation ?? null,
      staffOfSection: sectionTeachers.has(f.id), sameSubject: subjectsTeacher.has(f.id), proposed: proposed.has(f.id),
      covered: coverageBetween(ctx, o.requesterId, f.id),
      weeklyLoad: load.get(f.id) ?? 0,
      substitutionsThatWeek: ctx.subs.filter(s => s.substituteFacultyId === f.id && inWeek(s.date)).reduce((n, s) => n + s.endPeriod - s.startPeriod + 1, 0),
    })
  }
  const rank = (c: Candidate) => (c.proposed ? 0 : 4) + (c.staffOfSection ? 0 : 2) + (c.sameSubject ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || a.substitutionsThatWeek - b.substitutionsThatWeek || a.weeklyLoad - b.weeklyLoad || a.name.localeCompare(b.name))
}

/** periods `other` took in place of `me` (forMe) and periods `me` took in place of `other` (byMe) */
export function coverageBetween(ctx: Ctx, me: string, other: string) {
  const len = (s: Substitution) => s.endPeriod - s.startPeriod + 1
  return {
    forMe: ctx.subs.filter(s => s.originalFacultyId === me && s.substituteFacultyId === other).reduce((n, s) => n + len(s), 0),
    byMe: ctx.subs.filter(s => s.originalFacultyId === other && s.substituteFacultyId === me).reduce((n, s) => n + len(s), 0),
  }
}

/** the figures shown on a teacher's Leave tab and dashboard */
export function summaryFor(ctx: Ctx, facultyId: string, today = todayIst()) {
  const name = (id: string) => ctx.faculty.find(f => f.id === id)?.name ?? id
  const len = (s: { startPeriod: number; endPeriod: number }) => s.endPeriod - s.startPeriod + 1
  const days = new Set(ctx.config.workingDays)
  const mine = ctx.leaves.filter(l => l.facultyId === facultyId && l.status === 'APPROVED')
  const leaveDays = mine.reduce((n, l) => n + datesBetween(l.fromDate, l.toDate).filter(d => days.has(dayOf(d))).length, 0)
  const covered = ctx.subs.filter(s => s.substituteFacultyId === facultyId)
  const byPerson = (rows: Substitution[], key: 'originalFacultyId' | 'substituteFacultyId') => {
    const m = new Map<string, { facultyId: string; name: string; periods: number; dates: Set<string> }>()
    for (const s of rows) {
      const id = s[key]; const r = m.get(id) ?? { facultyId: id, name: name(id), periods: 0, dates: new Set<string>() }
      r.periods += len(s); r.dates.add(s.date); m.set(id, r)
    }
    return [...m.values()].map(r => ({ facultyId: r.facultyId, name: r.name, periods: r.periods, dates: [...r.dates].sort() })).sort((a, b) => b.periods - a.periods)
  }
  const label = (s: Substitution) => ({
    id: s.id, date: s.date, day: s.day, startPeriod: s.startPeriod, endPeriod: s.endPeriod, sectionId: s.sectionId, blockType: s.blockType,
    subject: ctx.subjects.find(x => x.id === s.subjectId)?.name ?? s.subjectId, inPlaceOf: s.originalFacultyId, inPlaceOfName: name(s.originalFacultyId),
    substituteId: s.substituteFacultyId, substituteName: name(s.substituteFacultyId),
  })
  return {
    leaves: { requests: mine.length, days: leaveDays, periodsMissed: mine.flatMap(l => l.slots).filter(s => s.date <= today).reduce((n, s) => n + len(s), 0) },
    covering: { periods: covered.reduce((n, s) => n + len(s), 0), forPeople: byPerson(covered, 'originalFacultyId') },
    coveredForMe: byPerson(ctx.subs.filter(s => s.originalFacultyId === facultyId), 'substituteFacultyId'),
    upcomingDuties: covered.filter(s => s.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.startPeriod - b.startPeriod).map(label),
    myClassesTaken: ctx.subs.filter(s => s.originalFacultyId === facultyId && s.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.startPeriod - b.startPeriod).map(label),
    pendingForHod: ctx.leaves.filter(l => l.status === 'PENDING').length,
  }
}

export function coverageOf(ctx: Ctx, leave: LeaveRequest) {
  const subs = ctx.subs.filter(s => s.leaveId === leave.id)
  const covered = new Set(subs.map(s => s.slotKey))
  return { total: leave.slots.length, covered: leave.slots.filter(s => covered.has(s.key)).length }
}

/** the formal letter that is sent when the teacher does not write her own */
export function defaultLetter(f: Faculty, from: string, to: string, reason: string): string {
  const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  const range = from === to ? `on ${fmt(from)}` : `from ${fmt(from)} to ${fmt(to)}`
  return `To\nThe Head of the Department,\nDepartment of Artificial Intelligence and Data Science,\nPanimalar Engineering College, Chennai.\n\nRespected Madam / Sir,\n\nSubject: Request for leave ${range}\n\nI kindly request you to grant me leave ${range}${reason ? ` because ${reason.replace(/^because\s+/i, '').replace(/[.\s]+$/, '')}` : ''}. The classes I would take in this period are listed below, together with the faculty members who are free at those times and are willing to take them in my place. I request you to arrange the substitution.\n\nThanking you,\n\nYours faithfully,\n${f.name}\n${f.designation ?? 'Faculty'}, AI & DS`
}

/** For the HOD's Reports tab: how many periods each teacher did not attend because of approved leave */
export function absenceReport(ctx: Ctx, today = todayIst()) {
  const len = (s: { startPeriod: number; endPeriod: number }) => s.endPeriod - s.startPeriod + 1
  const days = new Set(ctx.config.workingDays)
  const covered = (l: LeaveRequest) => new Set(ctx.subs.filter(s => s.leaveId === l.id).map(s => s.slotKey))
  const byTeacher = new Map<string, LeaveRequest[]>()
  for (const l of ctx.leaves.filter(x => x.status === 'APPROVED')) byTeacher.set(l.facultyId, [...(byTeacher.get(l.facultyId) ?? []), l])
  const rows = [...byTeacher.entries()].map(([facultyId, ls]) => {
    const f = ctx.faculty.find(x => x.id === facultyId)
    const leaves = ls.sort((a, b) => b.fromDate.localeCompare(a.fromDate)).map(l => {
      const cov = covered(l)
      const past = l.slots.filter(s => s.date <= today)
      return {
        id: l.id, fromDate: l.fromDate, toDate: l.toDate, reason: l.reason,
        days: datesBetween(l.fromDate, l.toDate).filter(d => days.has(dayOf(d))).length,
        periodsMissed: past.reduce((n, s) => n + len(s), 0),
        periodsUpcoming: l.slots.filter(s => s.date > today).reduce((n, s) => n + len(s), 0),
        notCovered: past.filter(s => !cov.has(s.key)).reduce((n, s) => n + len(s), 0),
      }
    })
    return {
      facultyId, name: f?.name ?? facultyId, designation: f?.designation ?? null,
      leaveRequests: leaves.length, leaveDays: leaves.reduce((n, l) => n + l.days, 0),
      periodsMissed: leaves.reduce((n, l) => n + l.periodsMissed, 0), periodsUpcoming: leaves.reduce((n, l) => n + l.periodsUpcoming, 0),
      notCovered: leaves.reduce((n, l) => n + l.notCovered, 0),
      weeklyPeriods: ctx.load.get(facultyId) ?? 0, leaves,
    }
  }).sort((a, b) => b.periodsMissed - a.periodsMissed || b.leaveDays - a.leaveDays || a.name.localeCompare(b.name))
  return { asOf: today, totals: { teachers: rows.length, periodsMissed: rows.reduce((n, r) => n + r.periodsMissed, 0), periodsUpcoming: rows.reduce((n, r) => n + r.periodsUpcoming, 0), notCovered: rows.reduce((n, r) => n + r.notCovered, 0) }, rows }
}
