import { useState } from 'react'
import { PageHeader, Btn, Section, Field } from './ui'
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

export function UploadCurriculum({ navigate }: { navigate: (p: Page) => void }) {
  const [uploaded, setUploaded] = useState(false)
  const [progress, setProgress] = useState(0)

  const simulate = () => {
    setProgress(0)
    setUploaded(false)
    let p = 0
    const interval = setInterval(() => {
      p += 10
      setProgress(p)
      if (p >= 100) { clearInterval(interval); setUploaded(true) }
    }, 200)
  }

  return (
    <div>
      <PageHeader title="Upload Curriculum" desc="Import curriculum from PDF or Excel files">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <div className="max-w-2xl mx-auto space-y-6">
        <div
          onClick={simulate}
          className="border-2 border-dashed border-[#0F4C81]/30 rounded-2xl p-16 text-center cursor-pointer hover:border-[#0F4C81]/60 hover:bg-blue-50/30 transition-all group"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-100 transition">
            <svg className="w-8 h-8 text-[#0F4C81]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="font-display font-700 text-lg text-[#0F4C81]">Drag & Drop your file here</p>
          <p className="text-slate-400 text-sm mt-1">or click to browse files</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            {['PDF', 'Excel (.xlsx)'].map(fmt => (
              <span key={fmt} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-500 text-slate-600 shadow-sm">{fmt}</span>
            ))}
          </div>
        </div>

        {(progress > 0 || uploaded) && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-500 text-sm text-slate-800">CSE_Curriculum_Sem5_2024.xlsx</p>
                <p className="text-xs text-slate-400">142 KB</p>
              </div>
              <span className="text-xs font-500 text-green-600">{progress}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#0F4C81] rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
            {uploaded && (
              <>
                <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg px-4 py-2.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-500">Curriculum uploaded successfully! 24 subjects extracted.</span>
                </div>
                <div>
                  <p className="text-xs font-600 text-slate-500 uppercase tracking-wider mb-3">Extracted Subjects Preview</p>
                  <div className="rounded-lg overflow-hidden border border-slate-100">
                    {['CS5001 — Data Structures & Algorithms — 4 credits', 'CS5002 — Database Management Systems — 4 credits', 'CS5003 — DBMS Laboratory — 2 credits', 'CS5004 — Computer Networks — 4 credits'].map((s, i) => (
                      <div key={i} className={`px-4 py-2.5 text-sm text-slate-700 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>{s}</div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function UploadWorkload({ navigate }: { navigate: (p: Page) => void }) {
  const [uploaded, setUploaded] = useState(false)

  return (
    <div>
      <PageHeader title="Upload Faculty Workload" desc="Import faculty workload assignments from Excel">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <div className="max-w-2xl mx-auto space-y-5">
        <div
          onClick={() => setUploaded(true)}
          className="border-2 border-dashed border-[#0F4C81]/30 rounded-2xl p-16 text-center cursor-pointer hover:border-[#0F4C81]/60 hover:bg-blue-50/30 transition-all group"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-100 transition">
            <svg className="w-8 h-8 text-[#0F4C81]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="font-display font-700 text-lg text-[#0F4C81]">Upload Faculty Workload Excel</p>
          <p className="text-slate-400 text-sm mt-1">Supports .xlsx format only</p>
        </div>

        {uploaded && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-green-50 border-b border-green-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-500 text-green-700">38 records validated and ready to import</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f8faff] border-b border-slate-100">
                  {['Faculty ID', 'Faculty Name', 'Subject', 'Hrs/Week', 'Semester', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-600 text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { id: 'FAC001', name: 'Dr. R. Krishnamurthy', subj: 'Data Structures', hrs: 4, sem: 5, ok: true },
                  { id: 'FAC002', name: 'Dr. M. Priya', subj: 'Digital Signal Processing', hrs: 4, sem: 5, ok: true },
                  { id: 'FAC003', name: 'Mr. S. Arumugam', subj: 'Power Systems', hrs: 4, sem: 5, ok: false },
                ].map((r, i) => (
                  <tr key={i} className={`border-b border-slate-50 ${!r.ok ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.id}</td>
                    <td className="px-4 py-2.5 font-500 text-slate-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.subj}</td>
                    <td className="px-4 py-2.5 text-center">{r.hrs}</td>
                    <td className="px-4 py-2.5 text-center">Sem {r.sem}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-500 ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                        {r.ok ? '✓ Valid' : '⚠ Conflict'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <Btn variant="secondary">Cancel</Btn>
              <Btn>Import All Valid Records</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ConstraintManagement({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div>
      <PageHeader title="Constraint Management" desc="Configure scheduling rules and restrictions">
        <BackBtn navigate={navigate} />
      </PageHeader>

      <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Section title="Faculty Constraints">
          <Field label="Maximum Periods per Day" type="number" defaultValue={6} />
          <Field label="Maximum Continuous Classes" type="number" defaultValue={3} />
          <div>
            <label className="block text-xs font-500 text-slate-500 mb-1">Unavailable Slots</label>
            <textarea
              defaultValue="Monday 1st period, Friday 6th period"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              rows={3}
            />
          </div>
        </Section>

        <Section title="Lab Constraints">
          <Field label="Continuous Lab Periods" type="number" defaultValue={3} />
          <div>
            <label className="block text-xs font-500 text-slate-500 mb-1">Preferred Lab Rooms</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              {['Lab Block A — R101', 'Lab Block A — R102', 'Lab Block B — R201'].map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-500 text-slate-500 mb-1">Lab Day Preference</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <label key={d} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" defaultChecked={['Tue', 'Thu'].includes(d)} className="accent-[#0F4C81]" />
                  <span className="text-sm text-slate-600">{d}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <Section title="College Constraints">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div>
            <label className="block text-xs font-500 text-slate-500 mb-1">Working Days</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <label key={d} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" defaultChecked className="accent-[#0F4C81]" />
                  <span className="text-sm text-slate-600">{d}</span>
                </label>
              ))}
            </div>
          </div>
          <Field label="Periods Per Day" type="number" defaultValue={8} />
          <Field label="Lunch Break (Period No.)" type="number" defaultValue={5} />
          <Field label="Lunch Duration (minutes)" type="number" defaultValue={45} />
          <Field label="Assembly Hour (Day)" defaultValue="Monday" />
          <Field label="Meeting Hour (Day & Period)" defaultValue="Friday, Period 8" />
        </div>
      </Section>

      <div className="flex justify-end mt-5 gap-3">
        <Btn variant="secondary">Reset to Defaults</Btn>
        <Btn>Save Constraints</Btn>
      </div>
    </div>
  )
}
