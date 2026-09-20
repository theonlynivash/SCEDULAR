import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AcademicCycle } from '../academicCycle'
import { ShieldCheck, RotateCcw, Bot, Info, Plus, Trash2 } from 'lucide-react'

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
}

const ALL_YEARS = ['Year 1', 'Year 2', 'Year 3', 'Year 4']

export default function HodSettings() {
  const [config, setConfig] = useState<AllocationConfig | null>(null)
  const [cycle, setCycle] = useState<AcademicCycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [showResetModal, setShowResetModal] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasskey, setResetPasskey] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

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

  const handleReset = async () => {
    setResetError(null)
    setResetting(true)
    try {
      const res = await api.facultyAllocation.resetAllocationCycle(resetPassword, resetPasskey)
      setNotice({ type: 'success', message: res.message })
      setShowResetModal(false)
      setResetPassword('')
      setResetPasskey('')
    } catch (err: any) {
      setResetError(err?.message || 'Reset failed — check password and passkey.')
    } finally {
      setResetting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-sm text-slate-400">Loading settings…</div>
  if (!config) return <div className="p-8 text-center text-sm text-rose-600">Failed to load settings.</div>

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4">
        <h1 className="font-display font-800 text-lg text-[#0F4C81] flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> HOD Settings
        </h1>
        <p className="text-slate-500 text-xs mt-1">Configure the allocation policy, academic cycle, and SCEDULAR AI access for this department.</p>
      </div>

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
          <button onClick={() => addBand()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-[#0F4C81] border border-blue-200 text-[11px] font-700 hover:bg-blue-100">
            <Plus className="w-3.5 h-3.5" /> Add Band
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Bands determine which years a faculty member can select preferences for, based on their allocation experience (set individually by each teacher on their own profile — never inferred from designation).
        </p>
        <div className="space-y-3">
          {config.bands.map((band, idx) => (
            <div key={band.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={band.name}
                  onChange={e => updateBand(idx, { name: e.target.value })}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-600 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
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
                      className={`px-2.5 py-1 rounded-full text-[11px] font-600 border transition ${band.eligibleYears.includes(y) ? 'bg-[#0F4C81] text-white border-[#0F4C81]' : 'bg-white text-slate-500 border-slate-200'}`}
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
          <button onClick={() => saveConfig(config)} disabled={saving} className="px-5 py-2 rounded-lg bg-[#0F4C81] text-white font-600 text-xs shadow-sm hover:bg-[#0a3860] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Experience Policy'}
          </button>
        </div>
      </div>

      {/* 2. Academic Cycle + Reset */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-700 text-slate-800">Academic Cycle &amp; Allocation Reset</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Current cycle:</span>
          {(['ODD', 'EVEN', 'BOTH'] as AcademicCycle[]).map(c => (
            <button
              key={c}
              onClick={() => { if (c !== cycle) { setPendingCycle(c); setCycleError(null); setCyclePassword('') } }}
              disabled={saving || c === cycle}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition ${cycle === c ? 'bg-[#0F4C81] text-white border-[#0F4C81]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#0F4C81]/40'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Locked action — changing the cycle requires your HOD password. Faculty only see and submit preferences for the current cycle's semesters (e.g. ODD subjects only while ODD is active), so switching this affects which syllabus every teacher sees.
        </p>
        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-2">
            Starting a new allocation cycle closes the current faculty preference round: it clears preferences, teaching assignments and generated timetables (master data — faculty, subjects, sections, labs — is never touched), and clears every faculty's allocation experience so each teacher must complete their profile again before submitting new preferences.
          </p>
          <button
            onClick={() => setShowResetModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-700 hover:bg-rose-100"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Start New Allocation Cycle
          </button>
        </div>
      </div>

      {/* 3. AI toggle */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#0F4C81]/10 text-[#0F4C81]"><Bot className="w-4.5 h-4.5" /></span>
          <div>
            <h2 className="text-sm font-700 text-slate-800">SCEDULAR AI for Faculty</h2>
            <p className="text-xs text-slate-500">Enable or disable the AI chat assistant for FACULTY users. HOD access is unaffected. The motivational quote card always shows regardless of this setting.</p>
          </div>
        </div>
        <button
          onClick={() => saveConfig({ ...config, facultyAiEnabled: !(config.facultyAiEnabled ?? true) })}
          disabled={saving}
          className={`relative w-12 h-7 rounded-full transition flex-shrink-0 ${(config.facultyAiEnabled ?? true) ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${(config.facultyAiEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* 4. Other info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-700 text-slate-800 flex items-center gap-2 mb-3"><Info className="w-4 h-4 text-[#0F4C81]" /> Department Snapshot</h2>
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
            <h3 className="text-slate-800 font-700 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#0F4C81]" /> Switch academic cycle to {pendingCycle}?</h3>
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
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/30"
                autoFocus
              />
            </div>
            {cycleError && <p className="text-xs text-rose-600">{cycleError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setPendingCycle(null); setCycleError(null) }} className="px-4 py-2 rounded-lg bg-white text-slate-600 border border-slate-200 text-xs font-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={confirmCycleChange}
                disabled={saving || !cyclePassword}
                className="px-4 py-2 rounded-lg bg-[#0F4C81] text-white text-xs font-700 hover:bg-[#0a3860] disabled:opacity-50"
              >
                {saving ? 'Switching…' : `Confirm Switch to ${pendingCycle}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirmation modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-slate-800 font-700 flex items-center gap-2"><RotateCcw className="w-4 h-4 text-rose-600" /> Start New Allocation Cycle?</h3>
            <p className="text-xs text-slate-500">
              This will close the current faculty subject allocation cycle and prepare SCEDULAR for fresh faculty preferences. This cannot be undone. Confirm with your HOD password and the reset passkey.
            </p>
            <div>
              <label className="block text-[11px] font-700 text-slate-400 uppercase tracking-wider mb-1">HOD Password</label>
              <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-400/30" />
            </div>
            <div>
              <label className="block text-[11px] font-700 text-slate-400 uppercase tracking-wider mb-1">Reset Passkey</label>
              <input type="text" value={resetPasskey} onChange={e => setResetPasskey(e.target.value)} placeholder="Type SCEDULAR_RESET" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-400/30" />
            </div>
            {resetError && <p className="text-xs text-rose-600">{resetError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setShowResetModal(false); setResetError(null) }} className="px-4 py-2 rounded-lg bg-white text-slate-600 border border-slate-200 text-xs font-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleReset}
                disabled={resetting || resetPasskey !== 'SCEDULAR_RESET' || !resetPassword}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-700 hover:bg-rose-700 disabled:opacity-50"
              >
                {resetting ? 'Resetting…' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
