import { useState } from 'react'
import { PageHeader, Btn } from './ui'
import type { Page } from '../types'

function BarChart({ data, color }: { data: { label: string; value: number; max: number }[]; color: string }) {
  return (
    <div className="space-y-3">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-36 flex-shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden">
            <div
              className="h-full rounded-lg flex items-center px-2 transition-all"
              style={{ width: `${(d.value / d.max) * 100}%`, background: color }}
            >
              <span className="text-xs text-white font-500">{d.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const prefRows = [
  { faculty: 'Dr. J. Suganya Devi', dept: 'AI&DS', year: 'IV Year', subject: 'Advanced ML', code: '23AD4101', type: 'Theory ★', sections: 2, labLinked: true, submitted: true },
  { faculty: 'Dr. J. Suganya Devi', dept: 'AI&DS', year: 'IV Year', subject: 'Advanced ML Lab', code: '23AD4L01', type: 'Lab', sections: 1, labLinked: false, submitted: true },
  { faculty: 'Dr. J. Suganya Devi', dept: 'AI&DS', year: 'III Year', subject: 'Machine Learning', code: '23AD3101', type: 'Theory', sections: 1, labLinked: true, submitted: true },
  { faculty: 'Dr. R. Krishnamurthy', dept: 'CSE', year: 'IV Year', subject: 'Deep Learning ★', code: '23AD4102', type: 'Theory ★', sections: 2, labLinked: true, submitted: true },
  { faculty: 'Dr. R. Krishnamurthy', dept: 'CSE', year: 'II Year', subject: 'DBMS', code: '23AD2101', type: 'Theory', sections: 2, labLinked: true, submitted: true },
  { faculty: 'Mr. S. Arumugam', dept: 'AI&DS', year: 'II Year', subject: 'OOP', code: '23AD2103', type: 'Theory', sections: 1, labLinked: true, submitted: false },
  { faculty: 'Dr. V. Lakshmi', dept: 'CSE', year: 'III Year', subject: 'NLP ★', code: '23AD3201', type: 'Theory ★', sections: 1, labLinked: true, submitted: true },
  { faculty: 'Ms. T. Deepika', dept: 'AI&DS', year: 'I Year', subject: 'Programming Fund.', code: '23AD1101', type: 'Theory', sections: 2, labLinked: true, submitted: false },
  { faculty: 'Ms. T. Deepika', dept: 'AI&DS', year: 'I Year', subject: 'Programming Lab', code: '23AD1L01', type: 'Lab', sections: 2, labLinked: false, submitted: false },
  { faculty: 'Dr. K. Ramesh', dept: 'CSE', year: 'III Year', subject: 'Data Mining ★', code: '23AD3103', type: 'Theory ★', sections: 1, labLinked: true, submitted: true },
]

function FacultyPreferencesPanel() {
  const chevronDown = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
  const selectStyle = { backgroundImage: chevronDown, backgroundRepeat: 'no-repeat' as const, backgroundPosition: 'right 8px center' }
  const selectCls = "border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 appearance-none cursor-pointer pr-7"

  const [acYear, setAcYear] = useState('2026–2027')
  const [sem, setSem] = useState('Odd')
  const [year, setYear] = useState('All Years')
  const [type, setType] = useState('All')
  const [faculty, setFaculty] = useState('All Faculty')

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 mt-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-700 text-sm text-slate-700">Faculty Subject Preferences — Opted Subjects</h3>
          <p className="text-xs text-slate-400 mt-0.5">All faculty subject option selections for the selected academic period</p>
        </div>
        <button className="px-3 py-1.5 bg-[#0F4C81] text-white text-xs font-600 rounded-lg hover:bg-[#0a3860] transition">Export CSV</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-slate-100">
        <select value={acYear} onChange={e => setAcYear(e.target.value)} className={selectCls} style={selectStyle}>
          {['2024–2025', '2025–2026', '2026–2027', '2027–2028'].map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={sem} onChange={e => setSem(e.target.value)} className={selectCls} style={selectStyle}>
          <option>Odd</option>
          <option>Even</option>
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} className={selectCls} style={selectStyle}>
          <option>All Years</option>
          <option>IV Year</option>
          <option>III Year</option>
          <option>II Year</option>
          <option>I Year</option>
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className={selectCls} style={selectStyle}>
          <option>All</option>
          <option>Theory</option>
          <option>Lab</option>
        </select>
        <select value={faculty} onChange={e => setFaculty(e.target.value)} className={selectCls} style={selectStyle}>
          <option>All Faculty</option>
          <option>Dr. J. Suganya Devi</option>
          <option>Dr. R. Krishnamurthy</option>
          <option>Mr. S. Arumugam</option>
          <option>Dr. V. Lakshmi</option>
          <option>Ms. T. Deepika</option>
          <option>Dr. K. Ramesh</option>
        </select>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: 'Total Faculty', value: '142', color: '#0F4C81' },
          { label: 'Submitted', value: '68', color: '#10b981' },
          { label: 'Theory Prefs', value: '248', color: '#6366f1' },
          { label: 'Lab Requirements', value: '64', color: '#0d9488' },
          { label: 'Pending', value: '74', color: '#ef4444' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border" style={{ borderColor: s.color + '40', background: s.color + '0d' }}>
            <span className="text-sm font-800" style={{ color: s.color }}>{s.value}</span>
            <span className="text-xs text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Faculty', 'Dept', 'Year', 'Subject', 'Code', 'Type', 'Sections', 'Lab Linked', 'Status'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-700 text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {prefRows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/60 transition">
                <td className="px-3 py-2.5 font-600 text-slate-700 whitespace-nowrap">{row.faculty}</td>
                <td className="px-3 py-2.5 text-slate-500">{row.dept}</td>
                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.year}</td>
                <td className="px-3 py-2.5 font-500 text-slate-700">{row.subject}</td>
                <td className="px-3 py-2.5 font-mono text-slate-400">{row.code}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full font-600 text-xs ${row.type.includes('Lab') ? 'bg-teal-50 text-teal-700' : row.type.includes('★') ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                    {row.type}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center font-700 text-[#0F4C81]">{row.sections}</td>
                <td className="px-3 py-2.5 text-center">{row.labLinked ? '🧪 Yes' : '—'}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full font-600 text-xs ${row.submitted ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {row.submitted ? '✓ Submitted' : '⏳ Draft'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Reports({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div>
      <PageHeader title="Reports & Analytics" desc="Workload distribution, utilization, and scheduling insights">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-500 text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn>Download Report</Btn>
      </PageHeader>

      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Faculty Workload */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="font-display font-700 text-sm text-slate-700 mb-4">Faculty Workload (hrs/week)</h3>
          <BarChart color="#0F4C81" data={[
            { label: 'Dr. R. Krishnamurthy', value: 18, max: 24 },
            { label: 'Dr. M. Priya', value: 16, max: 24 },
            { label: 'Mr. S. Arumugam', value: 20, max: 24 },
            { label: 'Dr. V. Lakshmi', value: 14, max: 24 },
            { label: 'Ms. T. Deepika', value: 12, max: 24 },
            { label: 'Dr. K. Ramesh', value: 16, max: 24 },
          ]} />
        </div>

        {/* Free Period Analysis — Faculty */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="font-display font-700 text-sm text-slate-700 mb-4">Free Period Analysis — Faculty (per week)</h3>
          <BarChart color="#f59e0b" data={[
            { label: 'Dr. R. Krishnamurthy', value: 6, max: 10 },
            { label: 'Dr. M. Priya', value: 8, max: 10 },
            { label: 'Mr. S. Arumugam', value: 4, max: 10 },
            { label: 'Dr. V. Lakshmi', value: 10, max: 10 },
            { label: 'Ms. T. Deepika', value: 8, max: 10 },
            { label: 'Dr. K. Ramesh', value: 8, max: 10 },
          ]} />
        </div>

      </div>

      {/* Faculty Subject Preferences — full width */}
      <FacultyPreferencesPanel />
    </div>
  )
}
