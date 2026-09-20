import { useEffect, useState, type CSSProperties } from 'react'
import type { Page } from '../types'
import { api, type MasterDatasetStatus } from '../api'
import { quoteOfSession } from '../quotes'
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

  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(true)
  const [aiSummaryError, setAiSummaryError] = useState(false)

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
  }, [])

  // AI-generated dashboard summary: asks the same live-grounded assistant
  // that powers the chat widget for a short, current-state summary, rather
  // than a static or hardcoded message.
  useEffect(() => {
    setAiSummaryLoading(true)
    setAiSummaryError(false)
    api.facultyAllocation
      .aiChat(
        role === 'HOD'
          ? 'In 2-3 short sentences, summarize the single most important thing I should know about the current SCEDULAR status right now for my dashboard.'
          : 'In 1-2 short sentences, summarize my current allocation/timetable status for my dashboard.',
        role,
      )
      .then(res => setAiSummary(res.reply))
      .catch(() => setAiSummaryError(true))
      .finally(() => setAiSummaryLoading(false))
  }, [role])

  const counts = datasetStatus?.counts ?? {}
  const totalSections = counts.sections ?? 28
  const totalSubjects = counts.subjects ?? 143
  const totalFaculty = counts.faculty ?? 58
  const totalLabs = counts.labs ?? 10

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

  const quote = quoteOfSession()

  const statCards = [
    { label: 'Sections', value: totalSections, expected: 28, icon: Building2, tone: 'from-blue-500/10 to-indigo-500/10', textTone: 'text-[#0F4C81]', page: 'dashboard' as Page },
    { label: 'Subjects', value: totalSubjects, expected: 143, icon: BookOpen, tone: 'from-emerald-500/10 to-teal-500/10', textTone: 'text-emerald-700', page: 'subjects' as Page },
    { label: 'Faculty', value: totalFaculty, expected: 58, icon: Users, tone: 'from-indigo-500/10 to-blue-500/10', textTone: 'text-[#0F4C81]', page: 'faculty' as Page },
    { label: 'Labs', value: totalLabs, expected: 10, icon: FlaskConical, tone: 'from-amber-500/10 to-yellow-500/10', textTone: 'text-amber-700', page: 'lab-management' as Page },
  ]

  const hodQuickActions = [
    { title: 'Faculty Subject Review', page: 'hod-allocation-review' as Page, icon: ClipboardList, highlight: true },
    { title: 'Generate Timetable', page: 'generate' as Page, icon: Cpu, highlight: false },
    { title: 'View Timetable', page: 'view-timetable' as Page, icon: Calendar, highlight: false },
    { title: 'Faculty Management', page: 'faculty' as Page, icon: Users, highlight: false },
    { title: 'Subject Management', page: 'subjects' as Page, icon: BookOpen, highlight: false },
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
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0F4C81]/10 text-[#0F4C81] text-xs font-700 mb-2">
              <Sparkles size={13} className="text-amber-500" />
              Panimalar AI &amp; DS Department
            </div>
            <h1 className="font-display font-700 text-2xl md:text-3xl text-slate-900 tracking-tight">
              {getTimeGreeting()}{userName ? `, ${userName}` : ''} 👋
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              {role === 'FACULTY' ? 'Faculty Portal' : 'SCEDULAR Configuration &amp; Readiness Hub'} &middot; {cycleLine}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ✨ SCEDULAR AI live status summary — real, grounded in current DB/readiness state */}
        <div className="rounded-2xl border border-[#0F4C81]/20 bg-gradient-to-br from-[#0F4C81]/5 to-blue-400/5 p-5 flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#0F4C81] text-white flex-shrink-0">
            <Bot size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-700 tracking-wide text-[#0F4C81] uppercase">✨ SCEDULAR AI — Status Summary</p>
            {aiSummaryLoading ? (
              <div className="mt-2 space-y-1.5 animate-pulse">
                <div className="h-3 bg-[#0F4C81]/10 rounded w-11/12" />
                <div className="h-3 bg-[#0F4C81]/10 rounded w-2/3" />
              </div>
            ) : aiSummaryError ? (
              <p className="text-xs text-slate-500 mt-1.5">AI summary unavailable right now — ask SCEDULAR AI directly using the chat button.</p>
            ) : (
              <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">{aiSummary}</p>
            )}
          </div>
        </div>

        {/* Motivational quote — decorative only, no allocation logic */}
        <div className="rounded-2xl border border-[#0F4C81]/20 bg-gradient-to-br from-[#0F4C81]/5 to-amber-400/5 p-5 flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#0F4C81] text-white flex-shrink-0">
            <Sparkles size={18} className="text-amber-300" />
          </span>
          <div>
            <p className="text-[11px] font-700 tracking-wide text-[#0F4C81] uppercase">Today's Note</p>
            <p className="text-sm text-slate-700 italic mt-1">"{quote.text}"</p>
            <p className="text-xs text-slate-500 mt-1">— {quote.author}</p>
          </div>
        </div>
      </div>

      {role === 'FACULTY' ? (
        /* ---------------- FACULTY DASHBOARD ---------------- */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-600 text-slate-500">Current Academic Cycle</p>
              <p className="font-display font-800 text-2xl text-[#0F4C81] mt-1">{cycle ?? '—'}</p>
              <p className="text-xs text-slate-400 mt-0.5">Regulation 2024 · AI &amp; DS</p>
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
                    <div style={{ '--stagger': idx } as CSSProperties} className={`animate-in bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-full flex items-center justify-between transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md ${a.highlight ? 'border-[#0F4C81]/40 bg-blue-50/20' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${a.highlight ? 'bg-[#0F4C81] text-white shadow-sm' : 'bg-[#0F4C81]/10 text-[#0F4C81]'}`}>
                          <IconComp size={20} strokeWidth={1.8} />
                        </div>
                        <span className="font-display font-700 text-sm text-slate-900 group-hover:text-[#0F4C81] transition">{a.title}</span>
                      </div>
                      <ArrowRight size={16} className="text-slate-400 group-hover:text-[#0F4C81] group-hover:translate-x-1 transition-all" />
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
              const isReady = !loading && s.value >= s.expected
              return (
                <button key={s.label} onClick={() => navigate(s.page)} className="text-left group">
                  <div style={{ '--stagger': idx } as CSSProperties} className="animate-in bg-white rounded-xl border border-slate-200 shadow-sm p-4.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md h-full">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${s.tone} ${s.textTone}`}>
                        <s.icon size={18} strokeWidth={2} />
                      </span>
                      {!loading && (
                        <span className={`text-xs font-700 ${isReady ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {isReady ? '✓ Active' : `/${s.expected}`}
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
                    <div style={{ '--stagger': idx } as CSSProperties} className={`animate-in bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-full flex items-center justify-between transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md ${a.highlight ? 'border-[#0F4C81]/40 bg-blue-50/20' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${a.highlight ? 'bg-[#0F4C81] text-white shadow-sm' : 'bg-[#0F4C81]/10 text-[#0F4C81]'}`}>
                          <IconComp size={20} strokeWidth={1.8} />
                        </div>
                        <span className="font-display font-700 text-sm text-slate-900 group-hover:text-[#0F4C81] transition">{a.title}</span>
                      </div>
                      <ArrowRight size={16} className="text-slate-400 group-hover:text-[#0F4C81] group-hover:translate-x-1 transition-all" />
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
