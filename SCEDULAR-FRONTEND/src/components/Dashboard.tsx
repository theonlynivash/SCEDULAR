import { useEffect, useState, type CSSProperties } from 'react'
import type { Page } from '../types'
import { api, type MasterDatasetStatus, type StaffingReport } from '../api'
import type { SemesterReadiness } from '../types'
import { fetchSessionQuote, getCachedQuote, type ScedularQuote } from '../quotes'
import type { AcademicCycle } from '../academicCycle'
import { Btn } from './ui'
import {
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  Cpu,
  Database,
  FlaskConical,
  RefreshCw,
  Sparkles,
  Users,
  UserCheck,
  ClipboardList,
  Bot,
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

  return (
    <div className="space-y-6 pb-6">
      {/* Welcome Hero Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[color:var(--c-600)]/10 text-[color:var(--c-600)] text-xs font-700 mb-2">
              <Sparkles size={13} className="text-amber-500" />
              Panimalar AI & DS Department
            </div>
            <h1 className="font-display font-700 text-2xl md:text-3xl text-slate-900 tracking-tight">
              {getTimeGreeting()}{userName ? `, ${userName}` : ''} 👋
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              {role === 'FACULTY' ? 'Faculty Portal' : 'SCEDULAR Configuration & Readiness Hub'} &middot; {cycleLine}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {role === 'FACULTY' ? (
              <>
                <Btn onClick={() => navigate('faculty-allocation')}>
                  <BookOpen size={16} /> My Allocation
                </Btn>
                <Btn variant="secondary" onClick={() => navigate('view-timetable')}>
                  <Calendar size={16} /> My Timetable
                </Btn>
              </>
            ) : (
              <>
                <Btn onClick={() => navigate('generate')}>
                  <Cpu size={16} /> Generate Timetable
                </Btn>
                <Btn variant="secondary" onClick={() => navigate('view-timetable')}>
                  <Calendar size={16} /> View Schedule
                </Btn>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Department briefing: built from live staffing, readiness and timetable records (no generated prose) */}
        <div className="liquid-tint tone-teal rounded-2xl p-5">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-[color:var(--c-600)] text-white flex-shrink-0"><Bot size={16} /></span>
            <p className="text-[11px] font-700 tracking-[0.12em] text-[color:var(--c-600)] uppercase">{role === 'HOD' ? 'Department briefing' : 'Your status'}</p>
          </div>
          {briefLoading ? (
            <div className="mt-3 space-y-2 animate-pulse">
              {[0, 1, 2].map(i => <div key={i} className="h-4 bg-[color:var(--c-600)]/10 rounded w-11/12" />)}
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {briefing.map(b => (
                <li key={b.title} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${b.tone === 'ok' ? 'bg-emerald-500' : b.tone === 'warn' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-700 text-slate-800">{b.title}</p>
                    <p className="text-[12.5px] text-slate-600 leading-snug">{b.text}</p>
                  </div>
                  {b.go && <button onClick={() => navigate(b.go!)} className="text-[11.5px] font-600 text-[color:var(--c-600)] hover:underline flex-shrink-0 mt-0.5">Open →</button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Motivational quote — decorative only, no allocation logic */}
        {quoteData && (
        <div className="rounded-2xl border border-[color:var(--c-600)]/20 bg-gradient-to-br from-[var(--c-600)]/5 to-amber-400/5 p-5 flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[color:var(--c-600)] text-white flex-shrink-0">
            <Sparkles size={18} className="text-amber-300" />
          </span>
          <div>
            <p className="text-[11px] font-700 tracking-wide text-[color:var(--c-600)] uppercase">Today's Note</p>
            <p className="text-sm text-slate-700 italic mt-1">"{quoteData.text}"</p>
            <p className="text-xs text-slate-500 mt-1">— {quoteData.author}</p>
          </div>
        </div>
        )}
      </div>

      {role === 'FACULTY' ? (
        /* ---------------- FACULTY DASHBOARD ---------------- */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-600 text-slate-500">Current Academic Cycle</p>
              <p className="font-display font-800 text-2xl text-[color:var(--c-600)] mt-1">{cycle ?? '—'}</p>
              <p className="text-xs text-slate-400 mt-0.5">Regulation 2024 · AI & DS</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-600 text-slate-500">My Allocation Status</p>
              <p className={`font-display font-800 text-xl mt-1 ${allocationStatus.tone}`}>{allocationStatus.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{preferences.length} preference(s) on record</p>
            </div>
          </div>

          <div>
            <h2 className="font-display font-700 text-base text-slate-900 mb-3">My Quick Links</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {quickActions.map((a, idx) => {
                const IconComp = a.icon
                return (
                  <button key={a.title} onClick={() => navigate(a.page)} className="text-left group transition-all duration-200">
                    <div style={{ '--stagger': idx } as CSSProperties} className={`animate-in bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-full flex items-center justify-between transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md ${a.highlight ? 'border-[color:var(--c-600)]/40 bg-blue-50/20' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${a.highlight ? 'bg-[color:var(--c-600)] text-white shadow-sm' : 'bg-[color:var(--c-600)]/10 text-[color:var(--c-600)]'}`}>
                          <IconComp size={20} strokeWidth={1.8} />
                        </div>
                        <span className="font-display font-700 text-sm text-slate-900 group-hover:text-[color:var(--c-600)] transition">{a.title}</span>
                      </div>
                      <ArrowRight size={16} className="text-slate-400 group-hover:text-[color:var(--c-600)] group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ---------------- HOD DASHBOARD ---------------- */
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((s, idx) => {
              const isReady = !loading && s.value > 0
              return (
                <button key={s.label} onClick={() => navigate(s.page)} className="text-left group">
                  <div style={{ '--stagger': idx } as CSSProperties} className="animate-in bg-white rounded-xl border border-slate-200 shadow-sm p-4.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md h-full">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${s.tone} ${s.textTone}`}>
                        <s.icon size={18} strokeWidth={2} />
                      </span>
                      {!loading && (
                        <span className={`text-xs font-700 ${isReady ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {isReady ? '✓ Active' : 'None yet'}
                        </span>
                      )}
                    </div>
                    <p className="font-display font-800 text-2xl text-slate-900">
                      {loading ? '—' : <CountUp to={s.value} />}
                    </p>
                    <p className="text-xs font-600 text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Master Schedule Status Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${latestRun ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${latestRun ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </span>
              <div>
                <h4 className="font-display font-700 text-sm text-slate-900">
                  {latestRun ? `Active Timetable (Run #${latestRun.runId})` : 'No Timetable Generated Yet'}
                </h4>
                <p className="text-xs text-slate-500">
                  {latestRun ? `${latestRun.assignmentsCount} assignments · 0 hard conflicts` : 'Click generate to run the constraint solver'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {latestRun && (
                <Btn variant="secondary" onClick={() => navigate('generate')}>
                  <RefreshCw size={14} /> Regenerate
                </Btn>
              )}
              <Btn onClick={() => navigate('view-timetable')}>View Timetable →</Btn>
            </div>
          </div>

          {/* Modules Grid */}
          <div>
            <h2 className="font-display font-700 text-base text-slate-900 mb-3">Quick Modules</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {quickActions.map((a, idx) => {
                const IconComp = a.icon
                return (
                  <button key={a.title} onClick={() => navigate(a.page)} className="text-left group transition-all duration-200">
                    <div style={{ '--stagger': idx } as CSSProperties} className={`animate-in bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-full flex items-center justify-between transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md ${a.highlight ? 'border-[color:var(--c-600)]/40 bg-blue-50/20' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${a.highlight ? 'bg-[color:var(--c-600)] text-white shadow-sm' : 'bg-[color:var(--c-600)]/10 text-[color:var(--c-600)]'}`}>
                          <IconComp size={20} strokeWidth={1.8} />
                        </div>
                        <span className="font-display font-700 text-sm text-slate-900 group-hover:text-[color:var(--c-600)] transition">{a.title}</span>
                      </div>
                      <ArrowRight size={16} className="text-slate-400 group-hover:text-[color:var(--c-600)] group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
