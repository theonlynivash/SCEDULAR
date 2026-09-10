import { useState } from 'react'
import { PageHeader, Btn } from './ui'
import type { Page } from '../types'

const facultyData = [
  { id: 'FAC001', name: 'Dr. R. Krishnamurthy', designation: 'Professor', experience: '18 yrs', subjects: 'Data Structures, DBMS', capacity: 60, workload: 18, email: 'krishna@pec.edu', phone: '9876543210', status: 'Active' },
  { id: 'FAC002', name: 'Dr. M. Priya', designation: 'Assoc. Professor', experience: '12 yrs', subjects: 'Signals, VLSI', capacity: 55, workload: 16, email: 'mpriya@pec.edu', phone: '9876543211', status: 'Active' },
  { id: 'FAC003', name: 'Mr. S. Arumugam', designation: 'Asst. Professor', experience: '6 yrs', subjects: 'Power Systems', capacity: 50, workload: 20, email: 'arumugam@pec.edu', phone: '9876543212', status: 'Active' },
  { id: 'FAC004', name: 'Dr. V. Lakshmi', designation: 'Professor', experience: '22 yrs', subjects: 'Thermodynamics, FM', capacity: 65, workload: 14, email: 'vlakshmi@pec.edu', phone: '9876543213', status: 'Active' },
  { id: 'FAC005', name: 'Ms. T. Deepika', designation: 'Asst. Professor', experience: '4 yrs', subjects: 'OS, Networks', capacity: 50, workload: 20, email: 'deepika@pec.edu', phone: '9876543214', status: 'On Leave' },
  { id: 'FAC006', name: 'Dr. K. Ramesh', designation: 'Assoc. Professor', experience: '14 yrs', subjects: 'Structural Analysis', capacity: 55, workload: 16, email: 'kramesh@pec.edu', phone: '9876543215', status: 'Active' },
]

export default function FacultyManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filtered = facultyData.filter(
    f => f.name.toLowerCase().includes(search.toLowerCase()) || f.id.includes(search)
  )

  return (
    <div className="relative">
      <PageHeader title="Faculty Management" desc="Manage faculty profiles and workload assignments">
        {/* Back button */}
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-500 text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn variant="outline" onClick={() => {}}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Import Excel
        </Btn>
        <Btn variant="secondary">Export</Btn>
        <Btn onClick={() => setDrawerOpen(true)}>+ Add Faculty</Btn>
      </PageHeader>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or ID…"
          className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-[#f8faff]">
              {['Faculty ID', 'Name', 'Designation', 'Experience', 'Subjects', 'Max Workload', 'Email', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-600 text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((f, i) => (
              <tr key={f.id} className={`border-b border-slate-50 hover:bg-blue-50/30 transition ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.id}</td>
                <td className="px-4 py-3 font-500 text-slate-800">{f.name}</td>
                <td className="px-4 py-3 text-slate-600">{f.designation}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{f.experience}</td>
                <td className="px-4 py-3 text-slate-500 max-w-28 truncate">{f.subjects}</td>
                <td className="px-4 py-3 text-center font-mono text-xs">{f.workload} hrs</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{f.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-500 ${f.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    {f.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button className="p-1 hover:bg-blue-50 rounded text-blue-600 transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button className="p-1 hover:bg-slate-100 rounded text-slate-500 transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600 transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">Showing {filtered.length} of {facultyData.length} faculty</p>
          <div className="flex gap-1">
            {[1, 2, 3].map(n => (
              <button key={n} className={`w-7 h-7 rounded text-xs font-500 transition ${n === 1 ? 'bg-[#0F4C81] text-white' : 'hover:bg-slate-100 text-slate-600'}`}>{n}</button>
            ))}
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-96 bg-white shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="font-display font-700 text-[#0F4C81]">Add Faculty</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-slate-100 rounded transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {['Faculty ID', 'Faculty Name', 'Department', 'Designation', 'Experience', 'Email', 'Phone Number', 'Subjects Handling', 'Capacity', 'Maximum Workload', 'Unavailable Slots', 'Remarks'].map(field => (
                <div key={field}>
                  <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">{field}</label>
                  {field === 'Remarks' || field === 'Unavailable Slots' ? (
                    <textarea rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
                  ) : (
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  )}
                </div>
              ))}
              <button className="w-full bg-[#0F4C81] text-white py-2.5 rounded-lg font-600 text-sm hover:bg-[#0a3860] transition mt-2">
                Save Faculty
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
