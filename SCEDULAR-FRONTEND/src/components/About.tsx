import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Page } from '../types'
import { PageHeader, GlassPanel, Chip, Btn } from './ui'
import { api, type MasterDatasetStatus } from '../api'
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  Code,
  Cpu,
  Database,
  GraduationCap,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

/* ---------- Scroll reveal wrapper ---------- */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`reveal ${visible ? 'in-view' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

/* ---------- Count-up number ---------- */
function CountUp({ to, className = '' }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const obs = new IntersectionObserver(
      entries => {
        if (!entries[0].isIntersecting) return
        obs.disconnect()
        const t0 = performance.now()
        const dur = 1200
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur)
          setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
          if (p < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [to])
  return <span ref={ref} className={className}>{n}</span>
}

/* ---------- Section Title ---------- */
function SectionTitle({ kicker, title, desc }: { kicker: string; title: string; desc?: string }) {
  return (
    <Reveal>
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f3c326]/15 border border-[#f3c326]/30 text-[#c98f00] text-[11px] font-700 tracking-wider uppercase mb-2">
          <Sparkles size={12} />
          {kicker}
        </div>
        <h3 className="font-editorial font-600 text-2xl md:text-3xl text-slate-900 tracking-tight">{title}</h3>
        {desc && <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">{desc}</p>}
      </div>
    </Reveal>
  )
}

/* ---------- Pipeline Data ---------- */
const STAGES = [
  {
    step: '01',
    tag: 'Stage 01 · Input',
    title: 'Structured Master Workbook',
    desc: 'Upload normalized Excel datasets (.xlsx) containing Sections, Subjects, Teaching Assignments, Labs, and Faculty Unavailability.',
    detail: 'Parses 7 required sheets with transactional integrity. Multi-section teaching assignments are preserved without duplicating faculty entries.',
    icon: Database,
  },
  {
    step: '02',
    tag: 'Stage 02 · Validate',
    title: 'Pre-Flight Diagnostic Filter',
    desc: 'Malformed rows, invalid course codes, missing faculty IDs, or structural inconsistencies are flagged before generation.',
    detail: 'Ensures bad data never reaches the solver. Clean error bounds give pinpoint sheet and row references.',
    icon: ShieldCheck,
  },
  {
    step: '03',
    tag: 'Stage 03 · Expand',
    title: 'Requirement Explosion',
    desc: 'Weekly demand (e.g. 5 theory periods + 3-period lab block) is exploded into individual schedulable units.',
    detail: 'Determines block constraints, contiguous lab requirements, and multi-period lab teacher assignments.',
    icon: Layers,
  },
  {
    step: '04',
    tag: 'Stage 04 · Solve',
    title: 'MRV Constraint Backtracking CSP',
    desc: 'Dynamic Most-Constrained-First (Minimum Remaining Values) search across periods, rooms, and faculty.',
    detail: 'Evaluates thousands of states per second, prioritizing heavily constrained lab blocks and overloaded faculty first.',
    icon: Cpu,
  },
  {
    step: '05',
    tag: 'Stage 05 · Verify',
    title: 'Independent Post-Validation',
    desc: 'An independent validator replays 13 hard constraints against the output grid to guarantee zero fabricated results.',
    detail: 'Checks for teacher double-booking, section room conflicts, daily subject caps, and contiguous lab continuity.',
    icon: CheckCircle2,
  },
  {
    step: '06',
    tag: 'Stage 06 · Output',
    title: 'GREEN / RED Status Contract',
    desc: 'Yields a verified master schedule (GREEN) when feasible, or a detailed conflict matrix (RED) if infeasible.',
    detail: 'Never silently masks broken constraints or produces partial broken schedules.',
    icon: Zap,
  },
  {
    step: '07',
    tag: 'Stage 07 · Views',
    title: 'Projections & Exports',
    desc: 'Generates Class, Faculty, Lab, and Conflict views — all projecting the single authoritative master timetable.',
    detail: 'Enables instant filtering by Department, Year (I–IV), and Semester (I–VIII).',
    icon: Activity,
  },
]

const HARD_CONSTRAINTS = [
  { id: 1, title: 'No Section Conflict', desc: 'A section cannot have two classes assigned to the exact same period.' },
  { id: 2, title: 'No Faculty Clash', desc: 'A teacher cannot teach two different sections simultaneously.' },
  { id: 3, title: 'No Physical Lab Overlap', desc: 'A physical lab space cannot host multiple sections concurrently.' },
  { id: 4, title: 'Exact Weekly Load', desc: 'Required theory & lab period counts must be satisfied completely for every section.' },
  { id: 5, title: 'Faculty Subject Eligibility', desc: 'Teachers are assigned strictly to subjects/components they are qualified for.' },
  { id: 6, title: 'Teacher Availability & Caps', desc: 'Max daily periods, max weekly load, and explicit unavailable times are strictly respected.' },
  { id: 7, title: 'Break & Lunch Exclusion', desc: 'Scheduled tea breaks and lunch intervals never host academic assignments.' },
  { id: 8, title: 'Contiguous Lab Blocks', desc: 'Practical lab sessions occupy continuous 3-period blocks without interruption.' },
  { id: 9, title: 'No Lab Boundary Cross', desc: 'Lab blocks cannot cross tea break or lunch boundary times.' },
  { id: 10, title: 'Lab Teacher Continuity', desc: 'Assigned lab faculty remain occupied for the entire contiguous lab session.' },
  { id: 11, title: 'Completeness Guarantee', desc: 'No partial or duplicate period assignment is accepted as complete.' },
  { id: 12, title: 'Strict Pre-validation', desc: 'Malformed data is rejected before solver execution begins.' },
  { id: 13, title: 'Zero False Success', desc: 'Infeasible constraint combinations yield explicit conflict diagnostics, never silent errors.' },
]

const SOFT_CONSTRAINTS = [
  { id: 1, title: 'Faculty Load Balancing', desc: 'Evens out weekly teaching hours across department faculty members.' },
  { id: 2, title: 'Gap Minimization', desc: 'Reduces idle free periods between classes for individual teachers.' },
  { id: 3, title: 'Avoid Overwork Blocks', desc: 'Prevents faculty from having more than 3 consecutive heavy teaching periods.' },
  { id: 4, title: 'Subject Weekly Spacing', desc: 'Spreads multiple occurrences of a subject evenly across the 5 working days.' },
  { id: 5, title: 'Section Load Distribution', desc: 'Balances daily academic work for students to avoid heavy single-day schedules.' },
  { id: 6, title: 'Optimal Lab Timing', desc: 'Prefers morning or early afternoon placement for lab blocks.' },
  { id: 7, title: 'Teacher Preferences', desc: 'Accommodates department-configured preferred teaching slots where possible.' },
]

/* ---------- Mini Interactive Solver Simulation Widget ---------- */
function SolverSimulation() {
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const [grid, setGrid] = useState<string[]>(Array(15).fill('EMPTY'))

  const subjects = ['DBMS Lab', 'AI & ML', 'Python', 'DS Lab', 'Maths IV', 'Networks', 'OS Lab', 'Web Dev', 'Cyber Sec', 'DBMS Lab', 'AI & ML', 'Python', 'DS Lab', 'Maths IV', 'Networks']
  const colors = ['#dbeafe', '#dcfce7', '#fce7f3', '#fef3c7', '#ede9fe', '#ffedd5', '#e0f2fe', '#fee2e2']

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      setStep(prev => {
        if (prev >= subjects.length) {
          setRunning(false)
          return prev
        }
        setGrid(g => {
          const next = [...g]
          next[prev] = subjects[prev]
          return next
        })
        return prev + 1
      })
    }, 180)
    return () => clearInterval(interval)
  }, [running])

  function resetSim() {
    setRunning(false)
    setStep(0)
    setGrid(Array(15).fill('EMPTY'))
  }

  function startSim() {
    resetSim()
    setTimeout(() => setRunning(true), 50)
  }

  return (
    <GlassPanel strong className="p-6 overflow-hidden relative border border-white/80">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-700 uppercase tracking-wider text-slate-500">
            <Cpu size={14} className="text-[#0e254f]" />
            Interactive Solver Sandbox
          </div>
          <h4 className="font-display font-800 text-lg text-slate-900 mt-0.5">
            MRV Backtracking Algorithm in Action
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="secondary" onClick={resetSim} disabled={step === 0 && !running}>
            <RefreshCw size={14} className={running ? 'animate-spin' : ''} /> Reset
          </Btn>
          <Btn onClick={startSim} disabled={running}>
            <Play size={14} /> {running ? 'Solving...' : 'Play Solver Demo'}
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 my-4">
        {grid.map((cell, idx) => {
          const filled = cell !== 'EMPTY'
          const bg = filled ? colors[idx % colors.length] : 'rgba(255,255,255,0.3)'
          return (
            <div
              key={idx}
              className={`rounded-xl p-3 text-center transition-all duration-300 border min-h-[64px] flex flex-col items-center justify-center ${
                filled
                  ? 'border-slate-300/80 shadow-sm scale-100'
                  : 'border-dashed border-slate-300/50 scale-95 opacity-60'
              }`}
              style={{ background: bg }}
            >
              <span className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">
                P{idx + 1}
              </span>
              <span className={`text-xs font-700 mt-0.5 truncate w-full ${filled ? 'text-slate-800' : 'text-slate-400'}`}>
                {cell}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200/60">
        <span>Assigned: <strong className="text-slate-800 font-700">{step} / {subjects.length}</strong> slots</span>
        <span className="flex items-center gap-1 text-emerald-700 font-600">
          <CheckCircle2 size={14} /> Hard Constraints Enforced: 100%
        </span>
      </div>
    </GlassPanel>
  )
}

/* ---------- Person Card ---------- */
function PersonCard({
  name,
  role,
  email,
  initials,
  badge,
}: {
  name: string
  role: string
  email: string
  initials: string
  badge: string
}) {
  return (
    <GlassPanel className="p-6 flex items-start gap-4 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_rgba(7,20,51,0.14)] group relative overflow-hidden border border-white/70">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-2 ring-[#f3c326]/60 text-white font-display font-800 text-xl shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-800 uppercase tracking-wider bg-[#0e254f]/10 text-[#0e254f] mb-1">
          {badge}
        </div>
        <p className="font-editorial font-700 text-lg text-slate-900 group-hover:text-[#0e254f] transition">{name}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{role}</p>
        <a
          href={`mailto:${email}`}
          className="inline-flex items-center gap-1.5 text-xs text-[#0e254f] hover:text-[#081a38] font-700 mt-2 transition"
        >
          {email} <ChevronRight size={12} />
        </a>
      </div>
    </GlassPanel>
  )
}

export default function About({ navigate }: { navigate: (p: Page) => void }) {
  const [activeStage, setActiveStage] = useState(3)
  const [constraintTab, setConstraintTab] = useState<'all' | 'hard' | 'soft'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [liveStatus, setLiveStatus] = useState<MasterDatasetStatus | null>(null)

  useEffect(() => {
    api.importMaster.status().then(setLiveStatus).catch(() => setLiveStatus(null))
  }, [])

  const filteredHard = HARD_CONSTRAINTS.filter(
    c => c.title.toLowerCase().includes(searchQuery.toLowerCase()) || c.desc.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredSoft = SOFT_CONSTRAINTS.filter(
    c => c.title.toLowerCase().includes(searchQuery.toLowerCase()) || c.desc.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const counts = liveStatus?.counts ?? {}

  return (
    <div className="space-y-12 pb-8">
      <PageHeader title="About SCEDULAR">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-600 text-slate-600 glass-pill transition hover:bg-white/60"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>
      </PageHeader>

      {/* Hero */}
      <GlassPanel strong className="liquid-edge sheen relative overflow-hidden p-8 md:p-14 text-center about-hero border border-white/80">
        <div className="about-hero-glow" aria-hidden="true" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <Reveal>
            <div className="mx-auto mb-5 transition-transform duration-500 hover:scale-[1.04]" style={{ width: 'fit-content' }}>
              <img src="/SCEDULAR_LOGO.png" alt="SCEDULAR timetable system" className="block w-full max-w-[340px] h-auto drop-shadow-md" />
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="font-editorial font-700 text-3xl md:text-5xl leading-[1.12] tracking-tight text-gradient-brand">
              Timetables that solve themselves.
            </h2>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-base text-slate-600 max-w-2xl mx-auto mt-4 leading-relaxed font-400">
              Deterministic, constraint-driven college timetable engine built for Panimalar Engineering College — designed & developed by KERNUL TECH.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex justify-center gap-2.5 mt-6 flex-wrap">
              <Chip tone="accent">Department-Wide</Chip>
              <Chip tone="success">Any Year (I–IV) · Any Semester (I–VIII)</Chip>
              <Chip tone="warning">Zero Fabricated Results</Chip>
              <Chip tone="info">MRV CSP Backtracking</Chip>
            </div>
          </Reveal>
        </div>
      </GlassPanel>

      {/* Live System Metrics & Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Database, v: liveStatus ? counts.sections ?? 0 : 12, label: 'Active Sections Loaded', sub: 'Canonical Workload' },
          { icon: GraduationCap, v: liveStatus ? counts.faculty ?? 0 : 31, label: 'Faculty Members', sub: 'Max Load Enforced' },
          { icon: Cpu, v: HARD_CONSTRAINTS.length, label: 'Hard Constraints', sub: 'Strictly Enforced' },
          { icon: Sparkles, v: SOFT_CONSTRAINTS.length, label: 'Soft Optimizations', sub: 'Load Balanced' },
        ].map((s, i) => (
          <Reveal key={s.label} delay={i * 80}>
            <GlassPanel className="p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(7,20,51,0.12)] border border-white/70">
              <div className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center bg-gradient-to-br from-[#0e254f] to-[#081a38] text-[#f3c326] mb-3 shadow-md">
                <s.icon size={20} strokeWidth={2} />
              </div>
              <p className="font-display font-800 text-3xl text-[#0e254f]">
                <CountUp to={s.v} />
              </p>
              <p className="text-xs font-700 text-slate-800 mt-1">{s.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{s.sub}</p>
            </GlassPanel>
          </Reveal>
        ))}
      </div>

      {/* Interactive Solver Sandbox */}
      <Reveal delay={150}>
        <SolverSimulation />
      </Reveal>

      {/* Interactive 7-Stage Pipeline Explorer */}
      <div>
        <SectionTitle
          kicker="Architecture & Pipeline"
          title="From Raw Excel to Conflict-Free Master Grid"
          desc="Click any pipeline stage below to inspect its operational role, diagnostics, and algorithm phase."
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Stage Buttons */}
          <div className="lg:col-span-5 space-y-2">
            {STAGES.map((st, idx) => {
              const active = activeStage === idx
              const IconComp = st.icon
              return (
                <button
                  key={st.step}
                  onClick={() => setActiveStage(idx)}
                  className={`w-full text-left p-4 rounded-2xl transition-all duration-300 flex items-center gap-3.5 border ${
                    active
                      ? 'bg-gradient-to-r from-[#0e254f] to-[#081a38] text-white shadow-lg border-transparent scale-[1.02]'
                      : 'bg-white/40 hover:bg-white/70 text-slate-800 border-white/60'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-800 text-xs flex-shrink-0 ${
                      active ? 'bg-[#f3c326] text-[#0e254f]' : 'bg-[#0e254f]/10 text-[#0e254f]'
                    }`}
                  >
                    {st.step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-700 tracking-wider uppercase ${active ? 'text-[#f3c326]' : 'text-slate-400'}`}>
                      {st.tag}
                    </p>
                    <p className="font-display font-700 text-sm truncate">{st.title}</p>
                  </div>
                  <IconComp size={18} className={active ? 'text-[#f3c326]' : 'text-slate-400'} />
                </button>
              )
            })}
          </div>

          {/* Stage Details Panel */}
          <div className="lg:col-span-7">
            <GlassPanel strong className="p-7 min-h-[380px] flex flex-col justify-between border border-white/80">
              <div>
                <div className="flex items-center justify-between gap-3 mb-4 border-b border-slate-200/70 pb-4">
                  <span className="px-3 py-1 rounded-full text-xs font-800 uppercase tracking-wider bg-[#0e254f] text-[#f3c326]">
                    {STAGES[activeStage].tag}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Stage {activeStage + 1} of 7</span>
                </div>

                <h4 className="font-editorial font-700 text-2xl text-slate-900 mb-2">
                  {STAGES[activeStage].title}
                </h4>

                <p className="text-sm text-slate-600 leading-relaxed mb-5">
                  {STAGES[activeStage].desc}
                </p>

                <div className="rounded-xl bg-[#0e254f]/[0.04] border border-[#0e254f]/10 p-4 mb-4">
                  <p className="text-xs font-700 text-[#0e254f] uppercase tracking-wider mb-1">
                    Technical Mechanism
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed font-mono">
                    {STAGES[activeStage].detail}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200/70 text-xs">
                <button
                  onClick={() => setActiveStage(prev => Math.max(0, prev - 1))}
                  disabled={activeStage === 0}
                  className="text-slate-500 hover:text-slate-900 font-600 disabled:opacity-30"
                >
                  ← Previous Stage
                </button>
                <div className="flex gap-1">
                  {STAGES.map((_, i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full transition-all ${
                        activeStage === i ? 'bg-[#0e254f] w-5' : 'bg-slate-300'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setActiveStage(prev => Math.min(STAGES.length - 1, prev + 1))}
                  disabled={activeStage === STAGES.length - 1}
                  className="text-slate-900 hover:text-[#0e254f] font-700 disabled:opacity-30"
                >
                  Next Stage →
                </button>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>

      {/* Dynamic Rule Explorer & Filter */}
      <div>
        <SectionTitle
          kicker="Validation Contract"
          title="Engineered Guarantees & Constraints"
          desc="Search or filter the 13 strict hard constraints and 7 soft optimization objectives enforced by the solver."
        />

        <GlassPanel className="p-6 border border-white/70">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div className="flex gap-1 glass-pill rounded-full p-1">
              <button
                onClick={() => setConstraintTab('all')}
                className={`px-4 py-1.5 rounded-full text-xs font-700 transition ${
                  constraintTab === 'all' ? 'glass-pill-active text-[#0e254f]' : 'text-slate-600'
                }`}
              >
                All Rules ({HARD_CONSTRAINTS.length + SOFT_CONSTRAINTS.length})
              </button>
              <button
                onClick={() => setConstraintTab('hard')}
                className={`px-4 py-1.5 rounded-full text-xs font-700 transition ${
                  constraintTab === 'hard' ? 'glass-pill-active text-rose-700' : 'text-slate-600'
                }`}
              >
                Hard Constraints ({HARD_CONSTRAINTS.length})
              </button>
              <button
                onClick={() => setConstraintTab('soft')}
                className={`px-4 py-1.5 rounded-full text-xs font-700 transition ${
                  constraintTab === 'soft' ? 'glass-pill-active text-amber-700' : 'text-slate-600'
                }`}
              >
                Soft Optimizations ({SOFT_CONSTRAINTS.length})
              </button>
            </div>

            <div className="relative min-w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search constraint rules..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="glass-input w-full pl-9 pr-3 py-1.5 text-xs rounded-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(constraintTab === 'all' || constraintTab === 'hard') && (
              <div className="space-y-3">
                <p className="text-xs font-800 uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Hard Constraints (Strict / Mandatory)
                </p>
                {filteredHard.map(rule => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-xl bg-white/50 border border-rose-200/50 hover:border-rose-300 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-rose-400/15 text-rose-700 text-[10px] font-800 flex items-center justify-center">
                        {rule.id}
                      </span>
                      <h5 className="text-xs font-700 text-slate-900">{rule.title}</h5>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 pl-7 leading-relaxed">{rule.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {(constraintTab === 'all' || constraintTab === 'soft') && (
              <div className="space-y-3">
                <p className="text-xs font-800 uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                  <Sparkles size={14} /> Soft Constraints (Optimizations)
                </p>
                {filteredSoft.map(rule => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-xl bg-white/50 border border-amber-200/50 hover:border-amber-300 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-400/15 text-amber-700 text-[10px] font-800 flex items-center justify-center">
                        {rule.id}
                      </span>
                      <h5 className="text-xs font-700 text-slate-900">{rule.title}</h5>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 pl-7 leading-relaxed">{rule.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassPanel>
      </div>

      {/* Creator & Institutional Credits */}
      <div>
        <SectionTitle
          kicker="Engineering & Leadership"
          title="Developed by KERNUL TECH"
          desc="Engineered for Panimalar Engineering College, Artificial Intelligence & Data Science Department."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PersonCard
            name="Srinivash Karthikeyan"
            role="Lead System Architect & Developer · B.Tech AI & DS (2nd Year)"
            email="theonlynivash@gmail.com"
            initials="SK"
            badge="Lead Developer"
          />
          <PersonCard
            name="Prof. Suganya Devi J"
            role="Faculty Advisor & Academic Domain Expert · M.Tech, Panimalar Engineering College"
            email="suganyadevipec@gmail.com"
            initials="SD"
            badge="Faculty Collaborator"
          />
        </div>
      </div>
    </div>
  )
}