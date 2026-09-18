import { useEffect, useState } from 'react'
import type { Page } from '../types'
import { api, type MasterDatasetStatus } from '../api'
import { GlassPanel, Btn } from './ui'
import {
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  Cpu,
  Database,
  FileSpreadsheet,
  FlaskConical,
  RefreshCw,
  Sparkles,
  Users,
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

export default function Dashboard({ navigate }: { navigate: (p: Page) => void }) {
  const [datasetStatus, setDatasetStatus] = useState<MasterDatasetStatus | null>(null)
  const [latestRun, setLatestRun] = useState<{ runId: number; status: string; generatedAt: string; assignmentsCount: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.importMaster.status().catch(() => null),
      api.timetable.master().catch(() => null),
    ])
      .then(([status, master]) => {
        if (status) setDatasetStatus(status)
        if (master) {
          setLatestRun({
            runId: master.runId,
            status: master.status,
            generatedAt: master.generatedAt,
            assignmentsCount: master.assignments?.length ?? 0,
          })
        }
      })
      .finally(() => setLoading(false))
  }, [])

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

  const statCards = [
    { label: 'Sections', value: totalSections, icon: Building2, tone: 'from-blue-500/20 to-indigo-500/20', textTone: 'text-indigo-700' },
    { label: 'Subjects', value: totalSubjects, icon: BookOpen, tone: 'from-emerald-500/20 to-teal-500/20', textTone: 'text-emerald-700' },
    { label: 'Faculty', value: totalFaculty, icon: Users, tone: 'from-[#0e254f]/20 to-[#1e3a8a]/20', textTone: 'text-[#0e254f]' },
    { label: 'Labs', value: totalLabs, icon: FlaskConical, tone: 'from-amber-500/20 to-yellow-500/20', textTone: 'text-amber-700' },
  ]

  const quickActions = [
    { title: 'Generate Timetable', page: 'generate' as Page, icon: Cpu, highlight: true },
    { title: 'View Timetable', page: 'view-timetable' as Page, icon: Calendar, highlight: false },
    { title: 'Data & Import Hub', page: 'data-hub' as Page, icon: Database, highlight: false },
    { title: 'Faculty Management', page: 'faculty-mgmt' as Page, icon: Users, highlight: false },
    { title: 'Subject Management', page: 'subject-mgmt' as Page, icon: BookOpen, highlight: false },
    { title: 'Lab Management', page: 'lab-mgmt' as Page, icon: FlaskConical, highlight: false },
  ]

  return (
    <div className="space-y-6 pb-6">
      {/* Welcome Hero */}
      <GlassPanel strong className="liquid-edge sheen relative overflow-hidden p-6 md:p-8 border border-white/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0e254f]/10 text-[#0e254f] text-xs font-700 mb-2">
              <Sparkles size={13} className="text-[#f3c326]" />
              Panimalar AI & DS Department
            </div>
            <h1 className="font-editorial font-700 text-2xl md:text-3xl text-slate-900 tracking-tight">
              {getTimeGreeting()}, Malathi.S 👋
            </h1>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Btn onClick={() => navigate('generate')}>
              <Cpu size={16} /> Generate Timetable
            </Btn>
            <Btn variant="secondary" onClick={() => navigate('view-timetable')}>
              <Calendar size={16} /> View Schedule
            </Btn>
          </div>
        </div>
      </GlassPanel>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <GlassPanel key={s.label} className="p-4 transition-all duration-200 hover:-translate-y-0.5 border border-white/70">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${s.tone} ${s.textTone}`}>
                <s.icon size={18} strokeWidth={2} />
              </span>
              <span className="text-xs font-600 text-slate-500">{s.label}</span>
            </div>
            <p className="font-display font-800 text-2xl text-slate-900">
              {loading ? '—' : <CountUp to={s.value} />}
            </p>
          </GlassPanel>
        ))}
      </div>

      {/* Master Schedule Status Banner */}
      <GlassPanel strong className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-white/80">
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
              {latestRun ? `${latestRun.assignmentsCount} assignments · 0 conflicts` : 'Click generate to run the solver'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {latestRun && (
            <Btn variant="outline" onClick={() => navigate('generate')}>
              <RefreshCw size={14} /> Regenerate
            </Btn>
          )}
          <Btn onClick={() => navigate('view-timetable')}>
            View Timetable →
          </Btn>
        </div>
      </GlassPanel>

      {/* Modules Grid */}
      <div>
        <h2 className="font-editorial font-700 text-lg text-slate-900 mb-3">
          Modules
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {quickActions.map(a => {
            const IconComp = a.icon
            return (
              <button
                key={a.page}
                onClick={() => navigate(a.page)}
                className="text-left group transition-all duration-200"
              >
                <GlassPanel
                  className={`p-4 h-full flex items-center justify-between transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md border ${
                    a.highlight ? 'border-[#0e254f]/30 bg-white/70' : 'border-white/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
                        a.highlight
                          ? 'bg-[#0e254f] text-white shadow-sm'
                          : 'bg-[#0e254f]/10 text-[#0e254f]'
                      }`}
                    >
                      <IconComp size={20} strokeWidth={1.8} />
                    </div>
                    <span className="font-display font-700 text-sm text-slate-900 group-hover:text-[#0e254f] transition">
                      {a.title}
                    </span>
                  </div>

                  <ArrowRight size={16} className="text-slate-400 group-hover:text-[#0e254f] group-hover:translate-x-1 transition-all" />
                </GlassPanel>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
