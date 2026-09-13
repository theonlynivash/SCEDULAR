import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Page } from '../types'
import { PageHeader, GlassPanel, Chip } from './ui'
import ScedularLogo from './ScedularLogo'

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

/* ---------- SVG icon helper ---------- */
function I({ d, className = 'w-5 h-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

/* ---------- Section heading (editorial font) ---------- */
function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <Reveal>
      <div className="mb-5">
        <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#c98f00] font-600">{kicker}</p>
        <h3 className="font-editorial font-600 text-2xl md:text-[28px] text-slate-900 tracking-tight mt-1">{title}</h3>
      </div>
    </Reveal>
  )
}

/* ---------- Content ---------- */
const STAGES = [
  {
    tag: 'Stage 01 · Input',
    title: 'Structured Input',
    desc: 'Upload the workload spreadsheet — faculty, sections, courses and assignments in one normalized template.',
    icon: 'M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3M12 15V4m0 0L8 8m4-4l4 4',
  },
  {
    tag: 'Stage 02 · Validate',
    title: 'Pre-Validation',
    desc: 'Malformed or unknown rows are rejected before generation ever starts — bad data never reaches the solver.',
    icon: 'M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    tag: 'Stage 03 · Expand',
    title: 'Requirement Expansion',
    desc: 'Weekly demand (e.g. 4 theory periods + 1 lab block) is exploded into individual schedulable units.',
    icon: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
  },
  {
    tag: 'Stage 04 · Solve',
    title: 'CSP Solver',
    desc: 'Dynamic most-constrained-first (MRV) backtracking search across periods, rooms and teachers.',
    icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  },
  {
    tag: 'Stage 05 · Verify',
    title: 'Independent Post-Validation',
    desc: 'A separate validator replays every hard constraint against the produced grid — zero fabricated results.',
    icon: 'M9 12l2 2 4-4m1.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  {
    tag: 'Stage 06 · Output',
    title: 'GREEN / RED Result',
    desc: 'A master timetable (green) when feasible — or a structured conflict map (red) pointing at the exact clash.',
    icon: 'M4 4h16v16H4z M4 12h16 M12 4v16',
  },
  {
    tag: 'Stage 07 · Views',
    title: 'Four Read Views',
    desc: 'Class, Faculty, Lab and Conflict views — all rendering the same underlying solution.',
    icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zm7 0c-1.5 4.5-5.5 7-10 7S3.5 16.5 2 12c1.5-4.5 5.5-7 10-7s8.5 2.5 10 7z',
  },
]

const DATA_MODEL = [
  { t: 'Sections', d: 'Year, Semester, Section name (e.g. II-K).', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { t: 'Courses / Syllabus', d: 'Code, name, component type, weekly theory & lab periods, lab block length.', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { t: 'Faculty', d: 'Name, designation, true max periods/day and /week.', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { t: 'Assignments', d: 'Faculty × Course × Section rows — a teacher spanning two years is two rows, same Faculty ID.', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  { t: 'Labs & rooms', d: 'Physical rooms and which courses each can host.', icon: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.611L5 14.5' },
]

const HARD_CONSTRAINTS = [
  'A section cannot have two courses in the same period',
  'A teacher cannot teach two sections at the same time',
  'A physical lab cannot host two sections at the same time',
  'Exact weekly theory/lab period counts must be satisfied for every course and section',
  'A teacher must be eligible for the subject/component assigned',
  'Explicit teacher constraints (unavailable periods, max daily/weekly load) are respected',
  'BREAK and LUNCH never contain a teaching assignment',
  'A normal lab occupies 3 contiguous periods as one block',
  'A lab block cannot cross BREAK or LUNCH',
  'The lab teacher is occupied for the entire lab block',
  'No duplicate or partial assignment is accepted as complete',
  'Malformed or unknown input is rejected before generation',
  'An infeasible instance is reported explicitly, never silently violated',
]

const SOFT_CONSTRAINTS = [
  'Balance weekly teaching load across faculty',
  'Avoid unnecessary gaps in a teacher’s day',
  'Avoid excessive consecutive periods',
  'Spread each subject across the week',
  'Balance a section’s daily load',
  'Prefer compact lab placement',
  'Respect configured teacher preferences',
]

function PersonCard({ name, role, email, initials }: { name: string; role: string; email: string; initials: string }) {
  return (
    <GlassPanel className="p-5 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(14,37,79,0.18)] group">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 text-white font-display font-700 text-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="font-editorial font-600 text-slate-900">{name}</p>
        <p className="text-sm text-slate-500 mt-0.5">{role}</p>
        <a href={`mailto:${email}`} className="text-sm text-[#0e254f] hover:text-[#081a38] font-600 transition break-all">
          {email}
        </a>
      </div>
    </GlassPanel>
  )
}

export default function About({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div className="space-y-10">
      <PageHeader title="About SCEDULAR">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-600 text-slate-600 glass-pill transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </PageHeader>

      {/* Hero */}
      <GlassPanel strong className="liquid-edge sheen relative overflow-hidden p-8 md:p-12 text-center about-hero">
        <div className="about-hero-glow" aria-hidden="true" />
        <div className="relative">
          <Reveal>
            <div className="mx-auto mb-4 transition-transform duration-500 hover:scale-[1.03]" style={{ width: 'fit-content' }}>
              <ScedularLogo />
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="font-editorial font-600 text-3xl md:text-[42px] leading-[1.12] tracking-tight text-gradient-brand">
              Timetables that solve themselves.
            </h2>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-sm md:text-[15px] text-slate-600 max-w-xl mx-auto mt-4 leading-relaxed">
              Deterministic, constraint-driven timetable generation for Panimalar Engineering College — engineered by KERNUL TECH.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex justify-center gap-2 mt-5 flex-wrap">
              <Chip tone="accent">Department-wide</Chip>
              <Chip tone="success">Any year · any semester</Chip>
              <Chip tone="warning">Zero fabricated results</Chip>
            </div>
          </Reveal>
        </div>
      </GlassPanel>

      {/* Count-up stats */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {[
          { v: <CountUp to={HARD_CONSTRAINTS.length} />, l: 'Hard constraints enforced' },
          { v: <CountUp to={SOFT_CONSTRAINTS.length} />, l: 'Soft constraints balanced' },
          { v: <CountUp to={STAGES.length} />, l: 'Pipeline stages' },
          { v: <span className="font-mono">MRV</span>, l: 'Dynamic backtracking search' },
        ].map((s, i) => (
          <Reveal key={s.l} delay={i * 90}>
            <GlassPanel className="p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(14,37,79,0.16)]">
              <p className="font-display font-800 text-[28px] text-[#0e254f]">{s.v}</p>
              <p className="text-xs text-slate-500 mt-1">{s.l}</p>
            </GlassPanel>
          </Reveal>
        ))}
      </div>

      {/* How it works — visual pipeline */}
      <div>
        <SectionTitle kicker="How it works" title="From spreadsheet to master grid" />
        <div>
          <div className="relative pl-16">
            <div className="pipe-track" aria-hidden="true" />
            <div className="space-y-4">
              {STAGES.map((s, i) => (
                <Reveal key={s.title} delay={i * 80}>
                  <div className="relative">
                    <div className="absolute -left-16 top-4 w-[56px] h-[56px] rounded-2xl grid place-items-center bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 text-white shadow-[0_8px_20px_rgba(14,37,79,0.4)]">
                      <I d={s.icon} />
                    </div>
                    <GlassPanel className="p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(14,37,79,0.2)]">
                      <p className="font-mono text-[10px] tracking-[0.25em] text-[#c98f00] font-600 uppercase">{s.tag}</p>
                      <p className="font-display font-700 text-slate-900 mt-1">{s.title}</p>
                      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{s.desc}</p>
                    </GlassPanel>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Data model */}
      <div>
        <SectionTitle kicker="Foundation" title="The data it runs on" />
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {DATA_MODEL.map((x, i) => (
            <Reveal key={x.t} delay={i * 70}>
              <div className="rounded-2xl p-4 bg-white/40 backdrop-blur-sm border border-white/60 transition-all duration-200 hover:bg-white/70 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,37,79,0.12)]">
                <div className="w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-[#0e254f] to-[#081a38] text-white ring-1 ring-[#f3c326]/50 mb-3">
                  <I d={x.icon} className="w-4.5 h-4.5" />
                </div>
                <p className="text-sm font-700 text-slate-800">{x.t}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{x.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Constraints */}
      <div>
        <SectionTitle kicker="Guarantees" title="Rules the solver lives by" />
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <Reveal>
            <GlassPanel className="p-6 h-full">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/50">
                <span className="w-8 h-8 rounded-xl grid place-items-center bg-gradient-to-br from-[#0e254f] to-[#081a38] text-white ring-1 ring-[#f3c326]/50">
                  <I d="M9 12l2 2 4-4m1.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" className="w-4 h-4" />
                </span>
                <h3 className="font-editorial font-600 text-lg text-slate-900">Hard Constraints</h3>
              </div>
              <ul className="space-y-2">
                {HARD_CONSTRAINTS.map(c => (
                  <li key={c} className="flex items-start gap-2 text-sm text-slate-700 rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors duration-200 hover:bg-[#0e254f]/[0.06]">
                    <span className="text-[#0e254f] mt-0.5 font-700">•</span>{c}
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </Reveal>
          <Reveal delay={120}>
            <GlassPanel className="p-6 h-full">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/50">
                <span className="w-8 h-8 rounded-xl grid place-items-center bg-gradient-to-br from-[#f3c326] to-[#d9a90f] text-[#0e254f] ring-1 ring-white/60">
                  <I d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" className="w-4 h-4" />
                </span>
                <h3 className="font-editorial font-600 text-lg text-slate-900">Soft Constraints</h3>
              </div>
              <ul className="space-y-2">
                {SOFT_CONSTRAINTS.map(c => (
                  <li key={c} className="flex items-start gap-2 text-sm text-slate-700 rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors duration-200 hover:bg-[#f3c326]/[0.12]">
                    <span className="text-[#c98f00] mt-0.5 font-700">•</span>{c}
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </Reveal>
        </div>
      </div>

      {/* Team */}
      <div>
        <SectionTitle kicker="Credits" title="Developed by KERNUL TECH" />
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Reveal>
            <PersonCard
              name="Srinivash Karthikeyan"
              role="B.Tech AI & DS, 2nd Year — Panimalar Engineering College"
              email="theonlynivash@gmail.com"
              initials="SK"
            />
          </Reveal>
          <Reveal delay={120}>
            <PersonCard
              name="Suganya Devi J"
              role="M.Tech, Faculty — Panimalar Engineering College (Collaborator)"
              email="suganyadevipec@gmail.com"
              initials="SD"
            />
          </Reveal>
        </div>
      </div>
    </div>
  )
}