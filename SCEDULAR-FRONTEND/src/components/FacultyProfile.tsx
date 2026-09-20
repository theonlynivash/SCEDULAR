import { useEffect, useState } from 'react'
import { api, type FacultyProfile as FacultyProfileType } from '../api'

interface FacultyProfileProps {
  facultyId: string
}

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Not Set'
  return String(value)
}

function experience(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not Set'
  return `${value} yrs`
}

export default function FacultyProfile({ facultyId }: FacultyProfileProps) {
  const [profile, setProfile] = useState<FacultyProfileType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [prevExp, setPrevExp] = useState('')
  const [currExp, setCurrExp] = useState('')
  const [allocExp, setAllocExp] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  async function load() {
    if (!facultyId) {
      setLoading(false)
      setError('No authenticated faculty identity.')
      return
    }
    setLoading(true)
    try {
      const p = await api.faculty.profile(facultyId)
      setProfile(p)
      setPrevExp(p.previousExperience != null ? String(p.previousExperience) : '')
      setCurrExp(p.currentExperience != null ? String(p.currentExperience) : '')
      setAllocExp(p.allocationExperience != null ? String(p.allocationExperience) : '')
      setError(null)
    } catch {
      setError('Unable to load profile.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyId])

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setSaveMsg(null)
    const toNum = (v: string) => (v.trim() === '' ? undefined : Number(v))
    const fields = {
      previousExperience: toNum(prevExp),
      currentExperience: toNum(currExp),
      allocationExperience: toNum(allocExp),
    }
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && (!Number.isInteger(v) || v < 0)) {
        setSaveMsg(`Invalid value for ${k}. Use a non-negative whole number.`)
        setSaving(false)
        return
      }
    }
    try {
      const updated = await api.faculty.updateExperience(facultyId, fields)
      setProfile(updated)
      setSaveMsg('Experience updated.')
    } catch {
      setSaveMsg('Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const totalExperience =
    profile && (profile.previousExperience != null || profile.currentExperience != null)
      ? (profile.previousExperience ?? 0) + (profile.currentExperience ?? 0)
      : null

  if (loading) {
    return <div className="text-slate-500 text-sm p-6">Loading profile…</div>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display font-700 text-2xl text-slate-900 tracking-tight">Faculty Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Your details as recorded in the department database.</p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {profile && (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-700 text-[#f3c326] bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60">
                {(profile.name || '').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-700 text-lg text-slate-900 leading-tight">{display(profile.name)}</p>
                <p className="text-sm text-slate-500">{display(profile.designation)} · {display(profile.department)}</p>
              </div>
              <span className="ml-auto text-xs font-700 px-3 py-1 rounded-full bg-[#0F4C81]/10 text-[#0F4C81] uppercase tracking-wide">
                {display(profile.role)}
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Faculty ID" value={display(profile.id)} />
              <Field label="Name" value={display(profile.name)} />
              <Field label="Designation" value={display(profile.designation)} />
              <Field label="Department" value={display(profile.department)} />
              <Field label="Email" value={display(profile.email)} />
              <Field label="Phone" value={display(profile.phone)} />
              <Field label="Previous Experience" value={experience(profile.previousExperience)} />
              <Field label="Current Experience" value={experience(profile.currentExperience)} />
              <Field label="Total Experience" value={experience(totalExperience)} />
              <Field label="Allocation Experience" value={experience(profile.allocationExperience)} />
            </dl>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            <h2 className="font-700 text-lg text-slate-900 mb-1">Update Experience</h2>
            <p className="text-xs text-slate-500 mb-5">
              Previous, current and allocation experience are stored separately and are never inferred from your designation.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumberField label="Previous Experience (yrs)" value={prevExp} onChange={setPrevExp} />
              <NumberField label="Current Experience (yrs)" value={currExp} onChange={setCurrExp} />
              <NumberField label="Allocation Experience (yrs)" value={allocExp} onChange={setAllocExp} />
            </div>
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-white font-600 py-2.5 px-5 rounded-xl text-sm bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 shadow hover:brightness-110 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Experience'}
              </button>
              {saveMsg && <span className="text-sm text-slate-600">{saveMsg}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-600 uppercase tracking-wider text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800 font-500">{value}</dd>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-600 text-slate-500 mb-1.5">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Not Set"
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/40"
      />
    </label>
  )
}
