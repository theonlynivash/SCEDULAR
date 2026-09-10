import { useState } from 'react'
import { PageHeader, Btn } from './ui'
import type { Page } from '../types'

const subjectData = [
  { code: 'CS3001', name: 'Data Structures & Algorithms', credits: 4, hpw: 4, type: 'Theory', sem: 3 },
  { code: 'CS3002', name: 'Database Management Systems', credits: 4, hpw: 4, type: 'Theory', sem: 3 },
  { code: 'CS4001', name: 'Operating Systems', credits: 4, hpw: 4, type: 'Theory', sem: 4 },
  { code: 'CS4002', name: 'Computer Networks', credits: 3, hpw: 3, type: 'Theory', sem: 4 },
  { code: 'CS4003', name: 'Networks Laboratory', credits: 2, hpw: 4, type: 'Lab', sem: 4 },
  { code: 'CS5001', name: 'Compiler Design', credits: 4, hpw: 4, type: 'Theory', sem: 5 },
  { code: 'CS5002', name: 'Software Engineering', credits: 3, hpw: 3, type: 'Theory', sem: 5 },
  { code: 'CS5003', name: 'DBMS Laboratory', credits: 2, hpw: 4, type: 'Lab', sem: 5 },
  { code: 'CS6001', name: 'Machine Learning', credits: 4, hpw: 4, type: 'Theory', sem: 6 },
  { code: 'CS6002', name: 'Cloud Computing', credits: 3, hpw: 3, type: 'Theory', sem: 6 },
  { code: 'CS7001', name: 'Distributed Systems', credits: 4, hpw: 4, type: 'Theory', sem: 7 },
  { code: 'CS8001', name: 'Project Work', credits: 6, hpw: 12, type: 'Lab', sem: 8 },
]

const semesters = [1, 2, 3, 4, 5, 6, 7, 8]

export default function SubjectManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [selectedSem, setSelectedSem] = useState<number | null>(null)

  const filtered = selectedSem === null ? subjectData : subjectData.filter(s => s.sem === selectedSem)

  return (
    <div>
      <PageHeader title="Subject Management" desc="Manage subjects, credits, and scheduling hours">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-500 text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn variant="outline">Import Curriculum</Btn>
        <Btn variant="secondary">Export</Btn>
        <Btn>+ Add Subject</Btn>
      </PageHeader>

      {/* Semester filter pills */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-600 text-slate-500 uppercase tracking-wider mr-1">Semester:</span>
          <button
            onClick={() => setSelectedSem(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-600 transition border ${
              selectedSem === null
                ? 'bg-[#0F4C81] text-white border-[#0F4C81]'
                : 'text-slate-600 border-slate-200 hover:border-[#0F4C81] hover:text-[#0F4C81]'
            }`}
          >
            All
          </button>
          {semesters.map(sem => (
            <button
              key={sem}
              onClick={() => setSelectedSem(selectedSem === sem ? null : sem)}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 transition border ${
                selectedSem === sem
                  ? 'bg-[#0F4C81] text-white border-[#0F4C81]'
                  : 'text-slate-600 border-slate-200 hover:border-[#0F4C81] hover:text-[#0F4C81]'
              }`}
            >
              Sem {sem}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f8faff] border-b border-slate-100">
              {['Subject Code', 'Subject Name', 'Credits', 'Hours/Week', 'Type', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-600 text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={s.code} className={`border-b border-slate-50 hover:bg-blue-50/30 transition ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.code}</td>
                <td className="px-4 py-3 font-500 text-slate-800">{s.name}</td>
                <td className="px-4 py-3 text-center">{s.credits}</td>
                <td className="px-4 py-3 text-center">{s.hpw}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-500 ${s.type === 'Theory' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                    {s.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button className="p-1 hover:bg-blue-50 rounded text-blue-600 transition text-xs font-500">Edit</button>
                    <button className="p-1 hover:bg-red-50 rounded text-red-400 transition text-xs font-500">Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                  No subjects found for Semester {selectedSem}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">Showing {filtered.length} subject{filtered.length !== 1 ? 's' : ''}{selectedSem ? ` for Semester ${selectedSem}` : ''}</p>
        </div>
      </div>
    </div>
  )
}
