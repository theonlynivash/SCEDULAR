import { useState } from 'react'
import { PageHeader, Btn } from './ui'
import type { Page } from '../types'

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

const genSteps = [
  'Reading Curriculum',
  'Reading Faculty Details',
  'Reading Workload Data',
  'Applying Constraints',
  'Running AI Scheduler',
  'Generating Timetable',
]

export function GenerateTimetable({ navigate }: { navigate: (p: Page) => void }) {
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(-1)
  const [done, setDone] = useState(false)

  const start = () => {
    setRunning(true)
    setStep(0)
    setDone(false)
    let s = 0
    const iv = setInterval(() => {
      s++
      if (s >= genSteps.length) {
        clearInterval(iv)
        setStep(genSteps.length - 1)
        setTimeout(() => { setDone(true); setRunning(false) }, 500)
      } else {
        setStep(s)
      }
    }, 700)
  }

  const pct = step < 0 ? 0 : Math.round(((step + 1) / genSteps.length) * 100)

  return (
    <div>
      <PageHeader title="Generate Timetable" desc="Run the AI scheduling engine to produce optimal timetables">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
          <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${done ? 'bg-green-50' : 'bg-blue-50'} transition-colors`}>
            {done ? (
              <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
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

          {done ? (
            <>
              <h2 className="font-display font-800 text-2xl text-green-600 mb-2">Timetable Generated!</h2>
              <p className="text-slate-400 text-sm mb-6">AI scheduling completed successfully with 0 conflicts.</p>
              <button onClick={() => navigate('timetable-result')} className="bg-[#0F4C81] text-white px-8 py-3 rounded-xl font-600 hover:bg-[#0a3860] transition shadow-md">
                View Results →
              </button>
            </>
          ) : (
            <>
              <h2 className="font-display font-800 text-xl text-[#0F4C81] mb-2">
                {running ? genSteps[step] + '…' : 'Ready to Generate'}
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                {running ? `Step ${step + 1} of ${genSteps.length}` : 'Click the button to start the AI scheduling engine'}
              </p>
              {running && (
                <div className="mb-6 space-y-1">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0F4C81] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 text-right">{pct}%</p>
                  <div className="mt-4 space-y-1.5">
                    {genSteps.map((s, i) => (
                      <div key={s} className="flex items-center gap-2 text-xs text-left">
                        {i < step ? (
                          <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : i === step ? (
                          <div className="w-3.5 h-3.5 border-2 border-[#0F4C81] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 border-2 border-slate-200 rounded-full flex-shrink-0" />
                        )}
                        <span className={i <= step ? 'text-slate-700' : 'text-slate-300'}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!running && (
                <button onClick={start} className="bg-[#0F4C81] text-white px-10 py-3.5 rounded-xl font-700 text-base hover:bg-[#0a3860] transition shadow-md hover:shadow-lg">
                  🤖 Generate Timetable
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function TimetableResult({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div>
      <PageHeader title="Timetable Result">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <div className="max-w-lg mx-auto text-center">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="font-display font-800 text-2xl text-green-600 mb-2">Timetable Generated Successfully</h2>
          <p className="text-slate-400 text-sm mb-2">All 12 departments · 142 faculty · 386 subjects</p>
          <div className="flex items-center justify-center gap-4 my-5">
            {[{ v: '0', l: 'Conflicts' }, { v: '100%', l: 'Coverage' }, { v: '98%', l: 'Efficiency' }].map(s => (
              <div key={s.l} className="text-center">
                <p className="font-display font-800 text-2xl text-[#0F4C81]">{s.v}</p>
                <p className="text-xs text-slate-400">{s.l}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <button onClick={() => navigate('view-timetable')} className="bg-[#0F4C81] text-white py-2.5 rounded-lg font-600 text-sm hover:bg-[#0a3860] transition">View Timetable</button>
            <button onClick={() => navigate('edit-timetable')} className="border border-[#0F4C81] text-[#0F4C81] py-2.5 rounded-lg font-600 text-sm hover:bg-blue-50 transition">Edit Timetable</button>
            <button className="bg-green-600 text-white py-2.5 rounded-lg font-600 text-sm hover:bg-green-700 transition">⬇ Download Excel</button>
            <button className="bg-red-500 text-white py-2.5 rounded-lg font-600 text-sm hover:bg-red-600 transition">⬇ Download PDF</button>
          </div>
          <button className="mt-3 text-sm text-slate-400 hover:text-slate-600 transition">Generate Again →</button>
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

const facultyNames = [
  'Dr. R. Krishnamurthy', 'Dr. M. Priya', 'Mr. S. Arumugam',
  'Dr. V. Lakshmi', 'Ms. T. Deepika', 'Dr. K. Ramesh',
  'Dr. J. Suganya Devi', 'Mr. P. Venkatesh', 'Ms. S. Meena',
]

const classSections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

const labNames = [
  'CS Lab 1', 'CS Lab 2', 'Networks Lab', 'OS Lab',
  'DBMS Lab', 'AI/ML Lab', 'Hardware Lab', 'Project Lab',
]

export function ViewTimetable({ navigate }: { navigate: (p: Page) => void }) {
  const [tab, setTab] = useState(0)
  const [selectedFaculty, setSelectedFaculty] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [selectedLab, setSelectedLab] = useState('')
  const tabs = ['Faculty Timetable', 'Class Timetable', 'Lab Timetable']

  const chevronDown = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
  const selectCls = "border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 appearance-none cursor-pointer pr-8 min-w-48"
  const selectStyle = { backgroundImage: chevronDown, backgroundRepeat: 'no-repeat' as const, backgroundPosition: 'right 10px center' }

  return (
    <div>
      <PageHeader title="View Timetable" desc="CSE Department — Semester 5 — 2024–25">
        <BackBtn navigate={navigate} />
        <Btn variant="secondary">Export PDF</Btn>
        <Btn>Export Excel</Btn>
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
            {facultyNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        {tab === 1 && (
          <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className={selectCls} style={selectStyle}>
            <option value="">Select Section…</option>
            {classSections.map(s => <option key={s} value={s}>Section {s}</option>)}
          </select>
        )}
        {tab === 2 && (
          <select value={selectedLab} onChange={e => setSelectedLab(e.target.value)} className={selectCls} style={selectStyle}>
            <option value="">Select Lab…</option>
            {labNames.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th rowSpan={2} className="px-4 py-3 text-left font-600 w-24 text-white align-middle" style={{ background: '#0F4C81' }}>Day</th>
              <th colSpan={4} className="px-2 py-2 text-center font-600 text-white" style={{ background: '#0F4C81' }}>☀ Before Lunch</th>
              <th rowSpan={2} className="px-2 py-2 text-center font-600 text-white align-middle" style={{ background: '#d97706', minWidth: 70 }}>🍽 Lunch Break</th>
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
                    if (!cell) return <td key={pi} className="px-1.5 py-1.5"><div className="rounded h-full min-h-[52px] bg-slate-50" /></td>
                    const lines = cell.split('\n')
                    return (
                      <td key={pi} className="px-1.5 py-1.5">
                        <div className="rounded-lg p-2 min-h-[52px]" style={{ background: getCellColor(cell) }}>
                          <p className="font-700 text-slate-800">{lines[0]}</p>
                          {lines[1] && <p className="text-slate-500 mt-0.5 leading-tight">{lines[1]}</p>}
                          {lines[2] && <p className="text-slate-400 mt-0.5">{lines[2]}</p>}
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-1.5 py-1.5">
                    <div className="rounded-lg p-2 min-h-[52px] bg-amber-50 border border-amber-200 text-amber-700 font-600 text-center text-xs flex items-center justify-center">
                      🍽 Lunch
                    </div>
                  </td>
                  {afterLunchPeriods.map((_, pi) => {
                    const key = `${abbr}-${pi + 4}`
                    const cell = cellData[key]
                    if (!cell) return <td key={pi} className="px-1.5 py-1.5"><div className="rounded h-full min-h-[52px] bg-slate-50" /></td>
                    const lines = cell.split('\n')
                    return (
                      <td key={pi} className="px-1.5 py-1.5">
                        <div className="rounded-lg p-2 min-h-[52px]" style={{ background: getCellColor(cell) }}>
                          <p className="font-700 text-slate-800">{lines[0]}</p>
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
