/**
 * The SCEDULAR assistant: a tool-using chat model. It never "remembers" project data; every fact comes from a read-only
 * tool that queries the live database as the signed-in user, so answers stay current and respect roles.
 * Emails are only ever DRAFTED here; the HOD presses Send in the UI, which uses the normal /hod/mail/send route.
 */
import {
  getAssignmentsForRun, getConflictsForRun, getFaculty, getLatestValidRun, getScheduleConfig, getUnscheduledForRun,
  listFaculty, listFacultyResults, listSectionSubjects, listSections, listSubjects, listTeachingAssignments, listMailLog,
} from '../db/repo.js'
import { callLlmWithTools, type ToolDef } from './llm.js'
import { summarize } from '../routes/teacherExtras.js'
import { shortNameOf } from '../export/classTimetablePdf.js'
import type { UserRole } from '../types.js'

export interface EmailDraft { facultyId: string; name: string; email: string | null; subject: string; body: string }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }

const TOOLS: ToolDef[] = [
  { name: 'project_overview', description: 'Counts of teachers, sections, subjects, offerings; the latest generated timetable run (status, conflicts, unscheduled).', parameters: { type: 'object', properties: {} } },
  { name: 'find_faculty', description: 'Search teachers by name, id or designation (empty query lists everyone). Returns id, name, designation, weekly limit, planned weekly load and what they teach.', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
  { name: 'faculty_detail', description: 'Everything about one teacher: contact (HOD only), experience, teaching assignments per section, and weekly timetable.', parameters: { type: 'object', properties: { facultyId: { type: 'string' } }, required: ['facultyId'] } },
  { name: 'find_subjects', description: 'Search subjects by code/name/semester. Returns type, credits, L-T-P, and which sections offer it with their teachers.', parameters: { type: 'object', properties: { query: { type: 'string' }, semester: { type: 'string', description: 'Roman numeral e.g. V' } } } },
  { name: 'list_sections', description: 'Sections with year, semester, class in-charge; optionally filtered by semester.', parameters: { type: 'object', properties: { semester: { type: 'string' } } } },
  { name: 'section_timetable', description: 'The generated weekly timetable of a section (day by period), with subject and teacher.', parameters: { type: 'object', properties: { sectionId: { type: 'string', description: 'e.g. Y3-A' } }, required: ['sectionId'] } },
  { name: 'timetable_problems', description: 'Conflicts and unscheduled items of the latest run.', parameters: { type: 'object', properties: {} } },
  { name: 'workload_report', description: 'Planned weekly load vs limit for every teacher, plus subjects with open (unassigned) sections.', parameters: { type: 'object', properties: {} } },
  { name: 'teacher_results', description: 'Past-semester pass percentages recorded by teachers. Teachers see only their own; the HOD can pass facultyId or omit it for everyone.', parameters: { type: 'object', properties: { facultyId: { type: 'string' } } } },
  { name: 'mail_history', description: 'HOD only: recent mails sent to teachers (never contains passwords).', parameters: { type: 'object', properties: {} } },
  { name: 'draft_email', description: 'HOD only. Prepare an email to a teacher for the HOD to review and send. NEVER sends. Call once per recipient.', parameters: { type: 'object', properties: { facultyId: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string', description: 'Plain-text letter, ending with a sign-off' } }, required: ['facultyId', 'subject', 'body'] } },
]

export async function runAssistant(opts: { facultyId: string; role: UserRole; history: ChatTurn[] }): Promise<{ reply: string; drafts: EmailDraft[] } | null> {
  const { facultyId, role } = opts
  const hod = role === 'HOD'
  const me = await getFaculty(facultyId)
  const drafts: EmailDraft[] = []

  const load = async () => {
    const [faculty, sections, subjects, ss, ta, cfg, run] = await Promise.all([listFaculty(), listSections(), listSubjects(), listSectionSubjects(), listTeachingAssignments(), getScheduleConfig(), getLatestValidRun()])
    const assignments = run ? await getAssignmentsForRun(run.id) : []
    return { faculty, sections, subjects, ss, ta, cfg, run, assignments, subj: new Map(subjects.map(s => [s.id, s])), fac: new Map(faculty.map(f => [f.id, f])), ssById: new Map(ss.map(x => [x.id, x])) }
  }
  type D = Awaited<ReturnType<typeof load>>
  const plannedLoad = (d: D, fid: string) => d.ta.filter(t => t.facultyId === fid).reduce((n, t) => { const o = d.ssById.get(t.sectionSubjectId); return n + (o ? (t.component === 'LAB' ? o.labPeriods : o.theoryPeriods) : 0) }, 0)
  const teachesOf = (d: D, fid: string) => d.ta.filter(t => t.facultyId === fid).map(t => { const o = d.ssById.get(t.sectionSubjectId); const s = o && d.subj.get(o.subjectId); return o && s ? `${s.code} ${s.name} (${o.sectionId}, ${t.component.toLowerCase()})` : null }).filter(Boolean)
  const pub = (d: D, f: D['faculty'][number]) => ({ id: f.id, name: f.name, designation: f.designation, weeklyLimit: f.maxWeeklyPeriods, plannedWeeklyLoad: plannedLoad(d, f.id), teaching: teachesOf(d, f.id), ...(hod ? { email: f.email ?? null } : {}) })
  const slotLabel = (d: D, a: D['assignments'][number]) => { const s = d.subj.get(a.subjectId ?? a.courseId); return `${s ? shortNameOf(s) : a.courseId}${a.blockType === 'LAB' ? ' LAB' : ''}` }

  async function runTool(name: string, a: any): Promise<unknown> {
    const d = await load()
    const q = String(a?.query ?? '').trim().toLowerCase()
    switch (name) {
      case 'project_overview': {
        const [conf, uns] = d.run ? await Promise.all([getConflictsForRun(d.run.id), getUnscheduledForRun(d.run.id)]) : [[], []]
        return { teachers: d.faculty.length, sections: d.sections.length, subjects: d.subjects.length, offerings: d.ss.length, teachingAssignments: d.ta.length, latestRun: d.run ? { id: d.run.id, status: d.run.status, generatedAt: d.run.generatedAt, placedPeriods: d.assignments.length, conflicts: conf.length, unscheduled: uns.length } : null, workingDays: d.cfg.workingDays, periods: d.cfg.periods.map(p => `${p.index}: ${p.start}-${p.end}`) }
      }
      case 'find_faculty': return d.faculty.filter(f => !q || `${f.id} ${f.name} ${f.designation ?? ''}`.toLowerCase().includes(q)).slice(0, 40).map(f => pub(d, f))
      case 'faculty_detail': {
        const f = d.fac.get(String(a.facultyId))
        if (!f) return { error: 'No such teacher.' }
        const tt: Record<string, string[]> = {}
        for (const x of d.assignments.filter(x => x.facultyId === f.id).sort((p, q2) => p.startPeriod - q2.startPeriod)) (tt[x.day] ??= []).push(`P${x.startPeriod}${x.endPeriod > x.startPeriod ? '-' + x.endPeriod : ''} ${slotLabel(d, x)} ${x.sectionId}`)
        return { ...pub(d, f), phone: hod ? f.phone ?? null : undefined, experienceYears: f.currentExperience ?? f.previousExperience, weeklyTimetable: tt }
      }
      case 'find_subjects': {
        const sem = String(a?.semester ?? '').toUpperCase()
        return d.subjects.filter(s => (!q || `${s.code} ${s.name} ${s.shortName ?? ''}`.toLowerCase().includes(q)) && (!sem || s.semester === sem)).slice(0, 30).map(s => ({
          code: s.code, name: s.name, short: shortNameOf(s), type: s.deliveryType, credits: s.credits, ltp: s.ltp, semester: s.semester,
          offeredIn: d.ss.filter(o => o.subjectId === s.id).map(o => ({ section: o.sectionId, theory: o.theoryPeriods, lab: o.labPeriods, teachers: [...new Set(d.ta.filter(t => t.sectionSubjectId === o.id).map(t => d.fac.get(t.facultyId)?.name))] })),
        }))
      }
      case 'list_sections': return d.sections.filter(s => !a?.semester || s.semester === String(a.semester).toUpperCase()).map(s => ({ id: s.id, year: s.year, semester: s.semester, students: s.studentCount, classIncharge: s.classIncharge ? d.fac.get(s.classIncharge)?.name : null }))
      case 'section_timetable': {
        const id = String(a.sectionId)
        if (!d.sections.some(s => s.id === id)) return { error: 'No such section.' }
        const grid: Record<string, Record<string, string>> = {}
        for (const x of d.assignments.filter(x => x.sectionId === id)) for (let p = x.startPeriod; p <= x.endPeriod; p++) (grid[x.day] ??= {})[`P${p}`] = `${slotLabel(d, x)} (${d.fac.get(x.facultyId)?.name ?? x.facultyId})`
        return Object.keys(grid).length ? grid : { note: 'No timetable generated for this section yet.' }
      }
      case 'timetable_problems': {
        if (!d.run) return { note: 'No timetable has been generated yet.' }
        const [c, u] = await Promise.all([getConflictsForRun(d.run.id), getUnscheduledForRun(d.run.id)])
        return { status: d.run.status, conflicts: c.slice(0, 40), unscheduled: u.slice(0, 40), note: 'A teacher above the nominal weekly limit (e.g. 28/24) is allowed and is not a conflict.' }
      }
      case 'workload_report': {
        const teachers = d.faculty.map(f => ({ name: f.name, load: plannedLoad(d, f.id), limit: f.maxWeeklyPeriods })).sort((x, y) => y.load - x.load)
        const open = d.ss.filter(o => !d.ta.some(t => t.sectionSubjectId === o.id)).map(o => `${d.subj.get(o.subjectId)?.code ?? o.subjectId} in ${o.sectionId}`)
        return { teachers, offeringsWithoutTeacher: open.slice(0, 60), openCount: open.length }
      }
      case 'teacher_results': {
        const fid = hod ? (a?.facultyId ? String(a.facultyId) : undefined) : facultyId
        const rows = await listFacultyResults(fid)
        if (fid) return { teacher: d.fac.get(fid)?.name, results: rows.map(r => ({ year: r.academicYear, sem: r.semester, subject: r.subjectName, passPercent: r.passPercent })), summary: summarize(rows) }
        const by = new Map<string, typeof rows>()
        for (const r of rows) (by.get(r.facultyId) ?? by.set(r.facultyId, []).get(r.facultyId)!).push(r)
        return [...by.entries()].map(([id, rs]) => ({ teacher: d.fac.get(id)?.name ?? id, ...summarize(rs) }))
      }
      case 'mail_history': {
        if (!hod) return { error: 'Only the HOD can see mail history.' }
        return (await listMailLog()).slice(-20).map(m => ({ to: m.to, subject: m.subject, sentAt: m.sentAt }))
      }
      case 'draft_email': {
        if (!hod) return { error: 'Only the HOD can send email.' }
        const f = d.fac.get(String(a.facultyId))
        if (!f) return { error: 'No such teacher.' }
        drafts.push({ facultyId: f.id, name: f.name, email: f.email ?? null, subject: String(a.subject), body: String(a.body) })
        return { drafted: true, to: f.name, hasEmailOnFile: Boolean(f.email), note: 'Draft shown to the HOD with a Send button. It has NOT been sent.' }
      }
      default: return { error: `Unknown tool ${name}` }
    }
  }

  const today = new Date().toLocaleDateString('en-IN', { dateStyle: 'full', timeZone: 'Asia/Kolkata' })
  const system = `You are SCEDULAR Assistant, built into the SCEDULAR timetable suite of the AI & DS department, Panimalar Engineering College. Today is ${today}. You are talking to ${me?.name ?? facultyId} (${role === 'HOD' ? 'Head of Department' : 'faculty member'}).
How SCEDULAR works: the HOD sets up sections, syllabus (subjects with theory/lab periods and lab rooms) and teachers in Settings; teachers log in and pick preferred subjects (13+ years experience: years 2-4; fewer: years 1-2); the HOD approves and assigns teachers to sections using workload templates; a constraint solver then generates one clash-free timetable for all ready semesters (no teacher, lab or section double-booked; Library is placed after solving); class timetables export as PDFs; Reports show workload, subject needs, teacher results and timetable analysis; the HOD can email teachers (with login details if wanted).
Rules: Use the tools for any fact about this project and never invent data; if a tool returns nothing, say so. Be warm, concise and direct; ordinary conversation, explanations and writing help are welcome too. Show times on a 12-hour clock, never 24-hour. A teacher above the nominal weekly limit (like 28 of 24) is allowed and is not a conflict. Never reveal passwords or password hashes. ${hod ? 'To email someone, call draft_email (once per recipient) with a polished plain-text letter, then tell the HOD the draft is ready to review and send with the button; you cannot send it yourself, and never say it was sent.' : 'Email sending is HOD-only; politely say so if asked. Share only what a teacher may see: their own results and timetable, and general department data.'} Format answers in short Markdown (bullets or small tables when useful).`

  const msgs = [{ role: 'system', content: system }, ...opts.history.slice(-16).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))]
  const reply = await callLlmWithTools(msgs, TOOLS.filter(t => hod || t.name !== 'draft_email' && t.name !== 'mail_history'), runTool)
  return reply ? { reply, drafts } : null
}
