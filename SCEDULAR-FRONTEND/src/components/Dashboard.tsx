import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BarChart3, BookOpen, CalendarDays, CalendarOff, ChevronRight, ClipboardList, Cpu, FlaskConical, RefreshCw, UserCheck, Users, type LucideIcon } from 'lucide-react'
import type { Page, SemesterReadiness } from '../types'
import { api, downloadFile, type Assignment, type LeaveCalendar, type LeaveListItem, type LeaveSlotView, type LeaveSummary, type MasterDatasetStatus, type ReminderItem, type ScheduleConfig, type StaffingReport, type Subject } from '../api'
import { fetchFreshQuote, fetchSessionQuote, getCachedQuote, type ScedularQuote } from '../quotes'
import type { AcademicCycle } from '../academicCycle'
import { getSession } from '../session'
import Avatar from './Avatar'
import DayTimeline, { type DayEvent } from './DayTimeline'
import MonthCalendar, { DutyRow, SubRow, mergeSubs } from './LeaveCalendar'
import RemindersPanel from './RemindersPanel'
import { prettyName, shortName } from '../utils/names'

/* ---------- small building blocks ---------- */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 700)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <span>{n}</span>
}

/** a gray heading above a glass panel (the heading sits outside the glass) */
function Group({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: ReactNode }) {
  return (
    <section>
      <div className="lg-title"><h2>{title}</h2>{action && <button onClick={action.onClick}>{action.label}</button>}</div>
      <div className="lg-panel lg-clip">{children}</div>
    </section>
  )
}

function Row({ lead, title, sub, trail, onClick, flush }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; onClick?: () => void; flush?: boolean }) {
  const inner = (
    <>
      {lead}
      <div className="lg-main"><p className="lg-t truncate">{title}</p>{sub && <p className="lg-s truncate">{sub}</p>}</div>
      {trail}
    </>
  )
  const cls = `lg-row ${flush ? '!px-0' : ''}`
  return onClick ? <button type="button" onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>
}
const Chevron = () => <ChevronRight size={16} className="text-slate-400 shrink-0" />
const Quiet = ({ children }: { children: ReactNode }) => <div className="lg-row text-[13.5px] text-slate-600">{children}</div>
const Dot = ({ tone }: { tone: 'ok' | 'warn' | 'todo' }) => <span className={`inline-block w-2 h-2 rounded-full ${tone === 'ok' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-slate-300'}`} />

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const fmtShort = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const fmtRange = (a: string, b: string) => (a === b ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(b)}`)
const academicYear = (today: string) => { const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)); const s = m >= 6 ? y : y - 1; return `${s}–${String((s + 1) % 100).padStart(2, '0')}` }

type StatusCell = { label: string; value: string | number; sub: string; tone: 'ok' | 'warn' | 'todo'; go: Page }

interface DashboardProps {
  navigate: (p: Page) => void
  role?: 'FACULTY' | 'HOD'
  userName?: string
}

export default function Dashboard({ navigate, role = 'HOD', userName = '' }: DashboardProps) {
  const [datasetStatus, setDatasetStatus] = useState<MasterDatasetStatus | null>(null)
  const [latestRun, setLatestRun] = useState<{ runId: number; status: string; generatedAt: string; assignmentsCount: number } | null>(null)
  const [preferences, setPreferences] = useState<any[]>([])
  const [cycle, setCycle] = useState<AcademicCycle | null>(null)
  const [loading, setLoading] = useState(true)

  const [staffing, setStaffing] = useState<StaffingReport | null>(null)
  const [readiness, setReadiness] = useState<SemesterReadiness[] | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [leave, setLeave] = useState<LeaveSummary | null>(null)
  const [leaveList, setLeaveList] = useState<LeaveListItem[]>([])
  const [calMonth, setCalMonth] = useState(() => istToday().slice(0, 7))
  const [cal, setCal] = useState<LeaveCalendar | null>(null)
  const [calFailed, setCalFailed] = useState(false)
  const [selDay, setSelDay] = useState(istToday)
  const me = getSession()?.user.facultyId ?? ''
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const [addOn, setAddOn] = useState<{ date: string; n: number } | null>(null)
  const [quote, setQuote] = useState<ScedularQuote | null>(null)
  const [quoteBusy, setQuoteBusy] = useState(false)
  // the day view: my own periods, the period times, the subject names, and (HOD) today's classes that still have no substitute
  const [myAsg, setMyAsg] = useState<Assignment[] | null>(null)
  const [cfg, setCfg] = useState<ScheduleConfig | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [dayLoading, setDayLoading] = useState(true)
  const [uncovered, setUncovered] = useState<(LeaveSlotView & { who: string })[]>([])
  const isHod = role === 'HOD'

  const reloadData = () => {
    setLoading(true)
    Promise.all([
      api.importMaster.status().catch(() => null),
      api.timetable.master().catch(() => null),
      api.facultyAllocation.getPreferences().catch(() => ({ preferences: [] })),
      api.facultyAllocation.getCycleContext().catch(() => null),
    ])
      .then(([status, master, prefData, cycleData]) => {
        if (status) setDatasetStatus(status)
        if (master) setLatestRun({ runId: master.runId, status: master.status, generatedAt: master.generatedAt, assignmentsCount: master.assignments?.length ?? 0 })
        if (prefData?.preferences) setPreferences(prefData.preferences)
        if (cycleData?.currentCycle) setCycle(cycleData.currentCycle)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reloadData()
    const cached = getCachedQuote()
    if (cached) setQuote(cached)
    else fetchSessionQuote().then(setQuote)
  }, [])

  useEffect(() => { api.leave.summary().then(setLeave).catch(() => setLeave(null)); api.leave.list().then(setLeaveList).catch(() => setLeaveList([])) }, [])
  useEffect(() => { setCalFailed(false); api.leave.calendar(calMonth).then(setCal).catch(() => { setCal(null); setCalFailed(true) }) }, [calMonth])
  const loadReminders = useCallback(() => {
    const t = istToday()
    const from = (calMonth < t.slice(0, 7) ? calMonth : t.slice(0, 7)) + '-01'
    const to = new Date(Date.parse(t + 'T00:00:00Z') + 400 * 86_400_000).toISOString().slice(0, 10)
    api.reminders.list(from, to).then(setReminders).catch(() => setReminders([]))
  }, [calMonth])
  useEffect(() => { loadReminders() }, [loadReminders])

  useEffect(() => {
    if (!me) return
    Promise.all([api.timetable.faculty(me).then(r => r.assignments).catch(() => null), api.config.get().catch(() => null), api.subjects.list().catch(() => [] as Subject[])])
      .then(([a, c, s]) => { setMyAsg(a); setCfg(c); setSubjects(s) }).finally(() => setDayLoading(false))
  }, [me])

  // department status (HOD): live staffing and readiness, read straight from the department's records
  useEffect(() => {
    if (!isHod) { setStatusLoading(false); return }
    Promise.all([api.facultyAllocation.staffing().catch(() => null), api.facultyAllocation.getReadiness().catch(() => null)])
      .then(([st, rd]) => { setStaffing(st); setReadiness(rd?.readiness ?? null) }).finally(() => setStatusLoading(false))
  }, [isHod])

  const todayStr = cal?.today ?? istToday()
  const todayInfo = cal?.days[todayStr]

  // HOD: the classes of today's absent teachers that nobody covers yet
  useEffect(() => {
    if (!isHod || !cal) return
    const ids = (cal.days[todayStr]?.leaves ?? []).map(l => l.id)
    if (ids.length === 0) { setUncovered([]); return }
    Promise.all(ids.map(id => api.leave.get(id).catch(() => null))).then(ds => {
      const out: (LeaveSlotView & { who: string })[] = []
      for (const d of ds) if (d && (d.status === 'APPROVED' || d.status === 'PENDING')) for (const s of d.slots) if (s.date === todayStr && !s.substitute) out.push({ ...s, who: d.facultyName })
      setUncovered(out)
    })
  }, [cal, isHod, todayStr])

  const counts = datasetStatus?.counts ?? {}
  const greetingWord = (() => {
    const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()))
    return hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night'
  })()
  const allocationStatus = (() => {
    if (preferences.length === 0) return { label: 'Not started', tone: 'todo' as const }
    const st = preferences.map(p => p.status)
    if (st.includes('APPROVED')) return { label: 'Approved', tone: 'ok' as const }
    if (st.includes('SUBMITTED')) return { label: 'Under review', tone: 'warn' as const }
    if (st.includes('CHANGES_REQUESTED')) return { label: 'Changes requested', tone: 'warn' as const }
    if (st.includes('REJECTED')) return { label: 'Rejected', tone: 'warn' as const }
    return { label: 'Draft', tone: 'todo' as const }
  })()

  const mySubs = todayInfo?.substitutions ?? []
  const onLeaveToday = (todayInfo?.leaves ?? []).some(l => l.facultyId === me && l.status === 'APPROVED')
  const day = DAYS[new Date(todayStr + 'T00:00:00Z').getUTCDay()]
  const working = cfg ? cfg.workingDays.includes(day) : true
  const periods = useMemo(() => (working ? (cfg?.periods ?? []).filter(p => p.schedulable !== false).sort((a, b) => a.index - b.index) : (cfg?.periods ?? []).filter(p => p.schedulable !== false).sort((a, b) => a.index - b.index)), [cfg, working])

  // everything that happens today, as events of the day view
  const events: DayEvent[] = useMemo(() => {
    const subj = (a: Assignment) => { const s = subjects.find(x => x.id === (a.subjectId ?? a.courseId)); return s ? (s.shortName || s.name) : (a.subjectId ?? a.courseId) }
    const out: DayEvent[] = []
    if (!working) return out
    for (const a of (myAsg ?? []).filter(x => x.day === day)) {
      const taker = mySubs.find(s => s.originalId === me && s.sectionId === a.sectionId && s.startPeriod <= a.endPeriod && a.startPeriod <= s.endPeriod)
      out.push({
        id: `a${a.sectionId}${a.startPeriod}`, start: a.startPeriod, end: a.endPeriod, lab: a.blockType === 'LAB', title: subj(a), sub: a.sectionId,
        ...(taker ? { kind: 'covered' as const, extra: `${shortName(taker.substituteName)} takes it` } : onLeaveToday ? { kind: 'covered' as const, extra: 'You are on leave' } : { kind: 'class' as const, onClick: () => navigate('view-timetable') }),
      })
    }
    for (const s of mergeSubs(mySubs)) {
      if (s.originalId === me) continue                                                    // my own class: already shown as "covered"
      if (!isHod && s.substituteId !== me) continue
      out.push(isHod
        ? { id: `s${s.id}`, start: s.startPeriod, end: s.endPeriod, kind: 'cover', title: `${s.sectionId} · ${s.subject}`, sub: `${shortName(s.substituteName)} for ${shortName(s.originalName)}`, lab: s.blockType === 'LAB', onClick: () => navigate('leave') }
        : { id: `s${s.id}`, start: s.startPeriod, end: s.endPeriod, kind: 'cover', title: s.subject, sub: s.sectionId, extra: `You are covering for ${shortName(s.originalName)}`, lab: s.blockType === 'LAB' })
    }
    if (isHod) for (const u of uncovered) out.push({ id: `u${u.key}`, start: u.startPeriod, end: u.endPeriod, kind: 'uncovered', title: `${u.sectionId} · ${u.subjectName}`, sub: `${shortName(u.who)} is on leave`, extra: 'Needs a substitute', lab: u.blockType === 'LAB', onClick: () => navigate('leave') })
    return out
  }, [myAsg, subjects, mySubs, uncovered, day, me, working, isHod, onLeaveToday, navigate])

  const taught = events.filter(e => e.kind === 'class' || e.kind === 'covered').reduce((n, e) => n + (e.end - e.start + 1), 0)
  const covers = events.filter(e => e.kind === 'cover').length
  const needCover = events.filter(e => e.kind === 'uncovered').length
  const timelineCaption = isHod
    ? `${covers} covered${needCover ? ` · ${needCover} need a substitute` : ''}`
    : `${taught} period${taught === 1 ? '' : 's'}${covers ? ` · ${covers} cover${covers === 1 ? '' : 's'}` : ''}`

  const waiting = leaveList.filter(l => l.status === 'PENDING')
  const myLeaves = leaveList.filter(l => l.status === 'PENDING' || l.status === 'APPROVED').slice(0, 3)
  const laterDuties = (leave?.upcomingDuties ?? []).filter(d => d.date > todayStr).slice(0, 4)
  const needsTimetable = isHod && !loading && !latestRun

  // the status bar
  const cells: StatusCell[] = isHod ? (() => {
    // one cycle has four semesters: ODD = I, III, V, VII; EVEN = II, IV, VI, VIII
    const inCycle = (sem: string) => cycle === 'BOTH' || (cycle === 'ODD' ? ['I', 'III', 'V', 'VII'] : ['II', 'IV', 'VI', 'VIII']).includes(sem)
    const rd = readiness && cycle ? readiness.filter(r => inCycle(r.semester)) : null
    const ready = rd?.filter(r => r.canGenerate).length ?? 0
    const firstBlocked = rd?.find(r => !r.canGenerate)
    const pct = staffing && staffing.totalDemandPeriods ? Math.round((100 * staffing.assignedPeriods) / staffing.totalDemandPeriods) : null
    return [
      { label: 'Staffing', value: pct !== null ? `${pct}%` : '—', sub: staffing ? `${staffing.teachers} teachers${staffing.openPeriods ? ` · ${staffing.openPeriods} periods open` : ''}` : 'Loading…', tone: staffing ? (staffing.enough && staffing.openPeriods === 0 ? 'ok' : 'warn') : 'todo', go: 'hod-allocation-review' },
      { label: 'Readiness', value: rd && rd.length ? `${ready} of ${rd.length}` : '—', sub: !rd ? 'Loading…' : firstBlocked ? `Sem ${firstBlocked.semester}: ${firstBlocked.missingItems?.[0] ?? 'has gaps'}` : 'Every semester can be generated', tone: !rd ? 'todo' : firstBlocked ? 'warn' : 'ok', go: 'settings' },
      { label: 'Timetable', value: latestRun ? 'Generated' : 'Not yet', sub: latestRun ? `${fmtShort(latestRun.generatedAt.slice(0, 10))} · ${latestRun.assignmentsCount} periods` : 'Generate it once everything is ready', tone: latestRun ? 'ok' : 'todo', go: latestRun ? 'view-timetable' : 'generate' },
      { label: 'Leave letters', value: waiting.length, sub: waiting.length ? 'waiting for you' : 'none waiting', tone: waiting.length ? 'warn' : 'ok', go: 'leave' },
    ]
  })() : [
    { label: 'Allocation', value: allocationStatus.label, sub: `${preferences.length} subject${preferences.length === 1 ? '' : 's'} chosen`, tone: allocationStatus.tone, go: 'faculty-allocation' },
    { label: 'Timetable', value: latestRun ? 'Ready' : 'Not yet', sub: latestRun ? 'View or download' : 'Not generated yet', tone: latestRun ? 'ok' : 'todo', go: 'view-timetable' },
    { label: 'Today', value: taught ? `${taught} period${taught === 1 ? '' : 's'}` : 'Free', sub: covers ? `${covers} cover${covers === 1 ? '' : 's'} for colleagues` : working ? 'your classes' : 'not a working day', tone: 'ok', go: 'view-timetable' },
    { label: 'Leave', value: leave?.leaves.days ?? 0, sub: `day${(leave?.leaves.days ?? 0) === 1 ? '' : 's'} taken this cycle`, tone: 'ok', go: 'leave' },
  ]

  // the small tabs at the bottom (the Generate button is only offered while there is no timetable)
  type Shortcut = { label: string; page: Page; icon: LucideIcon; hue: 1 | 2 | 3 | 4 | 5 | 6 }
  const shortcuts: Shortcut[] = isHod
    ? [
        { label: 'Assign Teachers', page: 'hod-allocation-review', icon: ClipboardList, hue: 1 },
        ...(needsTimetable ? [{ label: 'Generate Timetable', page: 'generate' as Page, icon: Cpu, hue: 3 as const }] : []),
        { label: 'View Timetable', page: 'view-timetable', icon: CalendarDays, hue: 4 },
        { label: 'Teachers', page: 'faculty', icon: Users, hue: 3 },
        { label: 'Subjects & Syllabus', page: 'settings', icon: BookOpen, hue: 2 },
        { label: 'Lab rooms', page: 'lab-management', icon: FlaskConical, hue: 5 },
        { label: 'Reports & Workload', page: 'reports', icon: BarChart3, hue: 6 },
      ]
    : [
        { label: 'My Subjects', page: 'faculty-allocation', icon: BookOpen, hue: 1 },
        { label: 'My Timetable', page: 'view-timetable', icon: CalendarDays, hue: 4 },
        { label: 'Leave', page: 'leave', icon: CalendarOff, hue: 3 },
        { label: 'My Profile', page: 'profile', icon: UserCheck, hue: 5 },
      ]

  const quoteData = quote ?? getCachedQuote()
  const marks: Record<string, { leave: number; sub: number; rem: number }> = {}
  for (const [d, v] of Object.entries(cal?.days ?? {})) marks[d] = { leave: v.leaves.length, sub: v.substitutions.length, rem: 0 }
  for (const r of reminders) { const m = (marks[r.date] ??= { leave: 0, sub: 0, rem: 0 }); m.rem += 1 }
  const dayInfo = cal?.days[selDay]
  const dayReminders = reminders.filter(r => r.date === selDay)
  const daySubs = mergeSubs(dayInfo?.substitutions ?? [])
  const dayEmpty = !(dayInfo?.leaves.length) && daySubs.length === 0 && dayReminders.length === 0
  const fmtDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
  // the light on a glass panel follows the pointer
  const glow = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest('.lg-panel') as HTMLElement | null
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  const downloadSheet = (date: string) => downloadFile(`/leave/export/substitutions?date=${date}`, `Substitutions-${date}.pdf`).catch(e => window.alert(e.message))
  const newQuote = () => { if (!quoteData) return; setQuoteBusy(true); fetchFreshQuote(quoteData.text).then(setQuote).finally(() => setQuoteBusy(false)) }

  const caption = [
    new Date(todayStr + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    cycle ? `${cycle === 'BOTH' ? 'Both' : cycle[0] + cycle.slice(1).toLowerCase()} semesters ${academicYear(todayStr)}` : null,
    ...(isHod && datasetStatus ? [`${counts.sections ?? 0} sections`, `${counts.faculty ?? 0} faculty`, `${counts.labs ?? 0} labs`] : []),
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-6 sm:space-y-7 pb-4 pl-[2px]" onPointerMove={glow}>
      {/* ── masthead ── */}
      <header className="flex flex-col lg:flex-row lg:items-end gap-5 lg:gap-12">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-500 text-slate-700" style={{ textIndent: '-0.055em' }}>{caption}</p>
          <h1 className="mt-1.5 font-display text-[30px] sm:text-[42px] leading-[1.05] font-700 tracking-[-0.03em] text-slate-900" style={{ textIndent: '-0.048em' }}>Good {greetingWord},{' '}<span className="whitespace-nowrap text-[color:var(--c-700)]">{prettyName(userName) || 'welcome'}</span></h1>
          {quoteData && (
            <figure className="mt-4 max-w-[44rem]">
              <blockquote className="font-quote italic text-[19px] sm:text-[22px] leading-[1.38] text-slate-800" style={{ textIndent: '-0.125em' }}>“{quoteData.text}”</blockquote>
              <figcaption className="mt-2 flex items-center gap-2 text-[13px] font-500 text-slate-700">
                <span>— {quoteData.author}</span>
                <button onClick={newQuote} disabled={quoteBusy} title="Show another quote" aria-label="Show another quote" className="lg-icon-btn !w-7 !h-7 !text-slate-600 disabled:opacity-50"><RefreshCw size={14} className={quoteBusy ? 'animate-spin' : ''} /></button>
              </figcaption>
            </figure>
          )}
        </div>
        <div className="flex gap-2.5 shrink-0">
          {isHod ? (
            <>
              {needsTimetable
                ? <button className="lg-btn lg-btn-primary flex-1 sm:flex-none" onClick={() => navigate('generate')}>Generate timetable</button>
                : <button className="lg-btn lg-btn-primary flex-1 sm:flex-none" onClick={() => navigate('view-timetable')}>View timetable</button>}
              <button className="lg-btn lg-btn-glass flex-1 sm:flex-none" onClick={() => navigate('leave')}>Take leave</button>
            </>
          ) : (
            <>
              <button className="lg-btn lg-btn-primary flex-1 sm:flex-none" onClick={() => navigate('leave')}>Request leave</button>
              <button className="lg-btn lg-btn-glass flex-1 sm:flex-none" onClick={() => navigate('view-timetable')}>My timetable</button>
            </>
          )}
        </div>
      </header>

      {/* ── status bar ── */}
      <section className="lg-panel lg-clip lg-stats" style={{ ['--cols' as any]: cells.length }}>
        {cells.map(c => (
          <button key={c.label} onClick={() => navigate(c.go)} data-tone={c.tone} className="min-w-0">
            <p className="flex items-center gap-2 text-[12.5px] font-600 text-slate-600"><Dot tone={c.tone} />{c.label}</p>
            <p className="mt-1 font-display text-[22px] sm:text-[24px] font-600 tracking-tight tabular-nums text-slate-900 leading-tight truncate">{(loading || (isHod && statusLoading)) && c.value === '—' ? '—' : typeof c.value === 'number' ? <CountUp to={c.value} /> : c.value}</p>
            <p className="text-[12.5px] text-slate-600 truncate">{c.sub}</p>
          </button>
        ))}
      </section>

      {/* today: only when there is something to show; a slim row that opens as a dropdown */}
      {events.length > 0 && periods.length > 0 && (
        <DayTimeline title={isHod ? 'Today' : 'My day'} caption={timelineCaption} periods={periods} events={events}
          onOpen={() => navigate(isHod ? 'leave' : 'view-timetable')} openLabel={isHod ? 'Leave' : 'Timetable'} onDownload={isHod ? () => downloadSheet(todayStr) : undefined} />
      )}

      <div className="grid gap-6 sm:gap-7 xl:grid-cols-[minmax(0,1fr)_26rem] items-start">
        {/* ── the calendar, with the chosen day beside it ── */}
        <section className="lg-panel p-5 sm:p-6 grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-0">
          <div className="md:pr-7">
            <MonthCalendar month={calMonth} today={todayStr} selected={selDay} marks={marks}
              onMonth={m => { setCalMonth(m); setSelDay(m === todayStr.slice(0, 7) ? todayStr : `${m}-01`) }} onSelect={setSelDay} />
          </div>
          <div className="md:pl-7 md:border-l border-slate-900/[0.09] pt-5 md:pt-0 border-t md:border-t-0">
            <div className="flex items-baseline gap-3">
              <h3 className="text-[15px] font-700 text-slate-900">{fmtDay(selDay)}</h3>
              <span className="ml-auto flex items-center gap-4">
                {isHod && (daySubs.length > 0 || (dayInfo?.leaves.length ?? 0) > 0) && <button onClick={() => downloadSheet(selDay)} className="text-[13px] font-600 text-[color:var(--c-600)] hover:underline">Substitution sheet (PDF)</button>}
                {selDay >= todayStr && <button onClick={() => setAddOn({ date: selDay, n: Date.now() })} className="text-[13px] font-600 text-[color:var(--c-600)] hover:underline">Add reminder</button>}
              </span>
            </div>
            {dayEmpty ? <p className="mt-2 text-[13.5px] text-slate-600">Nothing on this day.</p> : (
              <div className="mt-1.5">
                {dayInfo?.leaves.map(l => <Row flush key={`l${l.id}`} lead={<span className="lg-lead">Leave</span>} title={shortName(l.facultyName)} sub={l.status === 'PENDING' ? 'Waiting for approval' : 'On leave'} />)}
                {daySubs.map(s => <SubRow key={s.id} s={s} me={me} role={role} flush />)}
                {dayReminders.map(r => <Row flush key={`r${r.id}`} lead={<span className="lg-lead">{r.time ?? 'All day'}</span>} title={r.title} sub={r.note || undefined} />)}
              </div>
            )}
          </div>
        </section>

        {/* ── what is waiting, and the reminders ── */}
        <div className="space-y-6 sm:space-y-7 min-w-0">
          {isHod ? (
            <Group title="Leave requests" action={{ label: 'View all', onClick: () => navigate('leave') }}>
              {waiting.length === 0 ? <Quiet>No leave letter is waiting for you.</Quiet> : waiting.slice(0, 5).map(l => (
                <Row key={l.id} onClick={() => navigate('leave')}
                  lead={<Avatar id={l.facultyId} name={l.facultyName} size={36} />}
                  title={prettyName(l.facultyName)}
                  sub={`${fmtRange(l.fromDate, l.toDate)} · ${l.classes} class${l.classes === 1 ? '' : 'es'} · ${l.coverage.covered} covered`}
                  trail={<><span className="text-[13px] font-600 text-[color:var(--c-600)]">Review</span><Chevron /></>} />
              ))}
            </Group>
          ) : (
            <>
              {laterDuties.length > 0 && <Group title="Coming up" action={{ label: 'Leave', onClick: () => navigate('leave') }}>{laterDuties.map(d => <DutyRow key={d.id} d={d} />)}</Group>}
              <Group title="My leave" action={{ label: 'Request leave', onClick: () => navigate('leave') }}>
                {myLeaves.length === 0 ? <Quiet>You have no leave on record.</Quiet> : myLeaves.map(l => (
                  <Row key={l.id} onClick={() => navigate('leave')} title={fmtRange(l.fromDate, l.toDate)}
                    sub={`${l.reason}${l.coverage.total ? ` · ${l.coverage.covered} of ${l.coverage.total} classes covered` : ''}`}
                    trail={<><span className={`text-[13px] font-600 ${l.status === 'APPROVED' ? 'text-emerald-700' : 'text-amber-700'}`}>{l.status === 'APPROVED' ? 'Approved' : 'Waiting'}</span><Chevron /></>} />
                ))}
              </Group>
            </>
          )}
          <RemindersPanel items={reminders} today={todayStr} isHod={isHod} openFor={addOn} onChanged={loadReminders} />
        </div>
      </div>

      {/* ── the small tabs ── */}
      <section>
        <div className="lg-title"><h2>Shortcuts</h2></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {shortcuts.map(t => (
            <button key={t.label} onClick={() => navigate(t.page)} className="lg-panel lg-tile" style={{ ['--tc' as any]: `var(--t${t.hue})`, ['--tc-rgb' as any]: `var(--t${t.hue}-rgb)` }}>
              <span className="lg-tile-ic"><t.icon size={19} strokeWidth={1.9} /></span>
              <span className="min-w-0 leading-tight">{t.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
