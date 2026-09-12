import { useEffect, useRef, useState } from 'react'
import { PageHeader, Btn, Section } from './ui'
import type { Page } from '../types'
import { api, type ScheduleConfig } from '../api'

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

interface WorkloadImportResult {
  totalRows: number
  imported: number
  rejected: number
  rejectedRows: { row: number; issues: unknown }[]
}

export function UploadWorkload({ navigate }: { navigate: (p: Page) => void }) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<WorkloadImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setFileName(file.name)
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.importFacultyWorkload(file)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <PageHeader title="Upload Faculty Workload" desc="Import faculty workload assignments from Excel">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <div className="max-w-2xl mx-auto space-y-5">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-[#0F4C81]/30 rounded-2xl p-16 text-center cursor-pointer hover:border-[#0F4C81]/60 hover:bg-blue-50/30 transition-all group"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-100 transition">
            <svg className="w-8 h-8 text-[#0F4C81]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="font-display font-700 text-lg text-[#0F4C81]">
            {fileName ? fileName : 'Upload Faculty Workload Excel'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Columns: FacultyId, FacultyName, Designation, CourseId, SectionId, WeeklyTheoryPeriods, WeeklyLabPeriods, MaxDailyPeriods, MaxWeeklyPeriods
          </p>
        </div>

        {uploading && <p className="text-sm text-slate-500 text-center">Uploading and validating…</p>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>}

        {result && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className={`px-5 py-3 border-b flex items-center gap-2 ${result.rejected === 0 ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
              <svg className={`w-4 h-4 ${result.rejected === 0 ? 'text-green-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className={`text-sm font-500 ${result.rejected === 0 ? 'text-green-700' : 'text-amber-700'}`}>
                {result.imported} of {result.totalRows} rows imported{result.rejected > 0 ? `, ${result.rejected} rejected` : ''}
              </span>
            </div>
            {result.rejectedRows.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8faff] border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-xs font-600 text-slate-500 uppercase tracking-wider">Row</th>
                    <th className="text-left px-4 py-2.5 text-xs font-600 text-slate-500 uppercase tracking-wider">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rejectedRows.map(r => (
                    <tr key={r.row} className="border-b border-slate-50 bg-red-50/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 align-top">{r.row}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs font-mono whitespace-pre-wrap">{JSON.stringify(r.issues, null, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => navigate('faculty')}>View Faculty</Btn>
              <Btn onClick={() => navigate('generate')}>Continue to Generate →</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export function ConstraintManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [config, setConfig] = useState<ScheduleConfig | null>(null)
  const [workingDays, setWorkingDays] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.config
      .get()
      .then(c => {
        setConfig(c)
        setWorkingDays(c.workingDays)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load schedule config'))
      .finally(() => setLoading(false))
  }, [])

  function toggleDay(day: string) {
    setSaved(false)
    setWorkingDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.config.update({ ...config, workingDays })
      setConfig(updated)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save constraints')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Constraint Management" desc="Configure the department-wide schedule grid; per-faculty limits live on Faculty Management, per-course lab block length on Subject Management">
        <BackBtn navigate={navigate} />
      </PageHeader>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">{error}</div>}
      {loading && <p className="text-sm text-slate-400">Loading schedule configuration…</p>}

      {config && (
        <>
          <Section title="College Constraints">
            <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 2fr' }}>
              <div>
                <label className="block text-xs font-500 text-slate-500 mb-1">Working Days</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ALL_DAYS.map(d => (
                    <label key={d} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={workingDays.includes(d)} onChange={() => toggleDay(d)} className="accent-[#0F4C81]" />
                      <span className="text-sm text-slate-600">{d}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-500 text-slate-500 mb-1">Period Grid (BREAK/LUNCH are the gaps between periods)</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {config.periods.map(p => (
                    <span key={p.index} className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-50 border border-slate-200 text-slate-600">
                      {p.label} {p.start}–{p.end}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <div className="flex justify-end mt-5 gap-3 items-center">
            {saved && <span className="text-sm text-green-600">Saved.</span>}
            <Btn onClick={handleSave}>{saving ? 'Saving…' : 'Save Constraints'}</Btn>
          </div>
        </>
      )}
    </div>
  )
}
