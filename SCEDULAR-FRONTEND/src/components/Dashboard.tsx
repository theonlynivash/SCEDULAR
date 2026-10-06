import { useEffect, useState } from 'react'
import type { Page } from '../types'
import { api, type LeaveCalendar, type LeaveListItem, type LeaveSummary, type MasterDatasetStatus, type StaffingReport } from '../api'
import type { SemesterReadiness } from '../types'
import { fetchSessionQuote, getCachedQuote, type ScedularQuote } from '../quotes'
import type { AcademicCycle } from '../academicCycle'
import { Btn } from './ui'
import { getSession } from '../session'
import LeaveCalendarView, { SubLine, bareName } from './LeaveCalendar'
import {
  BookOpen,
  Building2,
  Calendar,
  Cpu,
  Database,
  FlaskConical,
  Users,
  UserCheck,
  ClipboardList,
  Bot,
  CalendarOff,
} from 'lucide-react'

/* ---------- Count-up Animation Component ---------- */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const dur = 800
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <span>{n}</span>
}

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
  const [briefLoading, setBriefLoading] = useState(true)
  const [leave, setLeave] = useState<LeaveSummary | null>(null)
  const [leaveList, setLeaveList] = useState<LeaveListItem[]>([])
  const [calMonth, setCalMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7))
  const [cal, setCal] = useState<LeaveCalendar | null>(null)
  const [selDay, setSelDay] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()))
  const me = getSession()?.user.facultyId
  const [quote, setQuote] = useState<ScedularQuote | null>(null)

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
        if (master) {
          setLatestRun({
            runId: master.runId,
            status: master.status,
            generatedAt: master.generatedAt,
            assignmentsCount: master.assignments?.length ?? 0,
          })
        }
        if (prefData?.preferences) setPreferences(prefData.preferences)
        if (cycleData?.currentCycle) setCycle(cycleData.currentCycle)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reloadData()
    // Fetch quote — try cache first, then API
    const cached = getCachedQuote()
    if (cached) setQuote(cached)
    else fetchSessionQuote().then(setQuote)
  }, [])

  // substitution classes and leave letters (everyone: a teacher's own duties; the HOD also the number of letters waiting)
  useEffect(() => { api.leave.summary().then(setLeave).catch(() => setLeave(null)); api.leave.list().then(setLeaveList).catch(() => setLeaveList([])) }, [])
  useEffect(() => { api.leave.calendar(calMonth).then(setCal).catch(() => setCal(null)) }, [calMonth])

  // Briefing data (HOD only): live staffing and readiness, read straight from the department's records.
  useEffect(() => {
    if (role !== 'HOD') { setBriefLoading(false); return }
    Promise.all([
      api.facultyAllocation.staffing().catch(() => null),
      api.facultyAllocation.getReadiness().catch(() => null),
    ]).then(([st, rd]) => { setStaffing(st); setReadiness(rd?.readiness ?? null) }).finally(() => setBriefLoading(false))
  }, [role])

  const counts = datasetStatus?.counts ?? {}
  const totalSections = counts.sections ?? 0
  const totalSubjects = counts.subjects ?? 0
  const totalFaculty = counts.faculty ?? 0
  const totalLabs = counts.labs ?? 0

  const getTimeGreeting = () => {
    const hour = Number(
      new Intl.DateTimeFormat('en-IN', {
        hour: 'numeric',
        hour12: false,
        timeZone: 'Asia/Kolkata',
      }).format(new Date()),
    )
    if (hour >= 5 && hour < 12) return 'Good Morning'
    if (hour >= 12 && hour < 17) return 'Good Afternoon'
    if (hour >= 17 && hour < 21) return 'Good Evening'
    return 'Good Night'
  }

  // Academic-cycle line is derived from the DB-configured cycle — never hardcoded.
  const cycleLine = `2026–27 · ${cycle ?? '—'} Semester · Regulation 2024`

  // Faculty allocation status derived from the authenticated faculty's own preferences.
  const allocationStatus = (() => {
    if (preferences.length === 0) return { label: 'Not Started', tone: 'text-slate-500' }
    const statuses = preferences.map(p => p.status)
    if (statuses.includes('APPROVED')) return { label: 'Approved', tone: 'text-emerald-600' }
    if (statuses.includes('SUBMITTED')) return { label: 'Submitted · Under HOD Review', tone: 'text-amber-600' }
    if (statuses.includes('CHANGES_REQUESTED')) return { label: 'Changes Requested', tone: 'text-amber-600' }
    if (statuses.includes('REJECTED')) return { label: 'Rejected', tone: 'text-rose-600' }
    return { label: 'Draft', tone: 'text-slate-500' }
  })()

  type Brief = { tone: 'ok' | 'warn' | 'todo'; title: string; text: string; go?: Page }
  const briefing: Brief[] = (() => {
    const out: Brief[] = []
    if (role === 'FACULTY') {
      out.push({ tone: preferences.length === 0 ? 'todo' : allocationStatus.label.startsWith('Approved') ? 'ok' : 'warn', title: 'Your subject choices', text: preferences.length === 0 ? 'You have not chosen subjects yet. Open Subject Preferences to start.' : `${preferences.length} subject${preferences.length === 1 ? '' : 's'} chosen. Status: ${allocationStatus.label}.` })
      out.push({ tone: latestRun ? 'ok' : 'todo', title: 'Timetable', text: latestRun ? 'Your timetable is ready to view and download.' : 'The department timetable has not been generated yet.' })
      return out
    }
    if (staffing) {
      out.push(staffing.enough
        ? { tone: 'ok', title: 'Staffing', text: `${staffing.teachers} teachers cover the department's ${staffing.totalDemandPeriods} weekly periods (${staffing.assignedPeriods} assigned, ${staffing.openPeriods} still open).`, go: 'hod-allocation-review' as Page }
        : { tone: 'warn', title: 'Staffing', text: `${staffing.openPeriods} weekly periods are still unassigned and about ${staffing.moreTeachersNeeded} more teacher${staffing.moreTeachersNeeded === 1 ? ' is' : 's are'} needed at ${staffing.maxWeeklyPeriods} periods each.`, go: 'hod-allocation-review' as Page })
    }
    if (readiness && readiness.length) {
      const ready = readiness.filter(r => r.canGenerate)
      const blocked = readiness.filter(r => !r.canGenerate)
      if (blocked.length === 0) out.push({ tone: 'ok', title: 'Readiness', text: `All ${ready.length} semesters in this cycle are ready for timetable generation.`, go: 'generate' as Page })
      else {
        const first = blocked[0]
        const why = first.missingItems?.[0]
        out.push({ tone: 'warn', title: 'Readiness', text: `${ready.length} of ${readiness.length} semesters ready. Semester ${first.semester}${why ? ` is waiting on: ${why}` : ' still has gaps'}${blocked.length > 1 ? ` (and ${blocked.length - 1} more)` : ''}.`, go: 'settings' as Page })
      }
    }
    if (leave && leave.pendingForHod > 0) out.push({ tone: 'warn', title: 'Leave letters', text: `${leave.pendingForHod} leave request${leave.pendingForHod === 1 ? ' is' : 's are'} waiting for you. Assign substitutes for the classes.`, go: 'leave' as Page })
    out.push(latestRun
      ? { tone: 'ok', title: 'Timetable', text: `Generated ${new Date(latestRun.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} with ${latestRun.assignmentsCount} class periods placed.`, go: 'view-timetable' as Page }
      : { tone: 'todo', title: 'Timetable', text: 'Not generated yet. Generate it once staffing and readiness are complete.', go: 'generate' as Page })
    return out
  })()

  const quoteData = quote ?? getCachedQuote()

  const statCards = [
    { label: 'Sections', value: totalSections, icon: Building2, tone: 'from-blue-500/10 to-indigo-500/10', textTone: 'text-[color:var(--c-600)]', page: 'settings' as Page },
    { label: 'Subjects', value: totalSubjects, icon: BookOpen, tone: 'from-emerald-500/10 to-teal-500/10', textTone: 'text-emerald-700', page: 'settings' as Page },
    { label: 'Faculty', value: totalFaculty, icon: Users, tone: 'from-indigo-500/10 to-blue-500/10', textTone: 'text-[color:var(--c-600)]', page: 'faculty' as Page },
    { label: 'Labs', value: totalLabs, icon: FlaskConical, tone: 'from-amber-500/10 to-yellow-500/10', textTone: 'text-amber-700', page: 'lab-management' as Page },
  ]

  const hodQuickActions = [
    { title: 'Assign Teachers', page: 'hod-allocation-review' as Page, icon: ClipboardList, highlight: true },
    { title: 'Generate Timetable', page: 'generate' as Page, icon: Cpu, highlight: false },
    { title: 'View Timetable', page: 'view-timetable' as Page, icon: Calendar, highlight: false },
    { title: 'Teachers', page: 'faculty' as Page, icon: Users, highlight: false },
    { title: 'Subjects & Syllabus', page: 'settings' as Page, icon: BookOpen, highlight: false },
    { title: 'Lab Management', page: 'lab-management' as Page, icon: FlaskConical, highlight: false },
    { title: 'Reports & Workload', page: 'reports' as Page, icon: Database, highlight: false },
  ]

  const facultyQuickActions = [
    { title: 'My Subject Allocation', page: 'faculty-allocation' as Page, icon: BookOpen, highlight: true },
    { title: 'My Preferences', page: 'faculty-allocation' as Page, icon: ClipboardList, highlight: false },
    { title: 'My Timetable', page: 'view-timetable' as Page, icon: Calendar, highlight: false },
    { title: 'My Profile', page: 'profile' as Page, icon: UserCheck, highlight: false },
  ]

  const quickActions = role === 'FACULTY' ? facultyQuickActions : hodQuickActions

  const todayStr = cal?.today ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const dayInfo = cal?.days[selDay]
  const fmtDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
  const waiting = leaveList.filter(l => l.status === 'PENDING')
  const myRecent = leaveList.slice(0, 3)
  const isHod = role === 'HOD'
  const panel = 'liquid-tint rounded-2xl p-4'
  const head3 = 'text-[11px] font-700 tracking-[0.12em] text-[color:var(--c-600)] uppercase'
  const stats = isHod
    ? statCards.map(s => ({ label: s.label, value: s.value, page: s.page }))
    : [{ label: 'Cycle', value: cycle ?? '—', page: 'dashboard' as Page }, { label: 'My allocation', value: allocationStatus.label, page: 'faculty-allocation' as Page }, { label: 'Preferences', value: preferences.length, page: 'faculty-allocation' as Page }]

  return (
    <div className="space-y-4 pb-4">
      {/* header: greeting, cycle and the two main actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h1 className="font-display font-700 text-xl md:text-2xl text-slate-900 tracking-tight">{getTimeGreeting()}{userName ? `, ${userName}` : ''}</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">{isHod ? 'Panimalar AI & DS' : 'Faculty portal'} · {cycleLine}</p>
          {quoteData && <p className="text-[12px] text-slate-500 italic mt-1 truncate" title={`${quoteData.text} — ${quoteData.author}`}>"{quoteData.text}" <span className="not-italic">— {quoteData.author}</span></p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isHod ? (
            <>
              <Btn onClick={() => navigate('generate')}><Cpu size={15} /> Generate timetable</Btn>
              <Btn variant="secondary" onClick={() => navigate('view-timetable')}><Calendar size={15} /> View</Btn>
            </>
          ) : (
            <>
              <Btn onClick={() => navigate('leave')}><CalendarOff size={15} /> Request leave</Btn>
              <Btn variant="secondary" onClick={() => navigate('view-timetable')}><Calendar size={15} /> My timetable</Btn>
            </>
          )}
        </div>
      </div>

      {/* one slim strip of numbers instead of four big cards */}
      <div className={`${panel} !py-2.5 grid grid-cols-2 ${isHod ? 'md:grid-cols-4' : 'md:grid-cols-3'} divide-x divide-white/40`}>
        {stats.map(x => (
          <button key={x.label} onClick={() => navigate(x.page)} className="text-left px-4 py-1 hover:bg-white/30 rounded-lg transition">
            <p className="text-[10.5px] font-600 uppercase tracking-[0.12em] text-slate-500">{x.label}</p>
            <p className="font-display font-800 text-[20px] leading-tight text-[color:var(--c-700)]">{loading ? '—' : typeof x.value === 'number' ? <CountUp to={x.value} /> : x.value}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] items-start">
        {/* left: what needs attention */}
        <div className="space-y-4 min-w-0">
          <div className={panel}>
            <div className="flex items-center gap-2">
              <p className={head3}>{isHod ? 'Substitutions · today' : 'Your substitutions · today'}</p>
              <span className="text-[11px] text-slate-500">{fmtDay(todayStr)}</span>
              <button onClick={() => navigate('leave')} className="ml-auto text-[11.5px] font-600 text-[color:var(--c-600)] hover:underline">Leave →</button>
            </div>
            {(() => {
              const subs = cal?.days[todayStr]?.substitutions ?? []
              const leaves = cal?.days[todayStr]?.leaves ?? []
              if (subs.length === 0 && leaves.length === 0) return <p className="text-[12.5px] text-slate-500 mt-2">{isHod ? 'Nobody is on leave today and no substitution is assigned.' : 'You have no substitution today.'}</p>
              return (
                <div className="mt-2 space-y-1.5">
                  {isHod && leaves.length > 0 && <p className="text-[12.5px] text-slate-600">On leave: {leaves.map(l => bareName(l.facultyName)).join(', ')}</p>}
                  {subs.map(s => <p key={s.id} className="text-[12.5px] text-slate-700 rounded-lg bg-white/60 px-3 py-1.5"><SubLine s={s} me={me} role={role} /></p>)}
                </div>
              )
            })()}
            {!isHod && leave && leave.upcomingDuties.filter(d => d.date > todayStr).length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-white/50">
                <p className="text-[11px] font-700 text-slate-500 uppercase tracking-wide mb-1">Coming up</p>
                {leave.upcomingDuties.filter(d => d.date > todayStr).slice(0, 3).map(d => (
                  <p key={d.id} className="text-[12.5px] text-slate-700 py-0.5">You have a substitution class in place of <b>{bareName(d.inPlaceOfName)}</b>: {new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}, {d.startPeriod === d.endPeriod ? `P${d.startPeriod}` : `P${d.startPeriod}–${d.endPeriod}`}, <b>{d.sectionId}</b></p>
                ))}
              </div>
            )}
          </div>

          <div className={panel}>
            <div className="flex items-center gap-2">
              <p className={head3}>{isHod ? 'Leave requests' : 'My leave requests'}</p>
              {isHod && waiting.length > 0 && <span className="px-2 rounded-full bg-amber-100 text-amber-800 text-[11px] font-700">{waiting.length} waiting</span>}
              <button onClick={() => navigate('leave')} className="ml-auto text-[11.5px] font-600 text-[color:var(--c-600)] hover:underline">{isHod ? 'Open all →' : 'Open →'}</button>
            </div>
            {(isHod ? waiting : myRecent).length === 0 ? (
              <p className="text-[12.5px] text-slate-500 mt-2">{isHod ? 'No leave letter is waiting for you.' : 'You have not sent a leave letter.'}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {(isHod ? waiting.slice(0, 4) : myRecent).map(l => (
                  <li key={l.id} className="flex items-center gap-2 text-[12.5px] rounded-lg bg-white/60 px-3 py-1.5">
                    {isHod && <span className="font-700 text-slate-800">{bareName(l.facultyName)}</span>}
                    <span className="text-slate-600">{l.fromDate === l.toDate ? l.fromDate : `${l.fromDate} → ${l.toDate}`}</span>
                    <span className="text-slate-500">{l.coverage.covered}/{l.coverage.total} covered</span>
                    <span className={`ml-auto px-2 rounded-full text-[10.5px] font-700 ${l.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : l.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{l.status === 'PENDING' ? 'Waiting' : l.status === 'APPROVED' ? 'Approved' : l.status === 'REJECTED' ? 'Not approved' : 'Cancelled'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={panel}>
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[color:var(--c-600)] text-white flex-shrink-0"><Bot size={14} /></span>
              <p className={head3}>{isHod ? 'Department briefing' : 'Your status'}</p>
            </div>
            {briefLoading ? (
              <div className="mt-3 space-y-2 animate-pulse">{[0, 1, 2].map(i => <div key={i} className="h-4 bg-[color:var(--c-600)]/10 rounded w-11/12" />)}</div>
            ) : (
              <ul className="mt-2.5 space-y-2">
                {briefing.map(b => (
                  <li key={b.title} className="flex items-start gap-2.5">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${b.tone === 'ok' ? 'bg-emerald-500' : b.tone === 'warn' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                    <p className="min-w-0 flex-1 text-[12.5px] text-slate-600 leading-snug"><b className="text-slate-800">{b.title}.</b> {b.text}</p>
                    {b.go && <button onClick={() => navigate(b.go!)} className="text-[11.5px] font-600 text-[color:var(--c-600)] hover:underline flex-shrink-0">Open →</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* right: the calendar and the chosen day */}
        <div className="space-y-4">
          <div className={panel}>
            <LeaveCalendarView data={cal} month={calMonth} onMonth={m => { setCalMonth(m); setSelDay(m === todayStr.slice(0, 7) ? todayStr : `${m}-01`) }} selected={selDay} onSelect={setSelDay} />
          </div>
          <div className={panel}>
            <p className={head3}>{fmtDay(selDay)}</p>
            {!dayInfo || (dayInfo.leaves.length === 0 && dayInfo.substitutions.length === 0) ? (
              <p className="text-[12.5px] text-slate-500 mt-1.5">Nothing on this day.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {dayInfo.leaves.map(l => <p key={l.id} className="text-[12.5px] text-slate-700"><span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5" /><b>{bareName(l.facultyName)}</b> on leave{l.status === 'PENDING' ? ' (waiting for approval)' : ''}</p>)}
                {dayInfo.substitutions.map(s => <p key={s.id} className="text-[12.5px] text-slate-700 rounded-lg bg-white/60 px-3 py-1.5"><SubLine s={s} me={me} role={role} /></p>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* shortcuts: one quiet row */}
      <div className="flex flex-wrap gap-2 px-1">
        {quickActions.map(a => {
          const IconComp = a.icon
          return (
            <button key={a.title} onClick={() => navigate(a.page)} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-600 text-[color:var(--c-700)] bg-white/40 ring-1 ring-[color:var(--c-700)]/20 hover:bg-white/70 transition">
              <IconComp size={14} /> {a.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}
