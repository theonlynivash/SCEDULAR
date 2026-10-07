import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import type { Page } from '../types'
import { api, type TeacherWorkload, type AssignBoard, type Assignment, type Faculty, type Lab, type ScheduleConfig, type SetupOverview, type FacultyResultRow, type ResultSummary, type AbsenceReport } from '../api'
import { PillTabs } from './ui'

type Tab = 'overview' | 'needs' | 'workload' | 'absence' | 'results' | 'timetable'
const NAVY = 'var(--c-700)', BLUE = 'var(--c-500)', GOLD = 'var(--accent)', GREEN = '#16a34a', MUTED = 'rgba(var(--ink-rgb),0.10)'
const tl = (t: number, l: number) => (l > 0 ? `${t}T+${l}L` : `${t}T`)

// ───────── small chart primitives (pure SVG / CSS, no chart library) ─────────
// Every card has its own hue ("tone"); bars, columns and rings inside it pick that hue up unless told otherwise.
type Tone = 'teal' | 'brass' | 'terra' | 'sage' | 'slate' | 'plum'
const TONES: Tone[] = ['teal', 'brass', 'terra', 'sage', 'slate', 'plum']
const TONE_HEX: Record<Tone, [string, string]> = { teal: ['var(--t1)', 'var(--t1d)'], brass: ['var(--t2)', 'var(--t2d)'], terra: ['var(--t3)', 'var(--t3d)'], sage: ['var(--t4)', 'var(--t4d)'], slate: ['var(--t5)', 'var(--t5d)'], plum: ['var(--t6)', 'var(--t6d)'] }
const ToneCtx = createContext<Tone>('teal')
const TITLE_TONE: Record<string, Tone> = {
  'Staffing by semester': 'sage', 'How loaded are teachers': 'teal', 'Experience mix': 'plum', "Teachers' choices": 'slate', 'Busiest teachers': 'terra',
  'Weekly teaching load': 'teal', 'Distribution': 'brass', 'Capacity': 'sage',
  'When the department teaches': 'slate', 'Classes per day': 'brass', 'Lab room use': 'terra',
}
const toneOf = (key: string): Tone => { if (TITLE_TONE[key]) return TITLE_TONE[key]; let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length] }
let cardCounter = 0

function useCountUp(target: number, ms = 900): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(target); return }
    let raf = 0; const t0 = performance.now()
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / ms); setN(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return n
}
/** "59%" or 66 or "12 / 20" count up from zero; anything else is shown as is. */
function Counting({ value }: { value: ReactNode }) {
  const m = typeof value === 'number' ? { n: value, rest: '' } : typeof value === 'string' ? (/^(\d+)(\D*)$/.exec(value) ? { n: Number(/^(\d+)/.exec(value)![1]), rest: value.replace(/^\d+/, '') } : null) : null
  const n = useCountUp(m?.n ?? 0)
  return <>{m ? `${n}${m.rest}` : value}</>
}

function Card({ title, sub, right, children, className = '', tone }: { title?: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string; tone?: Tone }) {
  const t = tone ?? toneOf(title ?? 'card')
  const idx = useMemo(() => cardCounter++ % 8, [])
  return (
    <ToneCtx.Provider value={t}>
      <div className={`liquid-tint tone-${t} rise-in flex flex-col min-h-0 ${className}`} style={{ ['--i' as any]: idx }}>
        {title && (
          <div className="px-4 pt-3 pb-2 flex items-baseline gap-2 flex-shrink-0">
            <span className="w-1.5 h-4 rounded-full self-center" style={{ background: TONE_HEX[t][0] }} />
            <h3 className="text-[13px] font-700 text-slate-800">{title}</h3>
            {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
            <span className="ml-auto">{right}</span>
          </div>
        )}
        <div className="px-4 pb-3 flex-1 min-h-0">{children}</div>
      </div>
    </ToneCtx.Provider>
  )
}

function Kpi({ label, value, sub, accent, tone }: { label: string; value: ReactNode; sub?: string; accent?: string; tone?: Tone }) {
  const t = tone ?? toneOf(label)
  const idx = useMemo(() => cardCounter++ % 8, [])
  return (
    <div className={`liquid-tint tone-${t} rise-in px-4 py-3`} style={{ ['--i' as any]: idx }}>
      <p className="text-[10.5px] font-600 uppercase tracking-[0.12em] text-slate-600">{label}</p>
      <p className="font-display font-700 text-[26px] leading-tight mt-0.5" style={{ color: accent ?? TONE_HEX[t][1] }}><Counting value={value} /></p>
      {sub && <p className="text-[11px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function Donut({ parts, size = 120, center }: { parts: { label: string; value: number; color: string }[]; size?: number; center?: ReactNode }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1
  const r = size / 2 - 11, c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 ring-in">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={MUTED} strokeWidth={14} />
          {parts.filter(p => p.value > 0).map(p => {
            const len = (p.value / total) * c, off = c * 0 - acc
            acc += len
            return <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={14} strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={off} />
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
      </div>
      <div className="space-y-1 min-w-0">
        {parts.map(p => (
          <div key={p.label} className="flex items-center gap-2 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
            <span className="text-slate-600 truncate">{p.label}</span>
            <span className="ml-auto pl-3 font-600 text-slate-800">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Bar({ pct, color, h = 8, marker }: { pct: number; color?: string; h?: number; marker?: number }) {
  const tone = useContext(ToneCtx)
  const fill = color ?? TONE_HEX[tone][0]
  return (
    <div className="relative rounded-full overflow-hidden" style={{ height: h, background: 'rgba(var(--ink-rgb),0.10)' }}>
      <div className="h-full rounded-full bar-grow" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: `linear-gradient(90deg, ${fill}, ${color ? fill : TONE_HEX[tone][1]})` }} />
      {marker !== undefined && <div className="absolute inset-y-0 w-px bg-slate-700/50" style={{ left: `${Math.min(100, marker)}%` }} />}
    </div>
  )
}

function Columns({ data, height = 120, color }: { data: { label: string; value: number; hint?: string }[]; height?: number; color?: string }) {
  const tone = useContext(ToneCtx)
  const [c1, c2] = color ? [color, color] : TONE_HEX[tone]
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div className="flex items-end gap-2" style={{ height: height + 34 }}>
      {data.map((d, i) => (
        <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={d.hint}>
          <span className="text-[11px] font-600 text-slate-700">{d.value}</span>
          <div className="w-full rounded-t-md col-grow" style={{ height: Math.max(3, (d.value / max) * height), background: `linear-gradient(180deg, ${c1}, ${c2})`, ['--d' as any]: `${i * 70}ms` }} />
          <span className="text-[10.5px] text-slate-500 truncate max-w-full">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function download(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

// ───────── page ─────────
export function ReportsPage({ navigate }: { navigate: (p: Page) => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [absence, setAbsence] = useState<AbsenceReport | null>(null)
  const [openAbs, setOpenAbs] = useState<string | null>(null)
  useEffect(() => { if (tab === 'absence') api.leave.absence().then(setAbsence).catch(() => setAbsence({ asOf: '', totals: { teachers: 0, periodsMissed: 0, periodsUpcoming: 0, notCovered: 0 }, rows: [] })) }, [tab])
  const [ov, setOv] = useState<SetupOverview | null>(null)
  const [boards, setBoards] = useState<AssignBoard[]>([])
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [labs, setLabs] = useState<Lab[]>([])
  const [cfg, setCfg] = useState<ScheduleConfig | null>(null)
  const [run, setRun] = useState<{ runId: number; status: string; generatedAt: string; assignments: Assignment[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sem, setSem] = useState<string>('ALL')
  const [rt, setRt] = useState<{ teachers: { facultyId: string; name: string; designation: string | null; results: FacultyResultRow[]; summary: ResultSummary }[]; totalTeachers: number } | null>(null)
  const [rview, setRview] = useState<'teacher' | 'subject'>('teacher')
  const [openT, setOpenT] = useState<string | null>(null)
  const [tw, setTw] = useState<Map<string, TeacherWorkload>>(new Map())
  const [openW, setOpenW] = useState<string | null>(null)
  const [showIdle, setShowIdle] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const o = await api.setup.overview()
        const sems = o.semesters.filter(s => s.sections > 0).map(s => s.semester)
        const [bs, f, l, c, m, rr] = await Promise.all([
          Promise.all(sems.map(s => api.facultyAllocation.getAssignBoard(s))),
          api.faculty.list(), api.labs.list(), api.config.get(), api.timetable.master().catch(() => null), api.results.hodAll().catch(() => null),
        ])
        setOv(o); setBoards(bs); setFaculty(f); setLabs(l); setCfg(c); setRun(m); setRt(rr)
      } catch (e: any) { setErr(e?.message || 'Could not load the report data.') }
      finally { setLoading(false) }
    })()
  }, [])

  // the full workload of every teacher (subjects, sections, periods, class in-charge, preferences, results, timetable load)
  useEffect(() => { api.facultyAllocation.teacherWorkload().then(r => setTw(new Map(r.teachers.map(x => [x.facultyId, x])))).catch(() => {}) }, [])

  // ── derived ──
  const rows = useMemo(() => boards.flatMap(b => b.subjects.map(s => ({
    sem: b.semester, code: s.code, name: s.name, sections: s.sectionCount, assigned: s.assignedCount,
    teachers: s.teachers.length, chose: s.interested.length, approved: s.interested.filter(i => i.approved).length,
    per: s.perSection, periods: s.sectionCount * (s.perSection.theory + s.perSection.lab),
  }))), [boards])
  const shown = sem === 'ALL' ? rows : rows.filter(r => r.sem === sem)

  const teachers = useMemo(() => {
    const t = boards[0]?.teachers ?? []
    const byId = new Map(faculty.map(f => [f.id, f]))
    const subjectsOf = new Map<string, { code: string; n: number; t: number; l: number }[]>()
    for (const b of boards) for (const s of b.subjects) for (const x of s.teachers)
      subjectsOf.set(x.facultyId, [...(subjectsOf.get(x.facultyId) ?? []), { code: s.code, n: x.sectionIds.length, t: s.perSection.theory, l: s.perSection.lab }])
    return t.map(x => ({ ...x, designation: byId.get(x.facultyId)?.designation ?? '', subjects: subjectsOf.get(x.facultyId) ?? [] }))
  }, [boards, faculty])
  const active = teachers.filter(t => t.load > 0)

  const totalOfferings = ov?.semesters.reduce((n, s) => n + s.offerings, 0) ?? 0
  const totalStaffed = ov?.semesters.reduce((n, s) => n + s.staffed, 0) ?? 0
  const staffPct = totalOfferings ? Math.round((100 * totalStaffed) / totalOfferings) : 0
  const totalLoad = teachers.reduce((n, t) => n + t.load, 0), totalCap = teachers.reduce((n, t) => n + t.max, 0)

  const placements = run?.assignments ?? []
  const days = cfg?.workingDays ?? ['MON', 'TUE', 'WED', 'THU', 'FRI']
  const periods = (cfg?.periods ?? []).filter(p => p.schedulable !== false)
  const grid = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of placements) for (let p = a.startPeriod; p <= a.endPeriod; p++) m.set(`${a.day}|${p}`, (m.get(`${a.day}|${p}`) ?? 0) + 1)
    return m
  }, [placements])
  const gridMax = Math.max(1, ...grid.values())
  const labUse = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of placements) if (a.labId) m.set(a.labId, (m.get(a.labId) ?? 0) + (a.endPeriod - a.startPeriod + 1))
    return labs.map(l => ({ id: l.id, name: l.name, used: m.get(l.id) ?? 0 })).sort((a, b) => b.used - a.used)
  }, [placements, labs])
  const slotsPerWeek = days.length * periods.length

  if (loading) return (
    <div className="space-y-3" aria-busy="true">
      <div className="skeleton h-9 w-56" />
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-24" />)}</div>
      <div className="grid gap-2 xl:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-52" />)}</div>
    </div>
  )
  if (err) return <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-4">{err}</p>

  const buckets = [['0', 0, 0], ['1–6', 1, 6], ['7–12', 7, 12], ['13–18', 13, 18], ['19–24', 19, 24], ['25+', 25, 99]] as const
  const loadHist = buckets.map(([label, lo, hi]) => ({ label, value: teachers.filter(t => t.load >= lo && t.load <= hi).length, hint: `${label} periods per week` }))
  const band = (e?: number) => (e == null ? 'Not set' : e < 10 ? 'Under 10 yrs' : e < 13 ? '10–13 yrs' : '13+ yrs')
  const bandParts = ['Under 10 yrs', '10–13 yrs', '13+ yrs', 'Not set'].map((label, i) => ({ label, color: ['var(--t1)', 'var(--t5)', 'var(--t2)', 'rgba(var(--ink-rgb),0.22)'][i], value: faculty.filter(f => f.role !== 'HOD' && band(f.allocationExperience) === label).length }))

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-700 text-[22px] text-slate-900 leading-tight">Reports</h1>
          <p className="text-xs text-slate-500">Live picture of staffing, workload and the generated timetable · {ov?.cycle} cycle</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <PillTabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'needs', label: 'Subject needs' }, { id: 'workload', label: 'Teacher workload' }, { id: 'absence', label: 'Absence' }, { id: 'results', label: 'Teacher results' }, { id: 'timetable', label: 'Timetable analysis' }]} />
          <button onClick={() => tab === 'absence'
            ? download('teacher-absence.csv', [['Teacher', 'Leave requests', 'Leave days', 'Periods not attended (to date)', 'Upcoming periods', 'Not covered by a substitute'], ...(absence?.rows ?? []).map(r => [r.name, r.leaveRequests, r.leaveDays, r.periodsMissed, r.periodsUpcoming, r.notCovered])])
            : tab === 'results'
            ? download('teacher-results.csv', [['Teacher', 'Academic year', 'Semester', 'Subject', 'Students appeared', 'Pass %'], ...(rt?.teachers ?? []).flatMap(t => t.results.map(r => [t.name, r.academicYear, r.semester, r.subjectName, r.studentsAppeared ?? '', r.passPercent]))])
            : tab === 'workload'
            ? download('teacher-workload.csv', [['Teacher', 'Designation', 'Load', 'Weekly limit', 'Subjects'], ...teachers.map(t => [t.name, t.designation, t.load, t.max, t.subjects.map(s => `${s.code}x${s.n}`).join(' ')])])
            : download('subject-needs.csv', [['Semester', 'Subject', 'Code', 'Sections', 'Staffed', 'Periods/week needed', 'Teachers', 'Chose it'], ...rows.map(r => [r.sem, r.name, r.code, r.sections, r.assigned, r.periods, r.teachers, r.chose])])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid text-[12px] font-600 text-[color:var(--ink-800)]"><Download size={13} /> Export CSV</button>
        </div>
      </div>

      {/* ───────── OVERVIEW ───────── */}
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-2">
            <Kpi label="Staffing" tone="sage" value={`${staffPct}%`} sub={`${totalStaffed}/${totalOfferings} section-subjects`} accent={staffPct === 100 ? '#4b6a30' : undefined} />
            <Kpi label="Teachers teaching" tone="teal" value={active.length} sub={`of ${teachers.length} in the department`} />
            <Kpi label="Average load" tone="brass" value={`${totalCap ? Math.round((100 * totalLoad) / totalCap) : 0}%`} sub={`${totalLoad} of ${totalCap} periods/week`} />
            <Kpi label="Timetable" tone="slate" value={run ? (run.status === 'GREEN' ? 'No clashes' : run.status) : 'None'} sub={run ? `${placements.length} placements · run #${run.runId}` : 'Not generated yet'} accent={run?.status === 'GREEN' ? GREEN : undefined} />
            <Kpi label="Lab rooms in use" tone="terra" value={`${labUse.filter(l => l.used > 0).length}/${labs.length}`} sub={`${labUse.reduce((n, l) => n + l.used, 0)} lab periods/week`} />
          </div>
          <div className="grid gap-2 xl:grid-cols-12">
            <Card className="xl:col-span-4" title="Staffing by semester" sub="sections with a teacher">
              <div className="space-y-3 pt-1">
                {(ov?.semesters ?? []).filter(s => s.sections > 0).map(s => {
                  const pct = s.offerings ? (100 * s.staffed) / s.offerings : 0
                  return (
                    <div key={s.semester}>
                      <div className="flex justify-between text-[12px]"><span className="font-600 text-slate-700">Sem {s.semester} <span className="font-400 text-slate-400">· {s.sections} sections</span></span><span className="text-slate-600">{s.staffed}/{s.offerings}</span></div>
                      <Bar pct={pct} color={pct >= 100 ? BLUE : GOLD} h={9} />
                    </div>
                  )
                })}
              </div>
            </Card>
            <Card className="xl:col-span-4" title="How loaded are teachers" sub="teachers by periods per week"><Columns data={loadHist} /></Card>
            <Card className="xl:col-span-4" title="Experience mix" sub="decides which years a teacher may choose">
              <Donut parts={bandParts} center={<div><p className="font-display font-700 text-lg text-slate-800 leading-none">{faculty.filter(f => f.role !== 'HOD').length}</p><p className="text-[10px] text-slate-400">teachers</p></div>} />
            </Card>
            <Card className="xl:col-span-6" title="Teachers' choices" sub="per semester">
              <div className="space-y-2.5 pt-1">
                {(ov?.semesters ?? []).filter(s => s.sections > 0).map(s => (
                  <div key={s.semester} className="text-[12px]">
                    <div className="flex justify-between"><span className="font-600 text-slate-700">Sem {s.semester}</span><span className="text-slate-500">{s.choices} choices · {s.choices - s.choicesPending} approved</span></div>
                    <div className="flex h-2 rounded-full overflow-hidden" style={{ background: MUTED }}>
                      <div style={{ width: `${s.choices ? (100 * (s.choices - s.choicesPending)) / Math.max(s.choices, 1) : 0}%`, background: BLUE }} />
                      <div style={{ width: `${s.choices ? (100 * s.choicesPending) / Math.max(s.choices, 1) : 0}%`, background: GOLD }} />
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400 flex gap-3 pt-1"><span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: BLUE }} />approved</span><span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: GOLD }} />waiting</span></p>
              </div>
            </Card>
            <Card className="xl:col-span-6" title="Busiest teachers" sub="periods per week out of their limit" right={<button onClick={() => setTab('workload')} className="text-[11px] font-600 text-[color:var(--c-500)] hover:underline">All teachers →</button>}>
              <div className="space-y-2 pt-1">
                {[...active].sort((a, b) => b.load / b.max - a.load / a.max).slice(0, 6).map(t => (
                  <div key={t.facultyId} className="text-[12px]"><div className="flex justify-between"><span className="text-slate-700 truncate pr-2">{t.name}</span><span className="font-600 text-slate-600">{t.load}/{t.max}</span></div><Bar pct={(100 * t.load) / t.max} /></div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ───────── SUBJECT NEEDS ───────── */}
      {tab === 'needs' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <PillTabs value={sem} onChange={setSem} tabs={[{ id: 'ALL', label: 'All semesters' }, ...boards.map(b => ({ id: b.semester, label: `Sem ${b.semester}` }))]} />
            <p className="text-[11.5px] text-slate-500">Each subject needs a teacher for every section. Bars show how much of that is covered, and how many teachers chose it.</p>
          </div>
          <Card>
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-400"><th className="py-1.5 font-600">Subject</th><th className="font-600">Template</th><th className="font-600 w-[26%]">Sections staffed</th><th className="font-600 text-center">Periods / wk</th><th className="font-600 text-center">Teachers</th><th className="font-600 text-center">Chose it</th><th className="font-600">Note</th></tr></thead>
              <tbody>
                {[...shown].sort((a, b) => (a.assigned / a.sections) - (b.assigned / b.sections) || a.code.localeCompare(b.code)).map(r => {
                  const pct = (100 * r.assigned) / Math.max(1, r.sections)
                  const note = r.assigned < r.sections ? (r.chose === 0 ? 'Nobody chose it' : `${r.sections - r.assigned} open`) : r.chose === 0 ? 'Assigned directly' : r.chose < r.teachers ? 'Some assigned without choosing' : 'Covered'
                  return (
                    <tr key={r.sem + r.code} className="border-t border-[color:var(--ink-800)]/6">
                      <td className="py-2 pr-2"><span className="font-mono text-[10.5px] text-[color:var(--c-500)] mr-1.5">{r.code}</span><span className="text-slate-800">{r.name}</span> <span className="text-slate-400 text-[10.5px]">Sem {r.sem}</span></td>
                      <td className="text-slate-500 whitespace-nowrap">{tl(r.per.theory, r.per.lab)}</td>
                      <td className="pr-4"><div className="flex items-center gap-2"><div className="flex-1"><Bar pct={pct} color={pct >= 100 ? BLUE : GOLD} /></div><span className="text-slate-600 w-9 text-right">{r.assigned}/{r.sections}</span></div></td>
                      <td className="text-center text-slate-700">{r.periods}</td>
                      <td className="text-center font-600 text-slate-800">{r.teachers}</td>
                      <td className="text-center text-slate-700">{r.chose}</td>
                      <td className={`${r.assigned < r.sections ? 'text-amber-700 font-600' : 'text-slate-500'}`}>{note}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* ───────── TEACHER WORKLOAD ───────── */}
      {tab === 'workload' && (
        <div className="grid gap-2 xl:grid-cols-12">
          <Card className="xl:col-span-8" title="Weekly teaching load" sub="periods per week">
            <div className="space-y-2.5">
              {[...teachers].sort((a, b) => b.load / b.max - a.load / a.max).filter(t => t.load > 0).map(t => (
                <WorkloadRow key={t.facultyId} t={t} d={tw.get(t.facultyId)} open={openW === t.facultyId} onToggle={() => setOpenW(openW === t.facultyId ? null : t.facultyId)} />
              ))}
              {teachers.some(t => t.load === 0) && (
                <div className="pt-2 border-t border-slate-200/60">
                  <button onClick={() => setShowIdle(v => !v)} className="text-[11.5px] font-700 text-[color:var(--c-700)] hover:underline">{showIdle ? 'Hide' : 'Show'} {teachers.filter(t => t.load === 0).length} teachers who are not teaching yet</button>
                  {showIdle && <div className="mt-2 space-y-2.5">{teachers.filter(t => t.load === 0).map(t => <WorkloadRow key={t.facultyId} t={t} d={tw.get(t.facultyId)} open={openW === t.facultyId} onToggle={() => setOpenW(openW === t.facultyId ? null : t.facultyId)} />)}</div>}
                </div>
              )}
            </div>
          </Card>
          <div className="xl:col-span-4 space-y-2">
            <Card title="Distribution" sub="teachers by weekly periods"><Columns data={loadHist} height={110} /></Card>
            <Card title="Capacity">
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between"><span className="text-slate-500">Taught</span><b className="text-slate-800">{totalLoad} periods</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Combined weekly limit</span><b className="text-slate-800">{totalCap} periods</b></div>
                <Bar pct={totalCap ? (100 * totalLoad) / totalCap : 0} h={10} />
                <div className="flex justify-between"><span className="text-slate-500">Free capacity</span><b className="text-slate-800">{Math.max(0, totalCap - totalLoad)} periods</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Not teaching yet</span><b className="text-slate-800">{teachers.filter(t => t.load === 0).length} teachers</b></div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ───────── ABSENCE ───────── */}
      {tab === 'absence' && (
        !absence ? <p className="text-sm text-slate-500">Loading…</p> : (
          <div className="space-y-2">
            <div className="grid gap-2 grid-cols-2 xl:grid-cols-4">
              <Kpi label="Periods not attended" value={absence.totals.periodsMissed} sub="up to today, approved leave" tone="terra" />
              <Kpi label="Still to come" value={absence.totals.periodsUpcoming} sub="periods on approved leave ahead" tone="brass" />
              <Kpi label="Not covered" value={absence.totals.notCovered} sub="missed with no substitute" tone="plum" />
              <Kpi label="Teachers on leave" value={absence.totals.teachers} sub="with approved leave" tone="slate" />
            </div>
            <Card title="Periods each teacher did not attend" sub="approved leave only; a period is a class on the timetable that fell on a leave day">
              {absence.rows.length === 0 ? <p className="text-[12.5px] text-slate-500 py-4 text-center">No approved leave yet.</p> : (
                <div className="space-y-2.5">
                  {absence.rows.map(r => {
                    const max = Math.max(1, ...absence.rows.map(x => x.periodsMissed + x.periodsUpcoming))
                    const open = openAbs === r.facultyId
                    return (
                      <div key={r.facultyId}>
                        <button onClick={() => setOpenAbs(open ? null : r.facultyId)} className="w-full text-left">
                          <div className="flex items-baseline gap-2 text-[12.5px]">
                            <ChevronRight size={13} className={`self-center text-slate-400 transition ${open ? 'rotate-90' : ''}`} />
                            <span className="font-600 text-slate-800">{r.name}</span>
                            <span className="text-[11px] text-slate-500">{r.leaveDays} leave day{r.leaveDays === 1 ? '' : 's'} · {r.leaveRequests} request{r.leaveRequests === 1 ? '' : 's'}</span>
                            <span className="ml-auto font-700 text-slate-800">{r.periodsMissed} not attended{r.periodsUpcoming ? <span className="font-500 text-slate-500"> · {r.periodsUpcoming} to come</span> : null}</span>
                          </div>
                          <div className="mt-1 ml-5"><Bar pct={(100 * (r.periodsMissed + r.periodsUpcoming)) / max} h={7} marker={(100 * r.periodsMissed) / max} /></div>
                        </button>
                        {open && (
                          <div className="ml-5 mt-1.5 rounded-xl bg-white/50 p-2.5 text-[12px] space-y-1">
                            <p className="text-slate-500">Teaches {r.weeklyPeriods} periods a week · {r.notCovered} of the missed periods had no substitute</p>
                            {r.leaves.map(l => (
                              <p key={l.id} className="flex flex-wrap gap-x-3 text-slate-700">
                                <b>{l.fromDate === l.toDate ? l.fromDate : `${l.fromDate} → ${l.toDate}`}</b>
                                <span>{l.days} day{l.days === 1 ? '' : 's'}</span>
                                <span>{l.periodsMissed} not attended</span>
                                {l.periodsUpcoming > 0 && <span>{l.periodsUpcoming} to come</span>}
                                {l.notCovered > 0 && <span className="text-rose-700">{l.notCovered} not covered</span>}
                                <span className="text-slate-500">{l.reason}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        )
      )}

      {/* ───────── TEACHER RESULTS ───────── */}
      {tab === 'results' && (() => {
        const teachersR = rt?.teachers ?? []
        const entries = teachersR.flatMap(t => t.results.map(r => ({ ...r, teacher: t.name })))
        const avgs = teachersR.map(t => t.summary.average).filter((x): x is number => x != null)
        const deptAvg = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null
        const bySubject = new Map<string, { name: string; code?: string | null; marks: number[]; teachers: Set<string> }>()
        for (const e of entries) {
          const key = (e.subjectCode || e.subjectName).toLowerCase()
          const g = bySubject.get(key) ?? { name: e.subjectName, code: e.subjectCode, marks: [], teachers: new Set<string>() }
          g.marks.push(e.passPercent); g.teachers.add(e.teacher); bySubject.set(key, g)
        }
        const subj = [...bySubject.values()].map(g => ({ ...g, avg: Math.round((g.marks.reduce((a, b) => a + b, 0) / g.marks.length) * 10) / 10 })).sort((a, b) => b.avg - a.avg)
        const tone = (p: number) => (p >= 85 ? BLUE : p >= 70 ? 'rgba(47,111,196,0.65)' : GOLD)
        if (teachersR.length === 0) return <Card><p className="text-sm text-slate-500 py-10 text-center">No teacher has entered past results yet. They add them in <b>My Profile → Class results</b>.</p></Card>
        return (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
              <Kpi label="Department average pass" tone="plum" value={deptAvg != null ? `${deptAvg}%` : '–'} sub="mean of the teachers' averages" />
              <Kpi label="Teachers with results" tone="teal" value={`${teachersR.length}/${rt?.totalTeachers ?? 0}`} sub={`${entries.length} subject entries`} />
              <Kpi label="Highest average" tone="sage" value={teachersR[0]?.summary.average != null ? `${teachersR[0].summary.average}%` : '–'} sub={teachersR[0]?.name} />
              <Kpi label="Lowest average" tone="terra" value={teachersR.length ? `${teachersR[teachersR.length - 1].summary.average}%` : '–'} sub={teachersR[teachersR.length - 1]?.name} />
            </div>
            <div className="flex items-center gap-2">
              <PillTabs value={rview} onChange={setRview} tabs={[{ id: 'teacher', label: 'By teacher' }, { id: 'subject', label: 'By subject' }]} />
              <p className="text-[11.5px] text-slate-500">Pass percentage of the classes teachers took in past semesters, as entered by each teacher.</p>
            </div>
            {rview === 'teacher' ? (
              <Card>
                <div className="divide-y divide-[color:var(--ink-800)]/8">
                  {teachersR.map(t => {
                    const open = openT === t.facultyId
                    return (
                      <div key={t.facultyId}>
                        <button onClick={() => setOpenT(open ? null : t.facultyId)} className="w-full text-left py-2.5 flex items-center gap-4">
                          <div className="w-56 min-w-0"><p className="text-[13px] font-500 text-slate-800 truncate">{t.name}</p><p className="text-[11px] text-slate-400 truncate">{t.designation ?? 'Faculty'} · {t.summary.count} subject{t.summary.count === 1 ? '' : 's'}</p></div>
                          <div className="flex-1"><Bar pct={t.summary.average ?? 0} color={tone(t.summary.average ?? 0)} h={9} /></div>
                          <span className="w-14 text-right font-display font-600 text-slate-800">{t.summary.average}%</span>
                          <span className="text-slate-300 text-xs w-4">{open ? '▲' : '▼'}</span>
                        </button>
                        {open && (
                          <div className="pb-3 pl-2 pr-8 space-y-1">
                            {t.results.map(r => (
                              <div key={r.id} className="flex items-center gap-3 text-[12px]">
                                <span className="w-24 text-slate-400">{r.academicYear} · {r.semester}</span>
                                <span className="flex-1 text-slate-700 truncate">{r.subjectCode && <span className="font-mono text-[10.5px] text-[color:var(--c-500)] mr-1.5">{r.subjectCode}</span>}{r.subjectName}</span>
                                {r.studentsAppeared ? <span className="text-slate-400">{r.studentsAppeared} students</span> : null}
                                <div className="w-32"><Bar pct={r.passPercent} color={tone(r.passPercent)} h={6} /></div>
                                <span className="w-12 text-right font-600 text-slate-700">{r.passPercent}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>
            ) : (
              <Card>
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-400"><th className="py-1.5 font-600">Subject</th><th className="font-600 w-[34%]">Average pass</th><th className="font-600 text-center">Entries</th><th className="font-600">Taught by</th></tr></thead>
                  <tbody>
                    {subj.map(g => (
                      <tr key={g.name} className="border-t border-[color:var(--ink-800)]/6">
                        <td className="py-2 pr-2">{g.code && <span className="font-mono text-[10.5px] text-[color:var(--c-500)] mr-1.5">{g.code}</span>}<span className="text-slate-800">{g.name}</span></td>
                        <td className="pr-4"><div className="flex items-center gap-2"><div className="flex-1"><Bar pct={g.avg} color={tone(g.avg)} /></div><span className="w-12 text-right font-600 text-slate-700">{g.avg}%</span></div></td>
                        <td className="text-center text-slate-700">{g.marks.length}</td>
                        <td className="text-slate-500 truncate max-w-[260px]">{[...g.teachers].join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )
      })()}

      {/* ───────── TIMETABLE ANALYSIS ───────── */}
      {tab === 'timetable' && (
        !run ? (
          <Card><p className="text-sm text-slate-500 py-8 text-center">No timetable has been generated yet. <button onClick={() => navigate('generate')} className="text-[color:var(--c-500)] font-600 hover:underline">Generate one</button> to see its analysis.</p></Card>
        ) : (
          <div className="grid gap-2 xl:grid-cols-12">
            <Card className="xl:col-span-8" title="When the department teaches" sub={`classes running at the same time, run #${run.runId}`}>
              <div className="overflow-x-auto">
                <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
                  <thead><tr><th className="w-10" />{periods.map(p => <th key={p.index} className="text-[10.5px] font-600 text-slate-400 pb-0.5">P{p.index}</th>)}</tr></thead>
                  <tbody>
                    {days.map(d => (
                      <tr key={d}>
                        <td className="text-[10.5px] font-600 text-slate-500 pr-1">{d}</td>
                        {periods.map(p => {
                          const n = grid.get(`${d}|${p.index}`) ?? 0, a = n / gridMax
                          return <td key={p.index} title={`${d} P${p.index}: ${n} classes`} className="h-9 text-center text-[11px] font-600 rounded-md" style={{ background: n ? `rgba(22,54,122,${0.10 + a * 0.80})` : 'rgba(var(--ink-rgb),0.04)', color: a > 0.5 ? '#fff' : 'var(--text)' }}>{n || ''}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Each cell counts the classes in session at that moment. The maximum is {new Set(placements.map(a => a.sectionId)).size} (every section has a class), so a full grid means no section has a free period, and paler cells are slots where some sections are free.</p>
              <div className="grid gap-2 md:grid-cols-2 mt-3 pt-3 border-t border-[color:var(--ink-800)]/8">
                <div>
                  <p className="text-[12px] font-700 text-slate-700 mb-2">Theory vs lab periods</p>
                  <Donut size={104} parts={[
                    { label: 'Theory', value: placements.filter(a => a.blockType === 'THEORY').reduce((n, a) => n + a.endPeriod - a.startPeriod + 1, 0), color: BLUE },
                    { label: 'Lab', value: placements.filter(a => a.blockType === 'LAB').reduce((n, a) => n + a.endPeriod - a.startPeriod + 1, 0), color: GOLD },
                  ]} />
                </div>
                <div>
                  <p className="text-[12px] font-700 text-slate-700 mb-2">Classes per semester</p>
                  <div className="space-y-2">
                    {boards.map(b => {
                      const secs = new Set(b.subjects.flatMap(x => x.sections.map(y => y.sectionId)))
                      const n = placements.filter(a => secs.has(a.sectionId)).reduce((m, a) => m + a.endPeriod - a.startPeriod + 1, 0)
                      return <div key={b.semester} className="text-[12px]"><div className="flex justify-between"><span className="text-slate-700">Sem {b.semester} <span className="text-slate-400">· {secs.size} sections</span></span><span className="text-slate-600">{n} periods</span></div><Bar pct={(100 * n) / Math.max(1, secs.size * slotsPerWeek)} h={7} /></div>
                    })}
                  </div>
                </div>
              </div>
            </Card>
            <div className="xl:col-span-4 space-y-2">
              <Card title="Classes per day"><Columns height={90} data={days.map(d => ({ label: d, value: placements.filter(a => a.day === d).reduce((n, a) => n + (a.endPeriod - a.startPeriod + 1), 0) }))} /></Card>
              <Card title="Lab room use" sub={`periods of ${slotsPerWeek} per week`}>
                <div className="space-y-2">
                  {labUse.map(l => (
                    <div key={l.id} className="text-[12px]"><div className="flex justify-between"><span className="text-slate-700 truncate pr-2">{l.name}</span><span className="text-slate-600">{l.used}</span></div><Bar pct={(100 * l.used) / Math.max(1, slotsPerWeek)} color={l.used ? BLUE : MUTED} h={6} /></div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )
      )}
    </div>
  )
}


const DAY_LABEL: Record<string, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat' }
const STATUS_TONE: Record<string, string> = { APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200', SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200', REJECTED: 'bg-rose-50 text-rose-700 border-rose-200', CHANGES_REQUESTED: 'bg-amber-50 text-amber-800 border-amber-200' }

/** One teacher in the workload list. Click to open everything about their work: subjects, sections, periods, timetable, choices, results. */
function WorkloadRow({ t, d, open, onToggle }: {
  t: { facultyId: string; name: string; designation: string; load: number; max: number; subjects: { code: string; n: number; t: number; l: number }[] }
  d?: TeacherWorkload; open: boolean; onToggle: () => void
}) {
  const days = d?.timetable ? Object.entries(d.timetable.byDay) : []
  const maxDay = Math.max(1, ...days.map(([, n]) => n))
  const alerts: string[] = []
  if (d) {
    if (d.overBy > 0) alerts.push(`${d.overBy} period${d.overBy === 1 ? '' : 's'} above the ${d.max}-period limit`)
    if (d.load === 0) alerts.push('Not teaching any section yet')
    if (d.experience === null) alerts.push('Experience is not set (cannot submit preferences)')
    if (d.timetable && d.timetable.placedPeriods !== d.load) alerts.push(`The generated timetable has ${d.timetable.placedPeriods} of ${d.load} periods: generate again`)
  }
  return (
    <div className="text-[12px]">
      <button onClick={onToggle} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-baseline gap-2">
          <ChevronRight className={`w-3.5 h-3.5 self-center text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="font-600 text-slate-800 truncate">{t.name}</span>
          <span className="text-[10.5px] text-slate-400 truncate">{t.designation}</span>
          <span className="ml-auto font-600 text-slate-700 whitespace-nowrap">{t.load}<span className="font-400 text-slate-400"> / {t.max}</span></span>
        </div>
        <div className="pl-5"><Bar pct={(100 * t.load) / Math.max(t.max, t.load, 1)} h={7} /></div>
        <p className="pl-5 text-[10.5px] text-slate-400 mt-0.5 truncate">{t.subjects.length ? t.subjects.map(s => `${s.code} ×${s.n} (${s.l > 0 ? `${s.t}T+${s.l}L` : `${s.t}T`})`).join('  ·  ') : 'Nothing assigned yet'}</p>
      </button>

      {open && (
        <div className="ml-5 mt-2 mb-1 rounded-xl border border-slate-200/70 bg-white/60 p-3 space-y-3">
          {!d ? <p className="text-slate-400">Loading details…</p> : (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11.5px]">
                <span><b className="text-slate-800">{d.load}</b> <span className="text-slate-500">of {d.max} periods a week</span> · <b className={d.remaining === 0 ? 'text-amber-700' : 'text-emerald-700'}>{d.remaining} free</b></span>
                <span><b className="text-slate-800">{d.theoryPeriods}</b> <span className="text-slate-500">theory</span> + <b className="text-slate-800">{d.labPeriods}</b> <span className="text-slate-500">lab periods</span></span>
                <span><b className="text-slate-800">{d.subjects.length}</b> <span className="text-slate-500">subjects</span> in <b className="text-slate-800">{d.sectionCount}</b> <span className="text-slate-500">sections</span></span>
                {d.experience !== null && <span className="text-slate-500">Experience <b className="text-slate-800">{d.experience} yrs</b></span>}
                {d.results?.average != null && <span className="text-slate-500">Past pass average <b className="text-slate-800">{d.results.average}%</b> <span className="text-slate-400">({d.results.count} entr{d.results.count === 1 ? 'y' : 'ies'})</span></span>}
                {d.classIncharge.length > 0 && <span className="text-slate-500">Class in-charge of <b className="text-slate-800">{d.classIncharge.join(', ')}</b></span>}
              </div>

              {alerts.length > 0 && <ul className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 space-y-0.5">{alerts.map(a => <li key={a}>{a}</li>)}</ul>}

              {d.subjects.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-400"><th className="py-1 pr-3">Subject</th><th className="pr-3">Sem</th><th className="pr-3">Sections</th><th className="pr-3 whitespace-nowrap">Per section</th><th className="text-right">Periods</th></tr></thead>
                    <tbody>
                      {d.subjects.map(s => (
                        <tr key={s.subjectId} className="border-t border-slate-100 align-top">
                          <td className="py-1.5 pr-3"><span className="font-mono text-[10.5px] text-[color:var(--c-700)] font-700">{s.code}</span> <span className="text-slate-700">{s.name}</span></td>
                          <td className="pr-3 text-slate-500">{s.semester}</td>
                          <td className="pr-3"><span className="inline-flex flex-wrap gap-1">{s.sections.map(x => <span key={x} className="px-1.5 py-0.5 rounded bg-[color:var(--c-500)]/10 text-[color:var(--c-700)] font-600 text-[10.5px]">{x.replace(/^Y\d(S\d)?-/, '')}</span>)}</span> <span className="text-slate-400">· {s.sections.length}</span></td>
                          <td className="pr-3 text-slate-600 whitespace-nowrap">{s.perSection.l > 0 ? (s.perSection.t > 0 ? `${s.perSection.t}T + ${s.perSection.l}L` : `${s.perSection.l}L`) : `${s.perSection.t}T`}</td>
                          <td className="text-right font-700 text-slate-700">{s.periods}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {d.timetable && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-700 mb-1">In the generated timetable · run #{d.timetable.runId} · busiest day {d.timetable.busiestDay ? (DAY_LABEL[d.timetable.busiestDay] ?? d.timetable.busiestDay) : '–'} · {d.timetable.labPeriods} lab period{d.timetable.labPeriods === 1 ? '' : 's'}</p>
                  <div className="flex items-end gap-2 h-14">
                    {days.map(([day, n]) => (
                      <div key={day} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                        <span className="text-[10px] font-700 text-slate-600">{n}</span>
                        <div className="w-full rounded-t bg-[color:var(--c-500)]/70" style={{ height: `${(100 * n) / maxDay * 0.32}px`, minHeight: n ? 3 : 1 }} />
                        <span className="text-[9.5px] text-slate-400">{DAY_LABEL[day] ?? day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {d.preferences.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-700 mb-1">Subject choices</p>
                  <div className="flex flex-wrap gap-1.5">{d.preferences.map((p, i) => <span key={i} className={`px-2 py-0.5 rounded-full border text-[10.5px] font-600 ${STATUS_TONE[p.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`} title={p.name}>{p.code} · Sem {p.semester} · {p.status.toLowerCase().replace('_', ' ')}</span>)}</div>
                </div>
              )}
              {(d.email || d.phone) && <p className="text-[11px] text-slate-500">{[d.email, d.phone].filter(Boolean).join(' · ')}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
