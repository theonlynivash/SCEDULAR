import { useEffect, useRef, useState } from 'react'
import { PageHeader, Btn, Section, GlassPanel, Chip } from './ui'
import type { Page } from '../types'
import { api, type ScheduleConfig, type ImportDiagnostic, type MasterImportPreview, type MasterImportCommitResult } from '../api'

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

function DiagnosticList({ title, items, tone }: { title: string; items: ImportDiagnostic[]; tone: 'error' | 'warning' }) {
  if (!items.length) return null
  const box = tone === 'error' ? 'bg-rose-400/10 border-rose-300/40' : 'bg-amber-400/10 border-amber-300/40'
  const text = tone === 'error' ? 'text-rose-700' : 'text-amber-700'
  return (
    <div className={`rounded-2xl border ${box} overflow-hidden`}>
      <div className={`px-4 py-3 font-700 text-sm ${text}`}>{title} · {items.length}</div>
      <div className="divide-y divide-white/50 max-h-80 overflow-auto">
        {items.map((item, index) => (
          <div key={`${item.code}-${item.sheet}-${item.row}-${index}`} className="px-4 py-3 text-xs">
            <div className={`font-mono font-700 ${text}`}>{item.code}</div>
            <div className="text-slate-700 mt-1">{item.message}</div>
            <div className="text-slate-400 mt-1">
              {[item.sheet && `Sheet: ${item.sheet}`, item.row && `Row: ${item.row}`, item.field && `Field: ${item.field}`].filter(Boolean).join(' · ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ImportSummary({ summary }: { summary: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {Object.entries(summary).map(([key, value]) => (
        <div key={key} className="rounded-xl bg-white/45 border border-white/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-700">{key}</div>
          <div className="text-lg font-800 text-slate-800">{value}</div>
        </div>
      ))}
    </div>
  )
}

export function UploadCurriculum({ navigate }: { navigate: (p: Page) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<MasterImportPreview | null>(null)
  const [committed, setCommitted] = useState<MasterImportCommitResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  async function resetAllData() {
    if (!confirm('Are you sure you want to clear all imported database state and reset to a clean slate?')) return
    setResetting(true)
    setResetMsg(null)
    try {
      await api.importMaster.reset()
      setFile(null)
      setPreview(null)
      setCommitted(null)
      setResetMsg('✓ All data wiped clean. Ready for your fresh Excel upload!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  async function previewFile(nextFile: File) {
    setFile(nextFile)
    setPreview(null)
    setCommitted(null)
    setError(null)
    setResetMsg(null)
    setBusy(true)
    try {
      setPreview(await api.importMaster.preview(nextFile))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (!file || !preview?.valid) return
    setBusy(true)
    setError(null)
    try {
      setCommitted(await api.importMaster.commit(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Master Excel Import" desc="Load the complete SCEDULAR dataset in one validated workbook">
        <BackBtn navigate={navigate} />
      </PageHeader>

      <div className="max-w-4xl mx-auto space-y-5">
        <GlassPanel className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-700 text-slate-800">One workbook · purpose-specific sheets</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">Required: SECTIONS, SUBJECTS, SECTION_SUBJECTS, FACULTY, TEACHING_ASSIGNMENTS, LABS and LAB_MAPPING. Optional: FACULTY_UNAVAILABILITY and SETTINGS.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetAllData}
                disabled={resetting || busy}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-700 text-rose-700 bg-rose-400/15 border border-rose-300/40 hover:bg-rose-400/25 transition disabled:opacity-50"
              >
                {resetting ? 'Resetting…' : 'Clear / Reset All Data'}
              </button>
              <a href="/scedular_master_template.xlsx" download className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-700 text-[#0e254f] bg-white/70 border border-white/80 hover:bg-white transition">
                Download Master Template
              </a>
            </div>
          </div>
        </GlassPanel>

        {resetMsg && <div className="bg-emerald-400/15 border border-emerald-300/40 text-emerald-800 font-600 text-sm rounded-xl px-4 py-3">{resetMsg}</div>}

        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && previewFile(e.target.files[0])} />
        <div
          onClick={() => inputRef.current?.click()}
          className="glass rounded-3xl p-14 text-center cursor-pointer hover:bg-white/55 transition-all group border-2 border-dashed border-white/60"
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-[#0e254f]/20 to-[#f3c326]/20 group-hover:from-[#0e254f]/30 group-hover:to-[#f3c326]/30 transition">
            <svg className="w-8 h-8 text-[#0e254f]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          </div>
          <p className="font-display font-700 text-lg text-slate-800">{file?.name ?? 'Upload Master Excel workbook'}</p>
          <p className="text-slate-500 text-sm mt-1">Upload first → SCEDULAR validates it before changing any database state.</p>
          <div className="flex items-center justify-center gap-2 mt-4"><Chip>.xlsx</Chip><Chip>.xls</Chip></div>
        </div>

        {busy && <p className="text-sm text-slate-500 text-center">{preview ? 'Importing validated dataset…' : 'Parsing, normalizing and validating workbook…'}</p>}
        {error && <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>}

        {preview && (
          <GlassPanel className="p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider font-700 text-slate-500">Import Preview</p>
                <h2 className={`font-display font-800 text-xl mt-1 ${preview.valid ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {preview.valid ? 'Workbook is ready to import' : 'Import blocked — fix the workbook'}
                </h2>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-800 ${preview.valid ? 'bg-emerald-400/15 text-emerald-700' : 'bg-rose-400/15 text-rose-700'}`}>
                {preview.valid ? 'VALID' : 'ERRORS'}
              </span>
            </div>
            <ImportSummary summary={preview.summary} />
            <DiagnosticList title="Errors" items={preview.errors} tone="error" />
            <DiagnosticList title="Warnings" items={preview.warnings} tone="warning" />
            {preview.valid && !committed && (
              <div className="flex justify-end gap-2 pt-2 border-t border-white/50">
                <Btn variant="secondary" onClick={() => { setFile(null); setPreview(null); if (inputRef.current) inputRef.current.value = '' }}>Choose Another</Btn>
                <Btn onClick={commit} disabled={busy}>Confirm & Import</Btn>
              </div>
            )}
            {committed && (
              <div className="rounded-2xl bg-emerald-400/10 border border-emerald-300/40 p-4">
                <p className="font-700 text-emerald-700">✓ Dataset imported successfully.</p>
                <p className="text-xs text-slate-500 mt-1">The canonical dataset is now ready for timetable generation.</p>
                <div className="flex justify-end gap-2 mt-3"><Btn variant="secondary" onClick={() => navigate('data-hub')}>Data Hub</Btn><Btn onClick={() => navigate('generate')}>Generate Timetable →</Btn></div>
              </div>
            )}
          </GlassPanel>
        )}
      </div>
    </div>
  )
}

export function UploadWorkload({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div>
      <PageHeader title="Faculty Workload Import" desc="Legacy import retained for compatibility. Use Master Excel Import for new datasets.">
        <BackBtn navigate={navigate} />
      </PageHeader>
      <GlassPanel className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-slate-600 leading-relaxed">The new scheduling model separates subjects, section requirements and teaching assignments. For reliable generation, upload the complete master workbook instead of importing workload rows independently.</p>
        <div className="flex justify-end mt-5"><Btn onClick={() => navigate('upload-curriculum')}>Open Master Excel Import →</Btn></div>
      </GlassPanel>
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
