import { useEffect, useRef, useState } from 'react'
import { PageHeader, Btn, Section, GlassPanel, Chip } from './ui'
import type { Page } from '../types'
import { api, type ScheduleConfig } from '../api'

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

interface CurriculumImportResult {
  totalRows: number
  imported: number
  rejected: number
  rejectedRows: { row: number; issues: unknown }[]
}

export function UploadCurriculum({ navigate }: { navigate: (p: Page) => void }) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<CurriculumImportResult | null>(null)
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
      <PageHeader title="Upload Curriculum">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <div className="max-w-2xl mx-auto space-y-6">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div
          onClick={() => inputRef.current?.click()}
          className="glass rounded-3xl p-16 text-center cursor-pointer hover:bg-white/55 transition-all group border-2 border-dashed border-white/60"
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-[#0e254f]/20 to-[#f3c326]/20 group-hover:from-[#0e254f]/30 group-hover:to-[#f3c326]/30 transition">
            <svg className="w-8 h-8 text-[#0e254f]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="font-display font-700 text-lg text-slate-800">{fileName ?? 'Drag & Drop your file here'}</p>
          <p className="text-slate-500 text-sm mt-1">or click to browse files</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            {['.xlsx', '.xls', '.csv'].map(fmt => <Chip key={fmt}>{fmt}</Chip>)}
          </div>
        </div>

        {uploading && <p className="text-sm text-slate-500 text-center">Uploading and validating…</p>}
        {error && <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}

        {result && (
          <GlassPanel className="overflow-hidden">
            <div className={`px-5 py-3 flex items-center gap-2 ${result.rejected === 0 ? 'bg-emerald-400/15' : 'bg-amber-400/15'}`}>
              <span className={`text-sm font-500 ${result.rejected === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {result.imported} of {result.totalRows} rows imported{result.rejected > 0 ? `, ${result.rejected} rejected` : ''}
              </span>
            </div>
            {result.rejectedRows.length > 0 && (
              <table className="tbl text-sm">
                <tbody>
                  {result.rejectedRows.map(r => (
                    <tr key={r.row}>
                      <td className="border border-slate-300/50 px-4 py-2.5 font-mono text-xs text-slate-500 align-top whitespace-nowrap">Row {r.row}</td>
                      <td className="border border-slate-300/50 px-4 py-2.5 text-slate-600 text-xs font-mono whitespace-pre-wrap">{JSON.stringify(r.issues)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-5 py-3 flex justify-end gap-2 border-t border-white/40">
              <Btn onClick={() => navigate('subjects')}>Review in Subject Management →</Btn>
            </div>
          </GlassPanel>
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
      <PageHeader title="Upload Faculty Workload" desc="Superseded by the Data & Import Hub, kept here for direct links">
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
          className="glass rounded-3xl p-16 text-center cursor-pointer hover:bg-white/55 transition-all group border-2 border-dashed border-white/60"
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-[#0e254f]/20 to-[#f3c326]/20 group-hover:from-[#0e254f]/30 group-hover:to-[#f3c326]/30 transition">
            <svg className="w-8 h-8 text-[#0e254f]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="font-display font-700 text-lg text-slate-800">
            {fileName ? fileName : 'Upload Faculty Workload Excel'}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            See the Data & Import Hub for the full column reference and a downloadable template.
          </p>
        </div>

        {uploading && <p className="text-sm text-slate-500 text-center">Uploading and validating…</p>}
        {error && <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}

        {result && (
          <GlassPanel className="overflow-hidden">
            <div className={`px-5 py-3 flex items-center gap-2 ${result.rejected === 0 ? 'bg-emerald-400/15' : 'bg-amber-400/15'}`}>
              <span className={`text-sm font-500 ${result.rejected === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {result.imported} of {result.totalRows} rows imported{result.rejected > 0 ? `, ${result.rejected} rejected` : ''}
              </span>
            </div>
            <div className="px-5 py-3 flex justify-end gap-2 border-t border-white/40">
              <Btn variant="secondary" onClick={() => navigate('faculty')}>View Faculty</Btn>
              <Btn onClick={() => navigate('generate')}>Continue to Generate →</Btn>
            </div>
          </GlassPanel>
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
      <PageHeader title="Constraint Management" desc="Department-wide schedule grid; per-faculty limits live on Faculty Management, per-course lab block length on Subject Management">
        <BackBtn navigate={navigate} />
      </PageHeader>

      {error && <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>}
      {loading && <p className="text-sm text-slate-400">Loading schedule configuration…</p>}

      {config && (
        <>
          <Section title="College Constraints">
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1.5">Working Days</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ALL_DAYS.map(d => (
                    <label key={d} className="flex items-center gap-1.5 cursor-pointer glass-pill rounded-full px-2.5 py-1">
                      <input type="checkbox" checked={workingDays.includes(d)} onChange={() => toggleDay(d)} className="accent-[#0e254f]" />
                      <span className="text-sm text-slate-600">{d}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1.5">Period Grid (BREAK/LUNCH are the gaps between periods)</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {config.periods.map(p => (
                    <span key={p.index} className="px-2.5 py-1 rounded-lg text-xs font-mono glass-pill text-slate-600">
                      {p.label} {p.start}–{p.end}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <div className="flex justify-end mt-5 gap-3 items-center">
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
            <Btn onClick={handleSave}>{saving ? 'Saving…' : 'Save Constraints'}</Btn>
          </div>
        </>
      )}
    </div>
  )
}
