import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AcademicCycle } from '../academicCycle'
import { ShieldCheck, Bot, Info, Plus, Trash2 } from 'lucide-react'
import type { Page } from '../types'
import SetupOverviewTab from './SetupOverviewTab'
import SetupSyllabusTab from './SetupSyllabusTab'
import SetupDatasetTab from './SetupDatasetTab'
import SetupInchargeTab from './SetupInchargeTab'
import SetupImportTab from './SetupImportTab'
import SetupLabsTab from './SetupLabsTab'
import SetupAppearanceTab from './SetupAppearanceTab'
import { PillTabs } from './ui'

interface AllocationBand {
  id: string
  name: string
  minExperience: number
  maxExperience: number | null
  eligibleYears: string[]
  maxTotalPreferences: number
  maxPreferencesPerYear: number
}

interface AllocationConfig {
  seniorThreshold: number
  bands: AllocationBand[]
  subjectMinExperienceRules?: Record<string, number>
  facultyAiEnabled?: boolean
  avgSectionsPerTeacher?: number
  maxWeeklyPeriods?: number
}

const ALL_YEARS = ['Year 1', 'Year 2', 'Year 3', 'Year 4']

function PolicyAndCycle() {
  const [config, setConfig] = useState<AllocationConfig | null>(null)
  const [cycle, setCycle] = useState<AcademicCycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)


  const [pendingCycle, setPendingCycle] = useState<AcademicCycle | null>(null)
  const [cyclePassword, setCyclePassword] = useState('')
  const [cycleError, setCycleError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [settingsRes, cycleRes] = await Promise.all([
        api.facultyAllocation.getAllocationSettings(),
        api.facultyAllocation.getAcademicCycle(),
      ])
      setConfig(settingsRes.config)
      setCycle(cycleRes.currentCycle)
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const saveConfig = async (next: AllocationConfig) => {
    setSaving(true)
    setNotice(null)
    try {
      const res = await api.facultyAllocation.saveAllocationSettings(next)
      setConfig(res.config)
      setNotice({ type: 'success', message: 'Settings saved.' })
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const updateBand = (idx: number, patch: Partial<AllocationBand>) => {
    if (!config) return
    const bands = config.bands.map((b, i) => (i === idx ? { ...b, ...patch } : b))
    setConfig({ ...config, bands })
  }

  const toggleYear = (idx: number, year: string) => {
    if (!config) return
    const band = config.bands[idx]
    const has = band.eligibleYears.includes(year)
    const eligibleYears = has ? band.eligibleYears.filter(y => y !== year) : [...band.eligibleYears, year]
    updateBand(idx, { eligibleYears })
  }

  const addBand = () => {
    if (!config) return
    const id = `band-${config.bands.length + 1}-${Date.now()}`
    setConfig({
      ...config,
      bands: [...config.bands, { id, name: 'New Band', minExperience: 0, maxExperience: null, eligibleYears: [], maxTotalPreferences: 1, maxPreferencesPerYear: 1 }],
    })
  }

  const removeBand = (idx: number) => {
    if (!config) return
    setConfig({ ...config, bands: config.bands.filter((_, i) => i !== idx) })
  }

  const confirmCycleChange = async () => {
    if (!pendingCycle) return
    setCycleError(null)
    setSaving(true)
    try {
      const res = await api.facultyAllocation.setAcademicCycle(pendingCycle, cyclePassword)
      setCycle(res.currentCycle)
      setNotice({ type: 'success', message: `Academic cycle set to ${res.currentCycle}. Faculty will now only see ${res.currentCycle} semester subjects for preference submission.` })
      setPendingCycle(null)
      setCyclePassword('')
    } catch (err: any) {
      setCycleError(err?.message || 'Incorrect password — cycle was not changed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-sm text-slate-400">Loading settings…</div>
  if (!config) return <div className="p-8 text-center text-sm text-rose-600">Failed to load settings.</div>

  return (
    <div className="space-y-5">
      {notice && (
        <div className={`px-4 py-3 rounded-xl flex items-center justify-between border text-xs font-600 shadow-sm ${notice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700">Dismiss</button>
        </div>
      )}

      {/* 1. Experience Policy */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-700 text-slate-800">Faculty Allocation Experience Policy</h2>
          <button onClick={() => addBand()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-[color:var(--c-600)] border border-blue-200 text-[11px] font-700 hover:bg-blue-100">
            <Plus className="w-3.5 h-3.5" /> Add Band
          </button>
        </div>
        <div className="space-y-3">
          {config.bands.map((band, idx) => (
            <div key={band.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={band.name}
                  onChange={e => updateBand(idx, { name: e.target.value })}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-600 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--c-600)]/20"
                />
                <button onClick={() => removeBand(idx)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <label className="block">
                  <span className="block text-[10px] font-700 text-slate-400 uppercase mb-1">Min Exp (yrs)</span>
                  <input type="number" min={0} value={band.minExperience} onChange={e => updateBand(idx, { minExperience: Number(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-700 text-slate-400 uppercase mb-1">Max Exp (blank = +)</span>
                  <input type="number" min={0} value={band.maxExperience ?? ''} onChange={e => updateBand(idx, { maxExperience: e.target.value === '' ? null : Number(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-700 text-slate-400 uppercase mb-1">Max Total Prefs</span>
                  <input type="number" min={1} value={band.maxTotalPreferences} onChange={e => updateBand(idx, { maxTotalPreferences: Number(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-700 text-slate-400 uppercase mb-1">Max / Year</span>
                  <input type="number" min={1} value={band.maxPreferencesPerYear} onChange={e => updateBand(idx, { maxPreferencesPerYear: Number(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                </label>
              </div>
              <div>
                <span className="block text-[10px] font-700 text-slate-400 uppercase mb-1.5">Eligible Years</span>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_YEARS.map(y => (
                    <button
                      key={y}
                      onClick={() => toggleYear(idx, y)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-600 border transition ${band.eligibleYears.includes(y) ? 'bg-[color:var(--c-600)] text-white border-[color:var(--c-600)]' : 'bg-white text-slate-500 border-slate-200'}`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={() => saveConfig(config)} disabled={saving} className="px-5 py-2 rounded-lg bg-[color:var(--c-600)] text-white font-600 text-xs shadow-sm hover:bg-[color:var(--c-650)] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Experience Policy'}
          </button>
        </div>
      </div>

      {/* 2. Academic Cycle + Reset */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-700 text-slate-800">Academic Cycle</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Current cycle:</span>
          {(['ODD', 'EVEN', 'BOTH'] as AcademicCycle[]).map(c => (
            <button
              key={c}
              onClick={() => { if (c !== cycle) { setPendingCycle(c); setCycleError(null); setCyclePassword('') } }}
              disabled={saving || c === cycle}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition ${cycle === c ? 'bg-[color:var(--c-600)] text-white border-[color:var(--c-600)]' : 'bg-white text-slate-600 border-slate-200 hover:border-[color:var(--c-600)]/40'}`}
            >
              {c}
            </button>
          ))}
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-700">
            {cycle} SEMESTER LOCKED
          </span>
        </div>
      </div>

      {/* Staffing weightage */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <div>
          <h2 className="text-sm font-700 text-slate-800">Staffing weightage</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Decides how many preferences a subject accepts and when the app says "need more teachers".</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-700 text-slate-500 uppercase tracking-wider">Sections one teacher takes (average)</span>
            <input type="number" min={1} max={12} value={config.avgSectionsPerTeacher ?? 3}
              onChange={e => setConfig({ ...config, avgSectionsPerTeacher: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            <span className="block text-[11px] text-slate-400 mt-1">A subject in 10 sections then accepts {Math.ceil(10 / (config.avgSectionsPerTeacher ?? 3))} teachers.</span>
          </label>
          <label className="block">
            <span className="text-[11px] font-700 text-slate-500 uppercase tracking-wider">Most periods per teacher per week</span>
            <input type="number" min={1} max={40} value={config.maxWeeklyPeriods ?? 28}
              onChange={e => setConfig({ ...config, maxWeeklyPeriods: Math.max(1, Math.min(40, Number(e.target.value) || 1)) })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            <span className="block text-[11px] text-slate-400 mt-1">Assigning past this needs an explicit override; auto-fill never goes past it.</span>
          </label>
        </div>
        <button onClick={() => saveConfig(config)} disabled={saving} className="px-4 py-1.5 rounded-full bg-[color:var(--c-600)] text-white text-xs font-700 disabled:opacity-40">Save weightage</button>
      </div>

      {/* 4. AI toggle */}
      {(() => {
        const on = config.facultyAiEnabled ?? true
        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[color:var(--c-600)]/10 text-[color:var(--c-600)] shrink-0"><Bot className="w-4.5 h-4.5" /></span>
              <div className="min-w-0">
                <h2 className="text-sm font-700 text-slate-800">SCEDULAR AI for Faculty</h2>
                <p className="text-[11px] text-slate-500">{on ? 'Teachers can use the AI assistant.' : 'Hidden from teachers. The HOD can still use it.'}</p>
              </div>
            </div>
            <button
              type="button" role="switch" aria-checked={on} aria-label="SCEDULAR AI for faculty"
              onClick={() => saveConfig({ ...config, facultyAiEnabled: !on })}
              disabled={saving}
              className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute left-0 top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        )
      })()}

      {/* 5. Other info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-700 text-slate-800 flex items-center gap-2 mb-3"><Info className="w-4 h-4 text-[color:var(--c-600)]" /> Department Snapshot</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="block text-slate-400">Current Cycle</span><span className="font-700 text-slate-800">{cycle ?? '—'}</span></div>
          <div><span className="block text-slate-400">Senior Threshold</span><span className="font-700 text-slate-800">{config.seniorThreshold} yrs</span></div>
          <div><span className="block text-slate-400">Allocation Bands</span><span className="font-700 text-slate-800">{config.bands.length}</span></div>
          <div><span className="block text-slate-400">Faculty AI</span><span className="font-700 text-slate-800">{(config.facultyAiEnabled ?? true) ? 'Enabled' : 'Disabled'}</span></div>
        </div>
      </div>

      {/* Academic cycle change confirmation modal */}
      {pendingCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-slate-800 font-700 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[color:var(--c-600)]" /> Switch academic cycle to {pendingCycle}?</h3>
            <p className="text-xs text-slate-500">
              Faculty will immediately only be able to submit preferences for {pendingCycle} semesters, drawn from that semester's actual subject syllabus. Confirm with your HOD password.
            </p>
            <div>
              <label className="block text-[11px] font-700 text-slate-400 uppercase tracking-wider mb-1">HOD Password</label>
              <input
                type="password"
                value={cyclePassword}
                onChange={e => setCyclePassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && cyclePassword) confirmCycleChange() }}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[color:var(--c-600)]/30"
                autoFocus
              />
            </div>
            {cycleError && <p className="text-xs text-rose-600">{cycleError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setPendingCycle(null); setCycleError(null) }} className="px-4 py-2 rounded-lg bg-white text-slate-600 border border-slate-200 text-xs font-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={confirmCycleChange}
                disabled={saving || !cyclePassword}
                className="px-4 py-2 rounded-lg bg-[color:var(--c-600)] text-white text-xs font-700 hover:bg-[color:var(--c-650)] disabled:opacity-50"
              >
                {saving ? 'Switching…' : `Confirm Switch to ${pendingCycle}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

type Tab = 'setup' | 'sections' | 'syllabus' | 'labs' | 'incharge' | 'import' | 'policy' | 'appearance' | 'dataset'
const TABS: { id: Tab; label: string }[] = [
  { id: 'setup', label: 'Semester setup' },
  { id: 'sections', label: 'Sections' },
  { id: 'syllabus', label: 'Syllabus' },
  { id: 'labs', label: 'Lab rooms' },
  { id: 'import', label: 'Import' },
  { id: 'incharge', label: 'Class in-charge' },
  { id: 'policy', label: 'Policy & cycle' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'dataset', label: 'Dataset' },
]

export default function HodSettings({ navigate }: { navigate: (p: Page) => void }) {
  const [tab, setTab] = useState<Tab>('setup')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const say = (ok: boolean, text: string) => { setNotice({ ok, text }); setTimeout(() => setNotice(null), 6000) }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5 flex-wrap">
        <h1 className="font-display font-700 text-lg text-[color:var(--c-600)] flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Settings</h1>
        <PillTabs value={tab} onChange={setTab} tabs={TABS} />
      </div>
      {notice && <div className={`slide-down text-xs font-600 rounded-lg px-4 py-2.5 border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{notice.ok ? '✓' : '⚠'} {notice.text}</div>}
      {tab === 'setup' && <SetupOverviewTab navigate={navigate} goTo={setTab} />}
      {tab === 'sections' && <SetupSyllabusTab say={say} mode="sections" />}
      {tab === 'syllabus' && <SetupSyllabusTab say={say} mode="syllabus" onOpenLabs={() => setTab('labs')} />}
      {tab === 'labs' && <SetupLabsTab say={say} />}
      {tab === 'import' && <SetupImportTab say={say} />}
      {tab === 'incharge' && <SetupInchargeTab say={say} />}
      {tab === 'policy' && <PolicyAndCycle />}
      {tab === 'appearance' && <SetupAppearanceTab />}
      {tab === 'dataset' && <SetupDatasetTab say={say} />}
    </div>
  )
}
