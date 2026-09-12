import type { Page } from '../types'
import { PageHeader, GlassPanel, Section, Chip } from './ui'
import CollegeLogo from './CollegeLogo'

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
    <GlassPanel className="p-5 flex items-center gap-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 text-white font-display font-800 text-lg">
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

      <GlassPanel strong className="p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center bg-white ring-1 ring-[#f3c326]/60 shadow-[0_8px_24px_rgba(14,37,79,0.45)] p-2">
          <CollegeLogo className="w-full h-full" />
        </div>
        <h2 className="font-display font-800 text-xl text-slate-900">SCEDULAR</h2>
        <div className="flex justify-center gap-2 mt-4">
          <Chip tone="accent">Department-wide</Chip>
          <Chip tone="success">Any year · any semester</Chip>
        </div>
      </GlassPanel>

      <Section title="Pipeline">
        <ol className="space-y-2.5">
          {PIPELINE.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-700 flex-shrink-0 bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 text-white">{i + 1}</span>
              <p className="text-sm text-slate-700 pt-0.5">{step}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Data Model">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {DATA_MODEL.map(x => (
            <div key={x.t} className="rounded-2xl p-4 bg-white/40">
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
              <li key={c} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-[#0e254f] mt-0.5">•</span>{c}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Soft Constraints">
          <ul className="space-y-2">
            {SOFT_CONSTRAINTS.map(c => (
              <li key={c} className="flex items-start gap-2 text-sm text-slate-700">
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
