import { useEffect, useState } from 'react'
import { PageHeader, Btn, GlassPanel, Chip } from './ui'
import type { Page } from '../types'
import {
  api,
  type Assignment,
  type Conflict,
  type Course,
  type Faculty,
  type Lab,
  type RunDetail,
  type ScheduleConfig,
  type Section,
  type TimetableStatus,
} from '../api'

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

  async function start() {
    setRunning(true)
    setError(null)
    setStatus(null)
    try {
      const result = await api.timetable.generate()
      setStatus(result.status)
      setConflictCount(result.conflicts.length)
      onGenerated(result.runId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed — is the SCEDULAR backend running?')
    } finally {
      setRunning(false)
    }
  }

  const done = status !== null

  return (
    <div>
      <PageHeader title="Generate Timetable" desc="Runs the deterministic CSP solver, then an independent validator, against the current faculty/section/course/lab data">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <div className="max-w-xl mx-auto">
        <GlassPanel strong className="p-10 text-center">
          <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center bg-gradient-to-br ${status === 'GREEN' ? 'from-emerald-400/25 to-emerald-300/10' : status === 'RED' ? 'from-rose-400/25 to-rose-300/10' : 'from-[#0e254f]/20 to-[#f3c326]/15'} transition-colors`}>
            {status === 'GREEN' && (
              <svg className="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {status === 'RED' && (
              <svg className="w-12 h-12 text-rose-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            )}
            {!done && (
              <svg
                className={`w-12 h-12 text-[#0e254f] ${running ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
                style={{ animationDuration: '2s' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            )}
          </div>

          {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}

          {status === 'GREEN' && (
            <>
              <h2 className="font-display font-800 text-2xl text-emerald-600 mb-2">Timetable Generated!</h2>
              <p className="text-slate-500 text-sm mb-6">Solver + independent validator both passed with 0 conflicts.</p>
              <Btn onClick={() => navigate('timetable-result')}>View Results →</Btn>
            </>
          )}

          {status === 'RED' && (
            <>
              <h2 className="font-display font-800 text-2xl text-rose-600 mb-2">Infeasible</h2>
              <p className="text-slate-500 text-sm mb-6">{conflictCount} hard-constraint conflict{conflictCount !== 1 ? 's' : ''} found — no valid timetable was produced.</p>
              <Btn onClick={() => navigate('timetable-result')}>View Conflicts →</Btn>
            </>
          )}

          {!done && (
            <>
              <h2 className="font-display font-800 text-xl text-slate-800 mb-2">
                {running ? 'Running solver…' : 'Ready to Generate'}
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                {running ? 'Expanding requirements, backtracking search, then independent validation' : 'Click the button to run the scheduling pipeline'}
              </p>
              <Btn onClick={start} disabled={running}>{running ? 'Generating…' : '⚙ Generate Timetable'}</Btn>
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  )
}

export function TimetableResult({ navigate, runId }: { navigate: (p: Page) => void; runId: number | null }) {
  const [run, setRun] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (runId === null) {
      setLoading(false)
      return
    }
    api.timetable
      .run(runId)
      .then(setRun)
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
      <div className="max-w-lg mx-auto text-center">
        <GlassPanel strong className="p-12">
          <div className="text-6xl mb-4">{isGreen ? '🎉' : '⚠️'}</div>
          <h2 className={`font-display font-800 text-2xl mb-2 ${isGreen ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isGreen ? 'Timetable Generated Successfully' : 'Infeasible — No Valid Timetable'}
          </h2>
          <p className="text-slate-500 text-sm mb-2">Run #{run.id} · {new Date(run.generatedAt).toLocaleString()}</p>
          <div className="flex items-center justify-center gap-4 my-5">
            {[
              { v: String(run.conflicts.length), l: 'Conflicts' },
              { v: String(run.assignments.length), l: 'Assignments' },
              { v: String(run.unscheduled.length), l: 'Unscheduled' },
            ].map(s => (
              <div key={s.l} className="text-center">
                <p className={`font-display font-800 text-2xl ${isGreen ? 'text-[#0e254f]' : 'text-rose-500'}`}>{s.v}</p>
                <p className="text-xs text-slate-500">{s.l}</p>
              </div>
            ))}
          </div>

          {run.conflicts.length > 0 && (
            <div className="text-left bg-rose-400/15 border border-rose-300/40 rounded-xl p-3 mb-5 max-h-56 overflow-y-auto space-y-1.5">
              {run.conflicts.map((c: Conflict, i: number) => (
                <div key={i} className="text-xs bg-white/50 rounded-lg px-2.5 py-1.5">
                  <span className="font-700 text-rose-700">{c.type}</span>
                  <span className="text-rose-600"> — {c.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-6">
            <Btn onClick={() => navigate('view-timetable')}>View Timetable</Btn>
            <Btn variant="outline" onClick={() => navigate('generate')}>Generate Again</Btn>
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
  const [tab, setTab] = useState(0)
  const [sections, setSections] = useState<Section[]>([])
  const [facultyList, setFacultyList] = useState<Faculty[]>([])
  const [labs, setLabs] = useState<Lab[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [config, setConfig] = useState<ScheduleConfig | null>(null)
  const [selectedFaculty, setSelectedFaculty] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [selectedLab, setSelectedLab] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [error, setError] = useState<string | null>(null)
  const tabs = ['Faculty Timetable', 'Class Timetable', 'Lab Timetable']

  useEffect(() => {
    Promise.all([api.sections.list(), api.faculty.list(), api.labs.list(), api.courses.list(), api.config.get()])
      .then(([s, f, l, c, cfg]) => {
        setSections(s)
        setFacultyList(f)
        setLabs(l)
        setCourses(c)
        setConfig(cfg)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load timetable data'))
  }, [])

  useEffect(() => {
    setError(null)
    setAssignments([])
    const load = async () => {
      try {
        if (tab === 0 && selectedFaculty) setAssignments((await api.timetable.faculty(selectedFaculty)).assignments)
        if (tab === 1 && selectedSection) setAssignments((await api.timetable.section(selectedSection)).assignments)
        if (tab === 2 && selectedLab) setAssignments((await api.timetable.lab(selectedLab)).assignments)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No validated timetable is available yet — generate one first.')
      }
    }
    load()
  }, [tab, selectedFaculty, selectedSection, selectedLab])

  const courseName = (id: string) => courses.find(c => c.id === id)?.name ?? id
  const facultyName = (id: string) => facultyList.find(f => f.id === id)?.name ?? id
  const labName = (id?: string) => (id ? labs.find(l => l.id === id)?.name ?? id : undefined)

  const chevronDown = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23636b8a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`
  const selectCls = "glass-input rounded-xl px-3.5 py-2.5 text-sm text-slate-800 transition appearance-none cursor-pointer pr-9 min-w-48 bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat"
  const selectStyle = { backgroundImage: chevronDown }

  const columns = config ? buildColumns(config) : []
  const workingDays = config?.workingDays ?? []

  function cellContent(a: Assignment): string[] {
    if (tab === 0) return [courseName(a.courseId), a.sectionId, labName(a.labId) ?? '']
    if (tab === 1) return [courseName(a.courseId), facultyName(a.facultyId), labName(a.labId) ?? '']
    return [courseName(a.courseId), a.sectionId, facultyName(a.facultyId)]
  }

  return (
    <div>
      <PageHeader title="View Timetable" desc="Projections of the one authoritative master timetable — pulled live from the backend">
        <BackBtn navigate={navigate} />
      </PageHeader>

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
            <option value="">Select Faculty…</option>
            {facultyList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        {tab === 1 && (
          <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className={selectCls} style={selectStyle}>
            <option value="">Select Section…</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {tab === 2 && (
          <select value={selectedLab} onChange={e => setSelectedLab(e.target.value)} className={selectCls} style={selectStyle}>
            <option value="">Select Lab…</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>

      {error && <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>}

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
                              {col.label === 'LUNCH' ? '🍽 Lunch' : 'Break'}
                            </div>
                          </td>
                        )
                      }
                      if (skipUntil.has(col.index)) return null
                      const a = assignments.find(x => x.day === day && col.index >= x.startPeriod && col.index <= x.endPeriod)
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
        {[{ label: 'Assign Faculty', icon: '👤' }, { label: 'Change Classroom', icon: '🏫' }].map(b => (
          <button key={b.label} className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill hover:bg-white/60 transition">
            <span>{b.icon}</span>{b.label}
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
              <th colSpan={4} className="px-2 py-2 text-center font-600 text-white" style={{ background: 'linear-gradient(135deg, #0e254f, #081a38)' }}>☀ Before Lunch</th>
              <th rowSpan={2} className="px-2 py-2 text-center font-600 text-white align-middle" style={{ background: '#d97706', minWidth: 70 }}>🍽 Lunch</th>
              <th colSpan={3} className="px-2 py-2 text-center font-600 text-white" style={{ background: 'linear-gradient(135deg, #081a38, #f3c326)' }}>🌤 After Lunch</th>
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
                      🍽 Lunch
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
