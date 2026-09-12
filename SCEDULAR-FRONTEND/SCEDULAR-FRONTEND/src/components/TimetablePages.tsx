import { useEffect, useState } from 'react'
import { PageHeader, Btn } from './ui'
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
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-500 text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
          <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${status === 'GREEN' ? 'bg-green-50' : status === 'RED' ? 'bg-red-50' : 'bg-blue-50'} transition-colors`}>
            {status === 'GREEN' && (
              <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {status === 'RED' && (
              <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            )}
            {!done && (
              <svg
                className={`w-12 h-12 text-[#0F4C81] ${running ? 'animate-spin' : ''}`}
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

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          {status === 'GREEN' && (
            <>
              <h2 className="font-display font-800 text-2xl text-green-600 mb-2">Timetable Generated!</h2>
              <p className="text-slate-400 text-sm mb-6">Solver + independent validator both passed with 0 conflicts.</p>
              <button onClick={() => navigate('timetable-result')} className="bg-[#0F4C81] text-white px-8 py-3 rounded-xl font-600 hover:bg-[#0a3860] transition shadow-md">
                View Results →
              </button>
            </>
          )}

          {status === 'RED' && (
            <>
              <h2 className="font-display font-800 text-2xl text-red-600 mb-2">Infeasible</h2>
              <p className="text-slate-400 text-sm mb-6">{conflictCount} hard-constraint conflict{conflictCount !== 1 ? 's' : ''} found — no valid timetable was produced.</p>
              <button onClick={() => navigate('timetable-result')} className="bg-[#0F4C81] text-white px-8 py-3 rounded-xl font-600 hover:bg-[#0a3860] transition shadow-md">
                View Conflicts →
              </button>
            </>
          )}

          {!done && (
            <>
              <h2 className="font-display font-800 text-xl text-[#0F4C81] mb-2">
                {running ? 'Running solver…' : 'Ready to Generate'}
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                {running ? 'Expanding requirements, backtracking search, then independent validation' : 'Click the button to run the scheduling pipeline'}
              </p>
              <button
                onClick={start}
                disabled={running}
                className="bg-[#0F4C81] text-white px-10 py-3.5 rounded-xl font-700 text-base hover:bg-[#0a3860] transition shadow-md hover:shadow-lg disabled:opacity-60"
              >
                {running ? 'Generating…' : '⚙ Generate Timetable'}
              </button>
            </>
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
        <div className="max-w-lg mx-auto text-center bg-white rounded-2xl shadow-sm border border-slate-100 p-12">
          <p className="text-slate-500 text-sm mb-4">No timetable has been generated in this session yet.</p>
          <button onClick={() => navigate('generate')} className="bg-[#0F4C81] text-white px-6 py-2.5 rounded-lg font-600 text-sm hover:bg-[#0a3860] transition">Go to Generate →</button>
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
        <div className="max-w-lg mx-auto bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error ?? 'Run not found'}</div>
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12">
          <div className="text-6xl mb-4">{isGreen ? '🎉' : '⚠️'}</div>
          <h2 className={`font-display font-800 text-2xl mb-2 ${isGreen ? 'text-green-600' : 'text-red-600'}`}>
            {isGreen ? 'Timetable Generated Successfully' : 'Infeasible — No Valid Timetable'}
          </h2>
          <p className="text-slate-400 text-sm mb-2">Run #{run.id} · {new Date(run.generatedAt).toLocaleString()}</p>
          <div className="flex items-center justify-center gap-4 my-5">
            {[
              { v: String(run.conflicts.length), l: 'Conflicts' },
              { v: String(run.assignments.length), l: 'Assignments' },
              { v: String(run.unscheduled.length), l: 'Unscheduled' },
            ].map(s => (
              <div key={s.l} className="text-center">
                <p className={`font-display font-800 text-2xl ${isGreen ? 'text-[#0F4C81]' : 'text-red-500'}`}>{s.v}</p>
                <p className="text-xs text-slate-400">{s.l}</p>
              </div>
            ))}
          </div>

          {run.conflicts.length > 0 && (
            <div className="text-left bg-red-50 border border-red-100 rounded-lg p-3 mb-5 max-h-56 overflow-y-auto space-y-2">
              {run.conflicts.map((c: Conflict, i: number) => (
                <div key={i} className="text-xs">
                  <span className="font-600 text-red-700">{c.type}</span>
                  <span className="text-red-600"> — {c.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-6">
            <button onClick={() => navigate('view-timetable')} className="bg-[#0F4C81] text-white py-2.5 rounded-lg font-600 text-sm hover:bg-[#0a3860] transition">View Timetable</button>
            <button onClick={() => navigate('generate')} className="border border-[#0F4C81] text-[#0F4C81] py-2.5 rounded-lg font-600 text-sm hover:bg-blue-50 transition">Generate Again</button>
          </div>
        </div>
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

  const chevronDown = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
  const selectCls = "border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 appearance-none cursor-pointer pr-8 min-w-48"
  const selectStyle = { backgroundImage: chevronDown, backgroundRepeat: 'no-repeat' as const, backgroundPosition: 'right 10px center' }

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
        <div className="flex gap-1 bg-white rounded-xl border border-slate-100 p-1.5 shadow-sm">
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} className={`px-4 py-2 rounded-lg text-sm font-500 transition ${tab === i ? 'bg-[#0F4C81] text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
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

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">{error}</div>}

      {!config && !error && <p className="text-sm text-slate-400">Loading schedule…</p>}

      {config && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th className="px-4 py-3 text-left font-600 w-20 text-white align-middle" style={{ background: '#0F4C81' }}>Day</th>
                {columns.map(col =>
                  col.type === 'gap' ? (
                    <th key={col.key} className="px-2 py-2 text-center font-600 text-white" style={{ background: '#d97706', minWidth: 70 }}>{col.label}</th>
                  ) : (
                    <th key={col.index} className="px-2 py-2 text-center font-500 text-white" style={{ background: '#0F4C81', minWidth: 100 }}>
                      <div className="font-700">{col.label}</div>
                      <div className="font-400 text-blue-200 text-xs">{col.start}–{col.end}</div>
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {workingDays.map((day, di) => {
                const skipUntil = new Set<number>()
                return (
                  <tr key={day} className={`border-b border-slate-100 ${di % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-2 font-600 text-[#0F4C81] text-xs align-middle">{day}</td>
                    {columns.map((col, ci) => {
                      if (col.type === 'gap') {
                        return (
                          <td key={col.key} className="px-1.5 py-1.5">
                            <div className="rounded-lg p-2 min-h-[52px] bg-amber-50 border border-amber-200 text-amber-700 font-600 text-center text-xs flex items-center justify-center">
                              {col.label === 'LUNCH' ? '🍽 Lunch' : 'Break'}
                            </div>
                          </td>
                        )
                      }
                      if (skipUntil.has(col.index)) return null
                      const a = assignments.find(x => x.day === day && col.index >= x.startPeriod && col.index <= x.endPeriod)
                      if (!a) {
                        return <td key={ci} className="px-1.5 py-1.5"><div className="rounded h-full min-h-[52px] bg-slate-50" /></td>
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
        </div>
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

      <div className="flex gap-3 mb-4">
        {[{ label: 'Assign Faculty', icon: '👤' }, { label: 'Change Classroom', icon: '🏫' }].map(b => (
          <button key={b.label} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-500 text-slate-600 hover:border-[#0F4C81] hover:text-[#0F4C81] transition shadow-sm">
            <span>{b.icon}</span>{b.label}
          </button>
        ))}
        <div className="flex items-center gap-3 ml-4 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 border border-red-300 rounded inline-block" /> Conflict</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 border border-blue-400 rounded inline-block" /> Selected</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th rowSpan={2} className="px-4 py-3 text-left font-600 w-24 text-white align-middle" style={{ background: '#0F4C81' }}>Day</th>
              <th colSpan={4} className="px-2 py-2 text-center font-600 text-white" style={{ background: '#0F4C81' }}>☀ Before Lunch</th>
              <th rowSpan={2} className="px-2 py-2 text-center font-600 text-white align-middle" style={{ background: '#d97706', minWidth: 70 }}>🍽 Lunch</th>
              <th colSpan={3} className="px-2 py-2 text-center font-600 text-white" style={{ background: '#1a6bb5' }}>🌤 After Lunch</th>
            </tr>
            <tr>
              {beforeLunchPeriods.map(p => (
                <th key={p.id} className="px-2 py-2 text-center font-500 text-white" style={{ background: '#0F4C81', minWidth: 100 }}>
                  <div className="font-700">{p.id}</div>
                  <div className="font-400 text-blue-200 text-xs">{p.time}</div>
                </th>
              ))}
              {afterLunchPeriods.map(p => (
                <th key={p.id} className="px-2 py-2 text-center font-500 text-white" style={{ background: '#1a6bb5', minWidth: 100 }}>
                  <div className="font-700">{p.id}</div>
                  <div className="font-400 text-blue-200 text-xs">{p.time}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, di) => {
              const abbr = dayAbbr[day]
              return (
                <tr key={day} className={`border-b border-slate-100 ${di % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                  <td className="px-4 py-2 font-600 text-[#0F4C81] text-xs align-middle">{day}</td>
                  {beforeLunchPeriods.map((_, pi) => {
                    const key = `${abbr}-${pi}`
                    const cell = cellData[key]
                    const isSelected = selected === key
                    const isConflict = key === 'Wed-2' || key === 'Thu-0'
                    return (
                      <td key={pi} className="px-1.5 py-1.5">
                        <div
                          onClick={() => setSelected(isSelected ? null : key)}
                          className={`rounded-lg p-2 min-h-[52px] cursor-pointer transition border-2 ${isSelected ? 'border-blue-400 bg-blue-50' : isConflict ? 'border-red-300 bg-red-50' : 'border-transparent hover:border-slate-300'}`}
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
                    <div className="rounded-lg p-2 min-h-[52px] bg-amber-50 border border-amber-200 text-amber-700 text-xs text-center flex items-center justify-center">
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
                          className={`rounded-lg p-2 min-h-[52px] cursor-pointer transition border-2 ${isSelected ? 'border-blue-400 bg-blue-50' : isConflict ? 'border-red-300 bg-red-50' : 'border-transparent hover:border-slate-300'}`}
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
      </div>
    </div>
  )
}
