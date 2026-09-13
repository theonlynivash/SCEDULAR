import type { Page } from '../types'
import { PageHeader, GlassPanel, Section, Chip } from './ui'
import ScedularLogo from './ScedularLogo'

function PersonCard({
  name,
  role,
  email,
  initials,
}: {
  name: string
  role: string
  email: string
  initials: string
}) {
  return (
    <GlassPanel className="p-5 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(14,37,79,0.18)] group">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 text-white font-display font-800 text-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="font-display font-700 text-slate-900">{name}</p>
        <p className="text-sm text-slate-500 mt-0.5">{role}</p>
        <a href={`mailto:${email}`} className="text-sm text-[#0e254f] hover:text-[#081a38] font-500 transition break-all">
          {email}
        </a>
      </div>
    </GlassPanel>
  )
}

const PIPELINE = [
  'Structured input (workload spreadsheet: faculty, sections, courses, assignments)',
  'Pre-validation — reject malformed or unknown rows before generation',
  'Requirement expansion — weekly demand becomes individual schedulable units',
  'CSP solver — dynamic most-constrained-first backtracking search',
  'Independent post-validator — replays every hard constraint against the result',
  'Master timetable (GREEN) or structured conflict map (RED)',
  'Class / Faculty / Lab / Conflict views',
]

const DATA_MODEL = [
  { t: 'Sections', d: 'Year, Semester, Section name (e.g. II-K).' },
  { t: 'Courses / Syllabus', d: 'Code, name, component type, weekly theory & lab periods, lab block length.' },
  { t: 'Faculty', d: 'Name, designation, true max periods/day and /week.' },
  { t: 'Assignments', d: 'Faculty × Course × Section rows — a teacher spanning two years is two rows, same Faculty ID.' },
  { t: 'Labs & rooms', d: 'Physical rooms and which courses each can host.' },
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

export default function About({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="About SCEDULAR">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </PageHeader>

      <GlassPanel strong className="relative overflow-hidden p-8 text-center about-hero">
        <div className="about-hero-glow" aria-hidden="true" />
        <div className="relative">
          <div className="mx-auto mb-2 transition-transform duration-500 hover:scale-105" style={{ width: 'fit-content' }}>
            <ScedularLogo />
          </div>
          <p className="text-xs text-slate-500 font-500 tracking-wide">Deterministic timetable generation, engineered by</p>
          <p className="font-display font-800 text-lg text-[#0e254f] tracking-wide mt-0.5">KERNUL TECH</p>
          <div className="flex justify-center gap-2 mt-4 flex-wrap">
            <Chip tone="accent">Department-wide</Chip>
            <Chip tone="success">Any year · any semester</Chip>
            <Chip tone="warning">Zero fabricated results</Chip>
          </div>
        </div>
      </GlassPanel>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {[
          { v: String(HARD_CONSTRAINTS.length), l: 'Hard constraints enforced' },
          { v: String(SOFT_CONSTRAINTS.length), l: 'Soft constraints balanced' },
          { v: String(PIPELINE.length), l: 'Pipeline stages' },
          { v: 'MRV', l: 'Dynamic backtracking search' },
        ].map(s => (
          <GlassPanel key={s.l} className="p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(14,37,79,0.16)]">
            <p className="font-display font-800 text-2xl text-[#0e254f]">{s.v}</p>
            <p className="text-xs text-slate-500 mt-1">{s.l}</p>
          </GlassPanel>
        ))}
      </div>

      <Section title="Pipeline">
        <ol className="space-y-2.5">
          {PIPELINE.map((step, i) => (
            <li key={step} className="flex items-start gap-3 rounded-xl px-2 py-1.5 -mx-2 transition-colors duration-200 hover:bg-[#0e254f]/[0.06]">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-700 flex-shrink-0 bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 text-white transition-transform duration-200 hover:scale-110">{i + 1}</span>
              <p className="text-sm text-slate-700 pt-0.5">{step}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Data Model">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {DATA_MODEL.map(x => (
            <div key={x.t} className="rounded-2xl p-4 bg-white/40 transition-all duration-200 hover:bg-white/70 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,37,79,0.12)]">
              <p className="text-sm font-600 text-slate-800">{x.t}</p>
              <p className="text-xs text-slate-500 mt-0.5">{x.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Section title="Hard Constraints">
          <ul className="space-y-2">
            {HARD_CONSTRAINTS.map(c => (
              <li key={c} className="flex items-start gap-2 text-sm text-slate-700 rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors duration-200 hover:bg-[#0e254f]/[0.06]">
                <span className="text-[#0e254f] mt-0.5">•</span>{c}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Soft Constraints">
          <ul className="space-y-2">
            {SOFT_CONSTRAINTS.map(c => (
              <li key={c} className="flex items-start gap-2 text-sm text-slate-700 rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors duration-200 hover:bg-[#f3c326]/[0.12]">
                <span className="text-[#f3c326] mt-0.5">•</span>{c}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div>
        <h3 className="font-display font-700 text-sm text-slate-700 uppercase tracking-wider mb-3">Developed by KERNUL TECH</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <PersonCard
            name="Srinivash Karthikeyan"
            role="B.Tech AI & DS, 2nd Year — Panimalar Engineering College"
            email="theonlynivash@gmail.com"
            initials="SK"
          />
          <PersonCard
            name="Suganya Devi J"
            role="M.Tech, Faculty — Panimalar Engineering College (Collaborator)"
            email="suganyadevipec@gmail.com"
            initials="SD"
          />
        </div>
      </div>
    </div>
  )
}
