import { getSession } from '../session'
import { time12 } from '../utils/time12'
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
import DownloadTimetables from './DownloadTimetables'
import { downloadFile } from '../api'
import { cellLabel } from '../utils/subjectLabel'
import type { SemesterReadiness } from '../types'
import { AlertTriangle, Download, Building2, CheckCircle2, CloudSun, Clock, Cpu, Sun, UserRound, Utensils } from 'lucide-react'

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
  const [readiness, setReadiness] = useState<SemesterReadiness[]>([])
  const [cycle, setCycle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ status: TimetableStatus; conflicts: number; placements: number; seconds: number; at: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)

  const ODD = new Set(['I', 'III', 'V', 'VII'])
  const EVEN = new Set(['II', 'IV', 'VI', 'VIII'])

  useEffect(() => {
    Promise.all([api.facultyAllocation.getReadiness(), api.facultyAllocation.getCycleContext().catch(() => null)])
      .then(([rd, cy]) => {
        const c = cy?.currentCycle ?? null
        setCycle(c)
        setReadiness((rd?.readiness ?? []).filter((r: SemesterReadiness) => c === 'BOTH' || (c === 'ODD' ? ODD.has(r.semester) : c === 'EVEN' ? EVEN.has(r.semester) : true)))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load readiness.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Semesters nobody runs (no sections) are not part of this department's timetable.
  const rows = readiness.filter(r => (r.sectionCount ?? 0) > 0)
  const ready = rows.filter(r => r.canGenerate)

  async function start() {
    setRunning(true); setError(null); setResult(null)
    const t0 = Date.now()
    try {
      const r = await api.timetable.generate()
      setResult({ status: r.status, conflicts: r.conflicts.length, placements: r.assignments.length, seconds: Math.round((Date.now() - t0) / 1000), at: r.generatedAt })
      onGenerated(r.runId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed — is the SCEDULAR backend running?')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-700 text-xl text-slate-900">Generate timetable</h1>
          <p className="text-xs text-slate-500 mt-0.5">{cycle ?? '—'} cycle · every ready semester is solved together, so a teacher or lab room shared between years can never be double-booked.</p>
        </div>
        <BackBtn navigate={navigate} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 text-[11px] font-700 uppercase tracking-wider text-slate-400">Semesters</div>
        {loading ? <p className="text-xs text-slate-400 px-4 py-6">Checking…</p> : rows.length === 0 ? (
          <p className="text-xs text-slate-500 px-4 py-6">No semester has sections yet. Add sections and a syllabus in Settings first.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {rows.map(r => {
              const key = `${r.year}::${r.semester}`, open = openRow === key
              return (
                <div key={key}>
                  <button onClick={() => !r.canGenerate && setOpenRow(open ? null : key)} className={`w-full px-4 py-2.5 flex items-center gap-3 text-left ${r.canGenerate ? 'cursor-default' : 'hover:bg-slate-50'}`}>
                    {r.canGenerate ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />}
                    <div className="flex-1"><p className="text-xs font-700 text-slate-800">{r.year} · Semester {r.semester}</p><p className="text-[11px] text-slate-500">{r.sectionCount} sections · {r.subjectCount} subjects</p></div>
                    {r.canGenerate ? <span className="text-[11px] font-700 text-emerald-700">Ready</span> : <span className="text-[11px] font-700 text-amber-700">{r.missingItems.length} issue{r.missingItems.length === 1 ? '' : 's'} {open ? '▲' : '▼'}</span>}
                  </button>
                  {open && (
                    <ul className="px-11 pb-3 space-y-0.5 text-[11px] text-amber-800 list-disc">
                      {r.missingItems.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
                      {r.missingItems.length > 8 && <li>…and {r.missingItems.length - 8} more</li>}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl px-4 py-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          {running ? <p className="text-sm font-600 text-slate-700">Solving {ready.length} semester{ready.length === 1 ? '' : 's'} together… this can take up to a minute.</p>
            : result ? (
              result.status === 'GREEN'
                ? <p className="text-sm font-700 text-emerald-700">✓ Timetable ready — {result.placements} placements, no clashes <span className="font-500 text-slate-500">({result.seconds}s)</span></p>
                : <p className="text-sm font-700 text-rose-700">{result.conflicts} problem{result.conflicts === 1 ? '' : 's'} found — nothing was published.</p>
            ) : <p className="text-sm text-slate-600">{ready.length === 0 ? 'No semester is ready yet.' : `${ready.length} of ${rows.length} semester${rows.length === 1 ? '' : 's'} ready to generate.`}</p>}
          {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
        </div>
        {result?.status === 'GREEN' && <DownloadTimetables />}
        {result && <Btn variant="secondary" onClick={() => navigate(result.status === 'GREEN' ? 'view-timetable' : 'timetable-result')}>{result.status === 'GREEN' ? 'View timetable' : 'View problems'}</Btn>}
        <Btn onClick={start} disabled={running || loading || ready.length === 0}><Cpu size={16} strokeWidth={1.9} /> {running ? 'Generating…' : result ? 'Regenerate' : `Generate ${ready.length || ''} semester${ready.length === 1 ? '' : 's'}`}</Btn>
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
        <div className="max-w-md mx-auto text-center py-16">
          <p className="text-slate-400 text-sm mb-4">No timetable generated in this session.</p>
          <Btn onClick={() => navigate('generate')}>Generate</Btn>
        </div>
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
  DS: '#dcebe8', DBMS: '#dcfce7', CN: '#f4e3e8', OS: '#fef3c7',
  DSP: '#ece6f0', VLSI: '#ffedd5', Meeting: '#fee2e2', Free: '#f1f5f9',
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

const courseColorPalette = ['#dcebe8', '#dcfce7', '#f4e3e8', '#fef3c7', '#ece6f0', '#ffedd5', '#e0f2fe', '#fee2e2']
function colorForCourse(courseId: string): string {
  let hash = 0
  for (let i = 0; i < courseId.length; i++) hash = (hash * 31 + courseId.charCodeAt(i)) % courseColorPalette.length
  return courseColorPalette[Math.abs(hash) % courseColorPalette.length]
}

export function ViewTimetable({ navigate, role }: { navigate: (p: Page) => void; role?: 'FACULTY' | 'HOD' }) {
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
  const [selectedFaculty, setSelectedFaculty] = useState(() => (role === 'HOD' ? '' : getSession()?.user.facultyId ?? ''))
  const [selectedSection, setSelectedSection] = useState('')
  const [selectedLab, setSelectedLab] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasMasterRun, setHasMasterRun] = useState<boolean | null>(null)
  const isHod = role === 'HOD'
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
    if (selectedFaculty && facultyList.length > 0 && !scopedFaculty.some(f => f.id === selectedFaculty) && role === 'HOD') setSelectedFaculty('')
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
        setError(isHod ? 'Failed to load timetable data' : 'TIME TABLE GENERATION IS UNDER PROGRESS')
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
    // acronym on the grid (ARVR, NLP, DBMS LAB…); the full name is in the tooltip
    const cName = cellLabel(subjects.find(s => s.id === targetId || s.code === targetId), courseName(targetId), a.blockType === 'LAB')
    if (tab === 0) return [cName, a.sectionId, labName(a.labId) ?? '']
    if (tab === 1) return [cName, facultyName(a.facultyId), labName(a.labId) ?? '']
    return [cName, a.sectionId, facultyName(a.facultyId)]
  }

  return (
    <div>
      <PageHeader title="View Timetable">
        {isHod && <DownloadTimetables />}
        <BackBtn navigate={navigate} />
      </PageHeader>

      {hasMasterRun === false && (
        <div className="max-w-lg mx-auto text-center py-20">
          {isHod ? (
            <>
              <div className="mx-auto mb-5 w-20 h-20 rounded-full bg-[#1f6a63]/10 flex items-center justify-center shadow-sm">
                <Cpu size={36} className="text-[#1f6a63]" strokeWidth={1.4} />
              </div>
              <p className="font-display font-800 text-xl text-slate-800 mb-1.5">No Timetable Generated Yet</p>
              <p className="text-slate-400 text-sm mb-8 max-w-xs mx-auto">Generate a timetable to view it here. The AI scheduler will optimize faculty, section, and lab allocations.</p>
              <button
                onClick={() => navigate('generate')}
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-[#1f6a63] to-[#17403d] text-white font-700 text-base shadow-lg shadow-[#1f6a63]/25 hover:from-[#17504b] hover:to-[#0c1d42] hover:shadow-xl hover:shadow-[#1f6a63]/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
              >
                <Cpu size={20} strokeWidth={2} />
                Generate Timetable
              </button>
            </>
          ) : (
            <>
              <div className="mx-auto mb-5 w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-amber-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="font-display font-800 text-xl text-slate-800 mb-1.5">Time Table Generation Under Progress</p>
              <p className="text-slate-400 text-sm max-w-xs mx-auto">Please wait while the HOD generates the timetable.</p>
            </>
          )}
        </div>
      )}

      {hasMasterRun !== false && (
      <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 glass-pill rounded-2xl p-1.5">
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} className={`px-4 py-2 rounded-xl text-sm font-500 transition ${tab === i ? 'glass-pill-active text-[#17403d] font-700' : 'text-slate-600 hover:text-slate-800'}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 0 && selectedFaculty && (
          <button onClick={() => downloadFile(`/timetable/export/faculty/${encodeURIComponent(selectedFaculty)}`, 'Timetable.pdf').catch(e => setError(e.message))}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-500 text-[#1b5550] bg-white/40 ring-1 ring-[#1b5550]/25 hover:bg-white/70 transition">
            <Download size={14} /> {isHod ? 'Download PDF' : 'Download my timetable'}
          </button>
        )}
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
        <GlassPanel className="overflow-x-auto hidden md:block">
          <table className="w-full text-xs" style={{ minWidth: 820, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="px-4 py-3 text-left font-600 w-20 text-white align-middle rounded-tl-3xl" style={{ background: 'linear-gradient(135deg, #17403d, #0f2f2d)' }}>Day</th>
                {columns.map(col =>
                  col.type === 'gap' ? (
                    <th key={col.key} className="px-2 py-2 text-center font-600 text-white" style={{ background: '#d97706', width: 62 }}>{col.label}</th>
                  ) : (
                    <th key={col.index} className="px-2 py-2 text-center font-500 text-white" style={{ background: 'linear-gradient(135deg, #17403d, #0f2f2d)' }}>
                      <div className="font-700">{col.label}</div>
                      <div className="font-400 text-white/70 text-xs">{time12(col.start)}–{time12(col.end)}</div>
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
                    <td className="px-4 py-2 font-600 text-[#17403d] text-xs align-middle">{day}</td>
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
                          <div className="rounded-lg p-2 min-h-[52px] overflow-hidden" title={courseName(a.subjectId ?? a.courseId)} style={{ background: colorForCourse(a.courseId) }}>
                            <p className="font-700 text-slate-800 text-[13px] tracking-wide">{lines[0]}</p>
                            {lines[1] && <p className="text-slate-500 mt-0.5 leading-tight [overflow-wrap:anywhere]">{lines[1]}</p>}
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

      {/* phones: one card per day instead of the wide grid */}
      {config && (
        <div className="md:hidden space-y-3">
          {(selectedFaculty || selectedSection || selectedLab) === '' && <p className="text-sm text-slate-500 text-center py-6">Choose {tab === 0 ? 'a teacher' : tab === 1 ? 'a section' : 'a lab'} above to see the week.</p>}
          {(tab === 0 ? selectedFaculty : tab === 1 ? selectedSection : selectedLab) && workingDays.map(day => {
            const rows = visibleAssignments.filter(a => a.day === day).sort((x, y) => x.startPeriod - y.startPeriod)
            const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
            const isToday = day.toLowerCase().startsWith(todayName.slice(0, 3))
            const periodCol = (i: number) => columns.find(c => c.type === 'period' && c.index === i) as Extract<GridColumn, { type: 'period' }> | undefined
            return (
              <section key={day} className={`rounded-2xl border p-3.5 ${isToday ? 'border-[#17403d]/40 bg-white/80' : 'border-white/40 bg-white/45'}`}>
                <h3 className="flex items-center gap-2 text-sm font-700 text-[#17403d]">{day}{isToday && <span className="text-[10px] font-700 uppercase tracking-wider rounded-full bg-[#c9a24a]/30 text-[#8a6500] px-2 py-0.5">Today</span>}<span className="ml-auto text-[11px] font-500 text-slate-400">{rows.length} class{rows.length === 1 ? '' : 'es'}</span></h3>
                {rows.length === 0 ? <p className="text-xs text-slate-400 mt-2">Free day</p> : (
                  <ul className="mt-2.5 space-y-2">
                    {rows.map((a, i) => {
                      const lines = cellContent(a)
                      const from = periodCol(a.startPeriod), to = periodCol(a.endPeriod)
                      return (
                        <li key={i} className="flex gap-3 rounded-xl p-2.5" style={{ background: colorForCourse(a.courseId) }}>
                          <div className="w-[68px] shrink-0 text-[11px] leading-tight text-slate-600 font-600">
                            {from && to ? <>{time12(from.start)}<br />{time12(to.end)}</> : `P${a.startPeriod}`}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-700 text-slate-800">{lines[0]}</p>
                            <p className="text-[11.5px] text-slate-500 truncate">{courseName(a.subjectId ?? a.courseId)}</p>
                            <p className="text-[11.5px] text-slate-500">{[lines[1], lines[2]].filter(Boolean).join(' · ')}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
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
              <th rowSpan={2} className="px-4 py-3 text-left font-600 w-24 text-white align-middle rounded-tl-3xl" style={{ background: 'linear-gradient(135deg, #17403d, #0f2f2d)' }}>Day</th>
              <th colSpan={4} className="px-2 py-2 text-center font-600 text-white" style={{ background: 'linear-gradient(135deg, #17403d, #0f2f2d)' }}><span className="inline-flex items-center gap-1"><Sun size={16} strokeWidth={1.8} />Before Lunch</span></th>
              <th rowSpan={2} className="px-2 py-2 text-center font-600 text-white align-middle" style={{ background: '#d97706', minWidth: 70 }}><span className="inline-flex items-center gap-1"><Utensils size={16} strokeWidth={1.8} />Lunch</span></th>
              <th colSpan={3} className="px-2 py-2 text-center font-600 text-white" style={{ background: 'linear-gradient(135deg, #0f2f2d, #c9a24a)' }}><span className="inline-flex items-center gap-1"><CloudSun size={16} strokeWidth={1.8} />After Lunch</span></th>
            </tr>
            <tr>
              {beforeLunchPeriods.map(p => (
                <th key={p.id} className="px-2 py-2 text-center font-500 text-white" style={{ background: 'linear-gradient(135deg, #17403d, #0f2f2d)', minWidth: 100 }}>
                  <div className="font-700">{p.id}</div>
                  <div className="font-400 text-white/70 text-xs">{p.time}</div>
                </th>
              ))}
              {afterLunchPeriods.map(p => (
                <th key={p.id} className="px-2 py-2 text-center font-500 text-white" style={{ background: 'linear-gradient(135deg, #0f2f2d, #c9a24a)', minWidth: 100 }}>
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
                  <td className="px-4 py-2 font-600 text-[#17403d] text-xs align-middle">{day}</td>
                  {beforeLunchPeriods.map((_, pi) => {
                    const key = `${abbr}-${pi}`
                    const cell = cellData[key]
                    const isSelected = selected === key
                    const isConflict = key === 'Wed-2' || key === 'Thu-0'
                    return (
                      <td key={pi} className="px-1.5 py-1.5">
                        <div
                          onClick={() => setSelected(isSelected ? null : key)}
                          className={`rounded-lg p-2 min-h-[52px] cursor-pointer transition border-2 ${isSelected ? 'border-[#17403d] bg-[#17403d]/15' : isConflict ? 'border-rose-300 bg-rose-400/15' : 'border-transparent hover:border-white/60'}`}
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
                          className={`rounded-lg p-2 min-h-[52px] cursor-pointer transition border-2 ${isSelected ? 'border-[#17403d] bg-[#17403d]/15' : isConflict ? 'border-rose-300 bg-rose-400/15' : 'border-transparent hover:border-white/60'}`}
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
