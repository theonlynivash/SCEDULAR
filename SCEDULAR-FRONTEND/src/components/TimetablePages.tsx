import { useEffect, useState } from 'react'
import { PageHeader, Btn, GlassPanel, Chip } from './ui'
import type { Page } from '../types'
import {
  api,
  type Assignment,
  type Conflict,
  type Course,
  type CourseRequirement,
  type MasterDatasetStatus,
  type Faculty,
  type Lab,
  type RunDetail,
  type ScheduleConfig,
  type Section,
  type SectionSubject,
  type Subject,
  type TeacherAssignment,
  type TeachingAssignment,
  type TimetableStatus,
} from '../api'
import { useScope, matchesScope } from '../scope'
import type { SemesterReadiness } from '../types'
import { AlertTriangle, Building2, CheckCircle2, CloudSun, Clock, Cpu, Info, Sun, UserRound, Utensils } from 'lucide-react'

function BackBtn({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <button
      onClick={() => navigate('dashboard')}
      className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill transition"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  )
}

export function GenerateTimetable({
  navigate,
  onGenerated,
}: {
  navigate: (p: Page) => void
  onGenerated: (runId: number) => void
}) {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<TimetableStatus | null>(null)
  const [conflictCount, setConflictCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataset, setDataset] = useState<MasterDatasetStatus | null>(null)
  const [lastGenerated, setLastGenerated] = useState<string | null>(null)
  const [semesterReadiness, setSemesterReadiness] = useState<SemesterReadiness[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('')
  const { scope } = useScope()

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.importMaster.status().catch(() => null),
      api.facultyAllocation.getReadiness().catch(() => null),
    ])
      .then(([ds, rdnData]) => {
        if (ds) setDataset(ds)
        if (rdnData?.readiness) {
          setSemesterReadiness(rdnData.readiness)
          // Default the picker to the first (year, semester) that's actually
          // ready to generate, so the HOD isn't left with a blocked context
          // selected by accident. She can still switch to any other entry —
          // e.g. "start from Year 4 Sem VII, then the others" — via the picker.
          const firstReady = rdnData.readiness.find(r => r.canGenerate)
          setSelectedKey(prev => prev || (firstReady ? `${firstReady.year}::${firstReady.semester}` : `${rdnData.readiness[0]?.year}::${rdnData.readiness[0]?.semester}`))
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load generation data'))
      .finally(() => setLoading(false))
  }, [scope.year, scope.semester])

  const selected = semesterReadiness.find(r => `${r.year}::${r.semester}` === selectedKey) ?? null
  const canGenerateSelected = !!selected?.canGenerate

  async function start() {
    if (!selected) return
    setRunning(true)
    setError(null)
    setStatus(null)
    try {
      const result = await api.timetable.generate({ year: selected.year, semester: selected.semester })
      setStatus(result.status)
      setConflictCount(result.conflicts.length)
      setLastGenerated(result.generatedAt)
      onGenerated(result.runId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed — is the SCEDULAR backend running?')
    } finally {
      setRunning(false)
    }
  }

  const done = status !== null
  const counts = dataset?.counts ?? {}
  const generationLabel = 'Current canonical dataset'
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never'
  const preflightChecks = [
    { label: `Sections loaded (${counts.sections ?? 0})`, ok: (counts.sections ?? 0) > 0 },
    { label: `Subjects loaded (${counts.subjects ?? 0})`, ok: (counts.subjects ?? 0) > 0 },
    { label: `Faculty loaded (${counts.faculty ?? 0})`, ok: (counts.faculty ?? 0) > 0 },
    { label: `Labs configured (${counts.labs ?? 0})`, ok: (counts.labs ?? 0) > 0 },
  ]

  return (
    <div>
      <PageHeader title={`Generate timetable for ${generationLabel}`}>
        <BackBtn navigate={navigate} />
      </PageHeader>

      {/* Semester picker — the HOD chooses which (year, semester) context to
          generate, e.g. Year 4 / Sem VII first, then others, independent of
          whether every other semester in the department is configured yet. */}
      {semesterReadiness.length > 0 && (
        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-4">
          <p className="text-xs font-700 uppercase tracking-wider text-slate-500 mb-3">Choose a semester to generate</p>
          <div className="flex flex-wrap gap-2">
            {semesterReadiness.map(r => {
              const key = `${r.year}::${r.semester}`
              const active = key === selectedKey
              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-600 border transition flex items-center gap-1.5 ${
                    active
                      ? 'border-[#0e254f] bg-[#0e254f] text-white'
                      : r.canGenerate
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {r.canGenerate ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  {r.year} — Sem {r.semester}
                </button>
              )
            })}
          </div>
          {selected && (
            <div className="mt-4 pt-4 border-t border-slate-200/70">
              {selected.canGenerate ? (
                <p className="text-xs font-600 text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> {selected.year} — Semester {selected.semester} is ready for generation ({selected.sectionCount ?? 0} sections, {selected.subjectCount ?? 0} subjects).
                </p>
              ) : (
                <div>
                  <p className="text-xs font-700 text-amber-800 flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle size={14} /> {selected.year} — Semester {selected.semester} cannot generate yet.
                  </p>
                  <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                    {selected.missingItems.slice(0, 6).map((m, i) => <li key={i}>{m}</li>)}
                    {selected.missingItems.length > 6 && <li>…and {selected.missingItems.length - 6} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassPanel strong className="p-6">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div>
              <p className="text-xs font-700 uppercase tracking-wider text-slate-500">Generation Scope</p>
              <h2 className="font-display font-800 text-xl text-slate-900 mt-1">Department · {generationLabel}</h2>
            </div>
            <Info size={20} className="text-slate-400" strokeWidth={1.8} />
          </div>
          <div className="space-y-3">
            {[
              ['Sections loaded', counts.sections ?? 0],
              ['Subjects loaded', counts.subjects ?? 0],
              ['Faculty loaded', counts.faculty ?? 0],
              ['Labs available', counts.labs ?? 0],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between border-b border-slate-200/70 pb-3 text-sm last:border-0 last:pb-0">
                <span className="text-slate-500">{label}</span>
                <span className="font-700 text-slate-800">{loading ? '—' : value}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 mt-6 leading-relaxed">Pick a semester above to see its exact readiness. Generation is scoped to that semester only — other semesters can be completed and generated independently, whenever they're ready.</p>
        </GlassPanel>

        <GlassPanel strong className="p-6">
          <div className="mb-6">
            <p className="text-xs font-700 uppercase tracking-wider text-slate-500">Pre-flight Check</p>
            <h2 className="font-display font-800 text-xl text-slate-900 mt-1">Generation status</h2>
          </div>
          <div className="space-y-4">
            {preflightChecks.map(item => (
              <div key={item.label} className="flex items-start gap-3 text-sm">
                {item.ok ? <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" strokeWidth={1.8} /> : <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" strokeWidth={1.8} />}
                <span className={item.ok ? 'text-slate-700' : 'text-amber-700'}>{item.label}</span>
              </div>
            ))}
            <div className="flex items-start gap-3 text-sm pt-2 border-t border-slate-200/70">
              <Clock size={20} className="text-slate-400 flex-shrink-0" strokeWidth={1.8} />
              <span className="text-slate-500">Last generated: <span className="text-slate-700">{formatDate(lastGenerated)}</span></span>
            </div>
          </div>
          {error && <p className="mt-5 text-sm text-rose-600">{error}</p>}
        </GlassPanel>
      </div>
      <div className="mt-6 flex items-center justify-between gap-4 flex-wrap rounded-3xl border border-slate-200/80 bg-white/70 px-5 py-4 shadow-[0_6px_20px_rgba(7,20,51,0.08)]">
        <div>
          {status === 'GREEN' && <p className="text-sm font-600 text-emerald-700">Timetable generated with no conflicts.</p>}
          {status === 'RED' && <p className="text-sm font-600 text-rose-700">{conflictCount} hard-constraint conflict{conflictCount !== 1 ? 's' : ''} found.</p>}
          {!done && <p className="text-sm text-slate-600">{running ? 'Expanding requirements and validating the schedule…' : 'Review the checks, then run the scheduling pipeline.'}</p>}
        </div>
        <div className="flex items-center gap-2">
          {done && <Btn variant="secondary" onClick={() => navigate('timetable-result')}>{status === 'GREEN' ? 'View Results' : 'View Conflicts'}</Btn>}
          {!done && (
            <Btn
              onClick={start}
              disabled={running || loading || !canGenerateSelected}
            >
              <Cpu size={18} strokeWidth={1.8} />
              {running ? 'Generating…' : selected ? `Generate ${selected.year} — Sem ${selected.semester}` : 'Generate Timetable'}
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}


export function TimetableResult({ navigate, runId }: { navigate: (p: Page) => void; runId: number | null }) {
  const [run, setRun] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aiExplanation, setAiExplanation] = useState<any | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)

  useEffect(() => {
    if (runId === null) {
      setLoading(false)
      return
    }
    api.timetable
      .run(runId)
      .then(r => {
        setRun(r)
        if (r.status === 'RED' || (r.conflicts && r.conflicts.length > 0)) {
          setLoadingAi(true)
          fetch('/api/ai/explain-generation-failure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report: r }),
          })
            .then(res => res.json())
            .then(data => setAiExplanation(data.explanation))
            .catch(() => null)
            .finally(() => setLoadingAi(false))
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load run'))
      .finally(() => setLoading(false))
  }, [runId])

  if (runId === null) {
    return (
      <div>
        <PageHeader title="Timetable Result"><BackBtn navigate={navigate} /></PageHeader>
        <GlassPanel strong className="max-w-lg mx-auto text-center p-12">
          <p className="text-slate-500 text-sm mb-4">No timetable has been generated in this session yet.</p>
          <Btn onClick={() => navigate('generate')}>Go to Generate →</Btn>
        </GlassPanel>
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Timetable Result"><BackBtn navigate={navigate} /></PageHeader>
        <p className="text-center text-slate-400 text-sm">Loading run #{runId}…</p>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div>
        <PageHeader title="Timetable Result"><BackBtn navigate={navigate} /></PageHeader>
        <div className="max-w-lg mx-auto bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-3">{error ?? 'Run not found'}</div>
      </div>
    )
  }

  const isGreen = run.status === 'GREEN' || run.status === 'YELLOW'

  return (
    <div>
      <PageHeader title="Timetable Result">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <div className="max-w-3xl mx-auto space-y-6">
        <GlassPanel strong className="p-8 text-center">
          <div className="text-6xl mb-4">{isGreen ? '🎉' : '⚠️'}</div>
          <h2 className={`font-display font-800 text-2xl mb-2 ${isGreen ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isGreen ? 'Timetable Generated Successfully' : 'Infeasible — No Valid Timetable Generated'}
          </h2>
          <p className="text-slate-500 text-sm mb-2">Run #{run.id} · {new Date(run.generatedAt).toLocaleString()}</p>
          <div className="flex items-center justify-center gap-6 my-5">
            {[
              { v: String(run.conflicts.length), l: 'Hard Conflicts' },
              { v: String(run.assignments.length), l: 'Assignments' },
              { v: String(run.unscheduled.length), l: 'Unscheduled Units' },
            ].map(s => (
              <div key={s.l} className="text-center px-4 py-2 rounded-2xl bg-slate-900/40 border border-white/10">
                <p className={`font-display font-800 text-2xl ${isGreen ? 'text-emerald-400' : 'text-rose-400'}`}>{s.v}</p>
                <p className="text-xs text-slate-400">{s.l}</p>
              </div>
            ))}
          </div>

          {/* Structured Infeasibility Report */}
          {run.conflicts.length > 0 && (
            <div className="mt-6 text-left space-y-4">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Structured Infeasibility Report
              </h3>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {run.conflicts.map((c: Conflict, i: number) => (
                  <div key={i} className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200 flex flex-col gap-1">
                    <div className="flex items-center justify-between font-bold text-rose-300">
                      <span>[{c.type}] {c.sectionId ? `Section: ${c.sectionId}` : ''} {c.courseId ? `Subject: ${c.courseId}` : ''}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-900 text-rose-100">CRITICAL</span>
                    </div>
                    <p className="text-slate-300 mt-1">{c.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCEDULAR AI Natural Language Explanation */}
          {!isGreen && (
            <div className="mt-6 p-6 rounded-3xl bg-cyan-950/30 border border-cyan-500/30 text-left space-y-3">
              <h4 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                🤖 SCEDULAR AI Assistant Infeasibility Analysis
              </h4>
              {loadingAi ? (
                <p className="text-xs text-slate-400">Analyzing deterministic solver report with SCEDULAR AI...</p>
              ) : aiExplanation ? (
                <div className="space-y-2 text-xs text-slate-300">
                  <p className="font-semibold text-white">{aiExplanation.summary}</p>
                  {aiExplanation.rootCauses?.length > 0 && (
                    <div>
                      <span className="text-slate-400 font-bold block mb-1">Root Causes:</span>
                      <ul className="list-disc list-inside space-y-1 text-slate-300">
                        {aiExplanation.rootCauses.map((rc: string, i: number) => (
                          <li key={i}>{rc}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiExplanation.recommendations?.length > 0 && (
                    <div className="pt-2">
                      <span className="text-cyan-400 font-bold block mb-1">HOD Action Plan:</span>
                      <ul className="list-disc list-inside space-y-1 text-cyan-200">
                        {aiExplanation.recommendations.map((rec: string, i: number) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Review faculty section allocation or physical lab mapping configuration above to resolve conflicts.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-6">
            <Btn onClick={() => navigate('view-timetable')}>View Timetable Grid</Btn>
            <Btn variant="outline" onClick={() => navigate('generate')}>Back to Solver</Btn>
          </div>
        </GlassPanel>
      </div>
    </div>
  )
}

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayAbbr: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' }

// 4 before lunch, 3 after lunch = 7 teaching periods
const beforeLunchPeriods = [
  { id: 'P1', time: '8:30 – 9:20' },
  { id: 'P2', time: '9:20 – 10:10' },
  { id: 'P3', time: '10:10 – 11:00' },
  { id: 'P4', time: '11:00 – 11:50' },
]
const afterLunchPeriods = [
  { id: 'P5', time: '12:40 – 1:30' },
  { id: 'P6', time: '1:30 – 2:20' },
  { id: 'P7', time: '2:20 – 3:10' },
]

// cell keys: DayAbbr-0 through DayAbbr-6 (0-3 = before lunch P1-P4, 4-6 = after lunch P5-P7)
const cellData: Record<string, string> = {
  // Monday
  'Mon-0': 'DS\nDr. Krishnamurthy\nCS-501',
  'Mon-1': 'DBMS\nDr. Priya\nCS-502',
  'Mon-2': 'CN\nMs. Deepika\nCS-501',
  'Mon-3': 'OS\nMr. Arumugam\nCS-503',
  'Mon-4': 'DSP\nDr. Lakshmi\nECE-Lab',
  'Mon-5': 'DSP\nDr. Lakshmi\nECE-Lab',
  'Mon-6': 'VLSI\nDr. Lakshmi\nCS-502',
  // Tuesday
  'Tue-0': 'DBMS\nDr. Priya\nCS-501',
  'Tue-1': 'DS\nDr. Krishnamurthy\nCS-502',
  'Tue-2': 'OS\nMr. Arumugam\nCS-501',
  'Tue-3': 'CN\nMs. Deepika\nCS-503',
  'Tue-4': 'DBMS Lab\nDr. Priya\nDB-Lab',
  'Tue-5': 'DBMS Lab\nDr. Priya\nDB-Lab',
  'Tue-6': 'DBMS Lab\nDr. Priya\nDB-Lab',
  // Wednesday
  'Wed-0': 'CN\nMs. Deepika\nCS-501',
  'Wed-1': 'OS\nMr. Arumugam\nCS-502',
  'Wed-2': 'DS\nDr. Krishnamurthy\nCS-503',
  'Wed-3': 'DBMS\nDr. Priya\nCS-501',
  'Wed-4': 'VLSI\nDr. Lakshmi\nCS-502',
  'Wed-5': 'DS\nDr. Krishnamurthy\nCS-501',
  'Wed-6': 'CN\nMs. Deepika\nCS-503',
  // Thursday
  'Thu-0': 'OS\nMr. Arumugam\nCS-501',
  'Thu-1': 'VLSI\nDr. Lakshmi\nCS-502',
  'Thu-2': 'DBMS\nDr. Priya\nCS-501',
  'Thu-3': 'DS\nDr. Krishnamurthy\nCS-503',
  'Thu-4': 'CN Lab\nMs. Deepika\nNET-Lab',
  'Thu-5': 'CN Lab\nMs. Deepika\nNET-Lab',
  'Thu-6': 'CN Lab\nMs. Deepika\nNET-Lab',
  // Friday
  'Fri-0': 'DS\nDr. Krishnamurthy\nCS-501',
  'Fri-1': 'DBMS\nDr. Priya\nCS-502',
  'Fri-2': 'VLSI\nDr. Lakshmi\nCS-501',
  'Fri-3': 'OS\nMr. Arumugam\nCS-503',
  'Fri-4': 'CN\nMs. Deepika\nCS-501',
  'Fri-5': 'DS\nDr. Krishnamurthy\nCS-502',
  'Fri-6': 'Meeting Hour',
  // Saturday
  'Sat-0': 'DBMS\nDr. Priya\nCS-501',
  'Sat-1': 'DS\nDr. Krishnamurthy\nCS-502',
  'Sat-2': 'OS Lab\nMr. Arumugam\nOS-Lab',
  'Sat-3': 'OS Lab\nMr. Arumugam\nOS-Lab',
  'Sat-4': 'OS Lab\nMr. Arumugam\nOS-Lab',
  'Sat-5': 'VLSI\nDr. Lakshmi\nCS-501',
  'Sat-6': 'Free',
}

const subjectColors: Record<string, string> = {
  DS: '#dbeafe', DBMS: '#dcfce7', CN: '#fce7f3', OS: '#fef3c7',
  DSP: '#ede9fe', VLSI: '#ffedd5', Meeting: '#fee2e2', Free: '#f1f5f9',
}

function getCellColor(cell: string) {
  const first = cell.split('\n')[0].trim()
  for (const [k, v] of Object.entries(subjectColors)) {
    if (first.startsWith(k)) return v
  }
  return '#f8faff'
}

type GridColumn = { type: 'period'; index: number; label: string; start: string; end: string } | { type: 'gap'; key: string; label: string }

function buildColumns(config: ScheduleConfig): GridColumn[] {
  const sorted = [...config.periods].filter(p => p.schedulable).sort((a, b) => a.index - b.index)
  const cols: GridColumn[] = []
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1]
    if (prev && prev.end !== p.start) {
      const gapMinutes = minutesBetween(prev.end, p.start)
      cols.push({ type: 'gap', key: `gap-${prev.index}-${p.index}`, label: gapMinutes >= 30 ? 'LUNCH' : 'BREAK' })
    }
    cols.push({ type: 'period', index: p.index, label: p.label, start: p.start, end: p.end })
  })
  return cols
}

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return bh * 60 + bm - (ah * 60 + am)
}

const courseColorPalette = ['#dbeafe', '#dcfce7', '#fce7f3', '#fef3c7', '#ede9fe', '#ffedd5', '#e0f2fe', '#fee2e2']
function colorForCourse(courseId: string): string {
  let hash = 0
  for (let i = 0; i < courseId.length; i++) hash = (hash * 31 + courseId.charCodeAt(i)) % courseColorPalette.length
  return courseColorPalette[Math.abs(hash) % courseColorPalette.length]
}

export function ViewTimetable({ navigate }: { navigate: (p: Page) => void }) {
  const { scope } = useScope()
  const [tab, setTab] = useState(0)
  const [sections, setSections] = useState<Section[]>([])
  const [facultyList, setFacultyList] = useState<Faculty[]>([])
  const [labs, setLabs] = useState<Lab[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [sectionSubjects, setSectionSubjects] = useState<SectionSubject[]>([])
  const [canonicalTeachingAssignments, setCanonicalTeachingAssignments] = useState<TeachingAssignment[]>([])
  const [labSubjectMappings, setLabSubjectMappings] = useState<{ labId: string; subjectId: string; sectionId: string | null }[]>([])
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([])
  const [requirements, setRequirements] = useState<CourseRequirement[]>([])
  const [config, setConfig] = useState<ScheduleConfig | null>(null)
  const [selectedFaculty, setSelectedFaculty] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [selectedLab, setSelectedLab] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasMasterRun, setHasMasterRun] = useState<boolean | null>(null)
  const tabs = ['Faculty Timetable', 'Class Timetable', 'Lab Timetable']

  useEffect(() => {
    api.timetable.master().then(() => setHasMasterRun(true)).catch(() => setHasMasterRun(false))
  }, [])

  useEffect(() => {
    Promise.all([
      api.sections.list().catch(() => []),
      api.faculty.list().catch(() => []),
      api.labs.list().catch(() => []),
      api.courses.list().catch(() => []),
      api.config.get().catch(() => null),
      api.subjects.list().catch(() => []),
      api.sectionSubjects.list().catch(() => []),
      api.teachingAssignments.list().catch(() => []),
      api.labs.subjectMappings().catch(() => []),
      api.workload.listTeacherAssignments().catch(() => []),
      api.workload.listRequirements().catch(() => []),
    ])
      .then(([s, f, l, c, cfg, subj, secSubj, canonicalTA, labMap, ta, req]) => {
        setSections(s)
        setFacultyList(f)
        setLabs(l)
        setCourses(c)
        setConfig(cfg)
        setSubjects(subj)
        setSectionSubjects(secSubj)
        setCanonicalTeachingAssignments(canonicalTA)
        setLabSubjectMappings(labMap)
        setTeacherAssignments(ta)
        setRequirements(req)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load timetable data'))
  }, [])

  // Scoped-in sections: only what the global Dept/Year/Semester selector
  // (TopBar) currently covers.
  const scopedSections = sections.filter(s => matchesScope(scope, s.year, s.semester))
  const scopedSectionIds = new Set(scopedSections.map(s => s.id))
  const scopedSectionSubjectIds = new Set(sectionSubjects.filter(ss => scopedSectionIds.has(ss.sectionId)).map(ss => ss.id))
  const scopedSubjectIds = new Set(sectionSubjects.filter(ss => scopedSectionIds.has(ss.sectionId)).map(ss => ss.subjectId))
  const scopedCourseIds = new Set(requirements.filter(r => scopedSectionIds.has(r.sectionId)).map(r => r.courseId))

  const isScopeAll = scope.year === 'ALL' && scope.semester === 'ALL'

  const scopedFaculty = isScopeAll
    ? facultyList
    : facultyList.filter(f => {
        const hasCanonical = canonicalTeachingAssignments.some(a => a.facultyId === f.id && scopedSectionSubjectIds.has(a.sectionSubjectId))
        const hasLegacy = teacherAssignments.some(a => a.facultyId === f.id && scopedSectionIds.has(a.sectionId))
        return hasCanonical || hasLegacy
      })

  const scopedLabs = isScopeAll
    ? labs
    : labs.filter(l => {
        const hasCanonicalMap = labSubjectMappings.some(m => m.labId === l.id && (m.sectionId === null || scopedSectionIds.has(m.sectionId)) && scopedSubjectIds.has(m.subjectId))
        const hasLegacyMap = (l.courseIds || []).some(cid => scopedCourseIds.has(cid))
        return hasCanonicalMap || hasLegacyMap
      })

  // If the scope changed out from under a selection, drop it rather than
  // keep showing an out-of-scope entity's timetable.
  useEffect(() => {
    if (selectedFaculty && !scopedFaculty.some(f => f.id === selectedFaculty)) setSelectedFaculty('')
    if (selectedSection && !scopedSectionIds.has(selectedSection)) setSelectedSection('')
    if (selectedLab && !scopedLabs.some(l => l.id === selectedLab)) setSelectedLab('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.year, scope.semester])

  useEffect(() => {
    setError(null)
    setAssignments([])
    const load = async () => {
      try {
        if (tab === 0 && selectedFaculty) setAssignments((await api.timetable.faculty(selectedFaculty)).assignments)
        if (tab === 1 && selectedSection) setAssignments((await api.timetable.section(selectedSection)).assignments)
        if (tab === 2 && selectedLab) setAssignments((await api.timetable.lab(selectedLab)).assignments)
      } catch (e) {
        setError('TIME TABLE GENERATION IS UNDER PROGRESS')
      }
    }
    load()
  }, [tab, selectedFaculty, selectedSection, selectedLab])

  const sectionMap = new Map(sections.map(s => [s.id, s]))
  const visibleAssignments = assignments.filter(a => {
    if (isScopeAll) return true
    const sec = sectionMap.get(a.sectionId)
    if (!sec) return true
    return matchesScope(scope, sec.year, sec.semester)
  })

  const courseName = (id: string) => {
    const sub = subjects.find(s => s.id === id || s.code === id)
    if (sub) return sub.name
    const crs = courses.find(c => c.id === id || c.code === id)
    if (crs) return crs.name
    return id
  }
  const facultyName = (id: string) => facultyList.find(f => f.id === id)?.name ?? id
  const labName = (id?: string) => (id ? labs.find(l => l.id === id)?.name ?? id : undefined)

  const chevronDown = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23636b8a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`
  const selectCls = "glass-input rounded-xl px-3.5 py-2.5 text-sm text-slate-800 transition appearance-none cursor-pointer pr-9 min-w-48 bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat"
  const selectStyle = {
    backgroundImage: chevronDown,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.9rem center',
    backgroundSize: '16px',
  }

  const columns = config ? buildColumns(config) : []
  const workingDays = config?.workingDays ?? []

  function cellContent(a: Assignment): string[] {
    const targetId = a.subjectId ?? a.courseId
    const cName = courseName(targetId)
    if (tab === 0) return [cName, a.sectionId, labName(a.labId) ?? '']
    if (tab === 1) return [cName, facultyName(a.facultyId), labName(a.labId) ?? '']
    return [cName, a.sectionId, facultyName(a.facultyId)]
  }

  return (
    <div>
      <PageHeader title="View Timetable" desc="Projections of the one authoritative master timetable — pulled live from the backend">
        <BackBtn navigate={navigate} />
      </PageHeader>

      {hasMasterRun === false && (
        <GlassPanel strong className="max-w-lg mx-auto text-center p-12 mb-6">
          <Cpu size={32} className="mx-auto text-slate-400 mb-4" strokeWidth={1.5} />
          <p className="font-display font-700 text-lg text-slate-800 mb-2">No timetable has been generated yet</p>
          <p className="text-slate-500 text-sm mb-6">Run the solver for a ready semester to populate faculty, class and lab timetable views.</p>
          <Btn onClick={() => navigate('generate')}><Cpu size={18} strokeWidth={1.8} />Generate Timetable</Btn>
        </GlassPanel>
      )}

      {hasMasterRun !== false && (
      <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 glass-pill rounded-2xl p-1.5">
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} className={`px-4 py-2 rounded-xl text-sm font-500 transition ${tab === i ? 'glass-pill-active text-[#0e254f] font-700' : 'text-slate-600 hover:text-slate-800'}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <select value={selectedFaculty} onChange={e => setSelectedFaculty(e.target.value)} className={selectCls} style={selectStyle}>
            <option value="">{scopedFaculty.length === 0 ? 'No faculty in this scope' : 'Select Faculty…'}</option>
            {scopedFaculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        {tab === 1 && (
          <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className={selectCls} style={selectStyle}>
            <option value="">{scopedSections.length === 0 ? 'No sections in this scope' : 'Select Section…'}</option>
            {scopedSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {tab === 2 && (
          <select value={selectedLab} onChange={e => setSelectedLab(e.target.value)} className={selectCls} style={selectStyle}>
            <option value="">{scopedLabs.length === 0 ? 'No labs in this scope' : 'Select Lab…'}</option>
            {scopedLabs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-700 rounded-xl px-4 py-3 mb-4 text-center">
          ⏳ {error}
        </div>
      )}

      {!config && !error && <p className="text-sm text-slate-400">Loading schedule…</p>}

      {config && (
        <GlassPanel className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th className="px-4 py-3 text-left font-600 w-20 text-white align-middle rounded-tl-3xl" style={{ background: 'linear-gradient(135deg, #0e254f, #081a38)' }}>Day</th>
                {columns.map(col =>
                  col.type === 'gap' ? (
                    <th key={col.key} className="px-2 py-2 text-center font-600 text-white" style={{ background: '#d97706', minWidth: 70 }}>{col.label}</th>
                  ) : (
                    <th key={col.index} className="px-2 py-2 text-center font-500 text-white" style={{ background: 'linear-gradient(135deg, #0e254f, #081a38)', minWidth: 100 }}>
                      <div className="font-700">{col.label}</div>
                      <div className="font-400 text-white/70 text-xs">{col.start}–{col.end}</div>
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {workingDays.map((day, di) => {
                const skipUntil = new Set<number>()
                return (
                  <tr key={day} className={`border-b border-white/30 ${di % 2 === 0 ? 'bg-white/25' : 'bg-white/10'}`}>
                    <td className="px-4 py-2 font-600 text-[#0e254f] text-xs align-middle">{day}</td>
                    {columns.map((col, ci) => {
                      if (col.type === 'gap') {
                        return (
                          <td key={col.key} className="px-1.5 py-1.5">
                            <div className="rounded-lg p-2 min-h-[52px] bg-amber-400/20 border border-amber-300/50 text-amber-700 font-600 text-center text-xs flex items-center justify-center">
                              {col.label === 'LUNCH' ? <span className="inline-flex items-center gap-1"><Utensils size={14} strokeWidth={1.8} />Lunch</span> : 'Break'}
                            </div>
                          </td>
                        )
                      }
                      if (skipUntil.has(col.index)) return null
                      const a = visibleAssignments.find(x => x.day === day && col.index >= x.startPeriod && col.index <= x.endPeriod)
                      if (!a) {
                        return <td key={ci} className="px-1.5 py-1.5"><div className="rounded-lg h-full min-h-[52px] bg-white/20" /></td>
                      }
                      if (a.startPeriod !== col.index) return null // absorbed by colSpan below
                      for (let p = a.startPeriod + 1; p <= a.endPeriod; p++) skipUntil.add(p)
                      const span = a.endPeriod - a.startPeriod + 1
                      const lines = cellContent(a)
                      return (
                        <td key={ci} colSpan={span} className="px-1.5 py-1.5">
                          <div className="rounded-lg p-2 min-h-[52px]" style={{ background: colorForCourse(a.courseId) }}>
                            <p className="font-700 text-slate-800">{lines[0]}{a.blockType === 'LAB' ? ' (Lab)' : ''}</p>
                            {lines[1] && <p className="text-slate-500 mt-0.5 leading-tight">{lines[1]}</p>}
                            {lines[2] && <p className="text-slate-400 mt-0.5">{lines[2]}</p>}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </GlassPanel>
      )}
      </>
      )}
    </div>
  )
}

export function EditTimetable({ navigate }: { navigate: (p: Page) => void }) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div>
      <PageHeader title="Edit Timetable" desc="Click a cell to edit it. Conflicts are highlighted in red.">
        <BackBtn navigate={navigate} />
        <Btn variant="secondary">Cancel</Btn>
        <Btn variant="outline">Swap Classes</Btn>
        <Btn>Save Changes</Btn>
      </PageHeader>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {[{ label: 'Assign Faculty', icon: UserRound }, { label: 'Change Classroom', icon: Building2 }].map(b => (
          <button key={b.label} className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill hover:bg-white/60 transition">
            <b.icon size={18} strokeWidth={1.8} />{b.label}
          </button>
        ))}
        <div className="flex items-center gap-3 ml-4">
          <Chip tone="danger">Conflict</Chip>
          <Chip tone="accent">Selected</Chip>
        </div>
      </div>

      <GlassPanel className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th rowSpan={2} className="px-4 py-3 text-left font-600 w-24 text-white align-middle rounded-tl-3xl" style={{ background: 'linear-gradient(135deg, #0e254f, #081a38)' }}>Day</th>
              <th colSpan={4} className="px-2 py-2 text-center font-600 text-white" style={{ background: 'linear-gradient(135deg, #0e254f, #081a38)' }}><span className="inline-flex items-center gap-1"><Sun size={16} strokeWidth={1.8} />Before Lunch</span></th>
              <th rowSpan={2} className="px-2 py-2 text-center font-600 text-white align-middle" style={{ background: '#d97706', minWidth: 70 }}><span className="inline-flex items-center gap-1"><Utensils size={16} strokeWidth={1.8} />Lunch</span></th>
              <th colSpan={3} className="px-2 py-2 text-center font-600 text-white" style={{ background: 'linear-gradient(135deg, #081a38, #f3c326)' }}><span className="inline-flex items-center gap-1"><CloudSun size={16} strokeWidth={1.8} />After Lunch</span></th>
            </tr>
            <tr>
              {beforeLunchPeriods.map(p => (
                <th key={p.id} className="px-2 py-2 text-center font-500 text-white" style={{ background: 'linear-gradient(135deg, #0e254f, #081a38)', minWidth: 100 }}>
                  <div className="font-700">{p.id}</div>
                  <div className="font-400 text-white/70 text-xs">{p.time}</div>
                </th>
              ))}
              {afterLunchPeriods.map(p => (
                <th key={p.id} className="px-2 py-2 text-center font-500 text-white" style={{ background: 'linear-gradient(135deg, #081a38, #f3c326)', minWidth: 100 }}>
                  <div className="font-700">{p.id}</div>
                  <div className="font-400 text-white/70 text-xs">{p.time}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, di) => {
              const abbr = dayAbbr[day]
              return (
                <tr key={day} className={`border-b border-white/30 ${di % 2 === 0 ? 'bg-white/25' : 'bg-white/10'}`}>
                  <td className="px-4 py-2 font-600 text-[#0e254f] text-xs align-middle">{day}</td>
                  {beforeLunchPeriods.map((_, pi) => {
                    const key = `${abbr}-${pi}`
                    const cell = cellData[key]
                    const isSelected = selected === key
                    const isConflict = key === 'Wed-2' || key === 'Thu-0'
                    return (
                      <td key={pi} className="px-1.5 py-1.5">
                        <div
                          onClick={() => setSelected(isSelected ? null : key)}
                          className={`rounded-lg p-2 min-h-[52px] cursor-pointer transition border-2 ${isSelected ? 'border-[#0e254f] bg-[#0e254f]/15' : isConflict ? 'border-rose-300 bg-rose-400/15' : 'border-transparent hover:border-white/60'}`}
                          style={!isSelected && !isConflict && cell ? { background: getCellColor(cell) } : {}}
                        >
                          {cell ? (
                            <>
                              <p className="font-700 text-slate-800">{cell.split('\n')[0]}</p>
                              {cell.split('\n')[1] && <p className="text-slate-500 mt-0.5">{cell.split('\n')[1]}</p>}
                            </>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-300">—</div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-1.5 py-1.5">
                    <div className="rounded-lg p-2 min-h-[52px] bg-amber-400/20 border border-amber-300/50 text-amber-700 text-xs text-center flex items-center justify-center">
                      <span className="inline-flex items-center gap-1"><Utensils size={14} strokeWidth={1.8} />Lunch</span>
                    </div>
                  </td>
                  {afterLunchPeriods.map((_, pi) => {
                    const key = `${abbr}-${pi + 4}`
                    const cell = cellData[key]
                    const isSelected = selected === key
                    const isConflict = key === 'Wed-2' || key === 'Thu-0'
                    return (
                      <td key={pi} className="px-1.5 py-1.5">
                        <div
                          onClick={() => setSelected(isSelected ? null : key)}
                          className={`rounded-lg p-2 min-h-[52px] cursor-pointer transition border-2 ${isSelected ? 'border-[#0e254f] bg-[#0e254f]/15' : isConflict ? 'border-rose-300 bg-rose-400/15' : 'border-transparent hover:border-white/60'}`}
                          style={!isSelected && !isConflict && cell ? { background: getCellColor(cell) } : {}}
                        >
                          {cell ? (
                            <>
                              <p className="font-700 text-slate-800">{cell.split('\n')[0]}</p>
                              {cell.split('\n')[1] && <p className="text-slate-500 mt-0.5">{cell.split('\n')[1]}</p>}
                            </>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-300">—</div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  )
}
