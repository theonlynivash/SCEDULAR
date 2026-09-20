import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  api,
  type FacultyProfile,
  type AllocationPolicyResponse,
  type FacultySubjectDTO,
  type FacultyPreference,
  type FacultyHistoryItem,
  type PreferenceItemPayload,
  type CycleContextResponse,
} from '../api'
import { SEMESTER_TO_YEAR, SEMESTER_ORDER, type SemesterOption } from '../academicCycle'

// ── Constants ──────────────────────────────────────────────────────────────
// Semester lists and the semester→year mapping come from the canonical
// academic-cycle module (src/academicCycle.ts). The *current* cycle
// (ODD/EVEN/BOTH) is fetched from the backend (/faculty/cycle-context) and is
// DB-configurable — never hardcoded here. Only the current cycle's specific
// semesters are rendered as selectable options.
const YEAR_LIST = ['Year 1', 'Year 2', 'Year 3', 'Year 4']
const YEAR_SHORT: Record<string, string> = { 'Year 1': 'I–II', 'Year 2': 'III–IV', 'Year 3': 'V–VI', 'Year 4': 'VII–VIII' }
const DEFAULT_MAX_SECTIONS = 12

interface Selection {
  subjectId: string
  code: string
  name: string
  year: string
  semester: string
  deliveryType: 'THEORY' | 'LAB' | 'INTEGRATED'
  requestedSections: number
  labConfirmed: boolean
}

type StatusKey = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'

function notSpecified(v: number | string | null | undefined): string {
  return v === null || v === undefined || v === '' ? 'Not specified' : String(v)
}

function computeStatus(prefs: FacultyPreference[]): { key: StatusKey; label: string; className: string } {
  if (prefs.length === 0) {
    return { key: 'DRAFT', label: 'DRAFT · Nothing saved yet', className: 'bg-slate-100 text-slate-600 border-slate-200' }
  }
  const set = new Set(prefs.map(p => p.status))
  const all = (s: StatusKey) => prefs.every(p => p.status === s)
  if (all('APPROVED')) return { key: 'APPROVED', label: '✓ APPROVED', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  if (set.has('CHANGES_REQUESTED')) return { key: 'CHANGES_REQUESTED', label: '⚠ CHANGES REQUESTED', className: 'bg-amber-100 text-amber-800 border-amber-200' }
  if (set.has('REJECTED')) return { key: 'REJECTED', label: '✕ REJECTED', className: 'bg-rose-100 text-rose-800 border-rose-200' }
  if (set.has('SUBMITTED')) return { key: 'SUBMITTED', label: '⏳ SUBMITTED · Under HOD Review', className: 'bg-blue-100 text-blue-800 border-blue-200' }
  return { key: 'DRAFT', label: '📝 DRAFT', className: 'bg-slate-100 text-slate-700 border-slate-200' }
}

interface FacultySubjectAllocationProps {
  facultyId?: string
}

export default function FacultySubjectAllocation({ facultyId }: FacultySubjectAllocationProps) {
  // Identity is resolved by the backend from the authenticated session. The prop
  // is only used to trigger a reload when the signed-in faculty changes.
  const [faculty, setFaculty] = useState<FacultyProfile | null>(null)
  const [policyResp, setPolicyResp] = useState<AllocationPolicyResponse | null>(null)
  const [cycleContext, setCycleContext] = useState<CycleContextResponse | null>(null)

  const [semester, setSemester] = useState<string>('')
  const [catalog, setCatalog] = useState<FacultySubjectDTO[]>([])
  const [meta, setMeta] = useState<Record<string, FacultySubjectDTO>>({})
  const [maxSections, setMaxSections] = useState<number>(DEFAULT_MAX_SECTIONS)

  const [interest, setInterest] = useState<Record<string, number>>({})
  const [interestUnavailable, setInterestUnavailable] = useState(false)

  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [existingPrefs, setExistingPrefs] = useState<FacultyPreference[]>([])
  const [history, setHistory] = useState<FacultyHistoryItem[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [validationMsg, setValidationMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  // ── Derived policy values (authoritative, from the backend) ───────────────
  const allocationExperience = policyResp?.allocationExperience ?? null
  const policy = policyResp?.policy ?? null
  const eligibleYears = policy?.eligibleYears ?? []
  const maxTotal = policy?.maxTotalPreferences ?? 0
  const maxPerYear = policy?.maxPreferencesPerYear ?? 0
  const reasons = policy?.reasons ?? {}
  const experienceConfigured = allocationExperience !== null

  // ── Academic cycle (DB-configurable, from /faculty/cycle-context) ──────────
  const currentCycle = cycleContext?.currentCycle ?? null
  const allowedSemesters = useMemo(() => cycleContext?.allowedSemesters ?? [], [cycleContext])
  const semesterOptions: SemesterOption[] = useMemo(
    () => allowedSemesters.map(value => ({ value, label: `Semester ${value}`, year: SEMESTER_TO_YEAR[value] })),
    [allowedSemesters]
  )

  const selectedYear = SEMESTER_TO_YEAR[semester] ?? 'Year 2'
  const yearEligible = eligibleYears.includes(selectedYear)

  const selectionArr = Object.values(selections).sort(
    (a, b) => (SEMESTER_ORDER[a.semester] ?? 0) - (SEMESTER_ORDER[b.semester] ?? 0)
  )
  const countInSelectedYear = selectionArr.filter(s => s.year === selectedYear).length
  const integratedPending = selectionArr.filter(s => s.deliveryType === 'INTEGRATED' && !s.labConfirmed)

  const isLocked = existingPrefs.some(p => p.status === 'SUBMITTED' || p.status === 'APPROVED')
  const status = computeStatus(existingPrefs)

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadSemesterCatalog = useCallback(async (sem: string) => {
    const res = await api.facultyAllocation.getSubjectsForSemester(sem)
    setMeta(prev => {
      const next = { ...prev }
      for (const s of res.subjects) next[s.id] = s
      return next
    })
    if (res.semester === sem) {
      setCatalog(res.subjects)
      setMaxSections(res.maxRequestedSections ?? DEFAULT_MAX_SECTIONS)
    }
    return res
  }, [])

  const loadInterest = useCallback(async (sem: string) => {
    try {
      const d = await api.facultyAllocation.getSubjectDemand(sem)
      const map: Record<string, number> = {}
      for (const item of d.demand) map[item.subjectId] = item.interestCount ?? item.facultyInterestedCount ?? 0
      setInterest(map)
      setInterestUnavailable(false)
    } catch {
      // Counts are supplementary — never fabricate a number. Flag as unavailable.
      setInterestUnavailable(true)
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [me, policyRes, prefsRes, cycleRes] = await Promise.all([
        api.facultyAllocation.getMe(),
        api.facultyAllocation.getAllocationPolicy(),
        api.facultyAllocation.getPreferences(),
        api.facultyAllocation.getCycleContext(),
      ])
      setFaculty(me)
      setPolicyResp(policyRes)
      setExistingPrefs(prefsRes.preferences)
      setCycleContext(cycleRes)

      // The workflow only exposes the current cycle's semesters. Keep the
      // already-selected semester if it is still allowed, otherwise fall back to
      // the first semester of the current cycle (EVEN → II, etc.).
      const allowed = cycleRes.allowedSemesters ?? []
      const effective = allowed.includes(semester) ? semester : (allowed[0] ?? '')
      if (effective !== semester) setSemester(effective)

      // Rebuild working selections from persisted preferences (real data only).
      const restored: Record<string, Selection> = {}
      for (const p of prefsRes.preferences) {
        restored[p.subjectId] = {
          subjectId: p.subjectId,
          code: p.subjectId,
          name: p.subjectId,
          year: p.academicYear,
          semester: p.semester,
          deliveryType: 'THEORY',
          requestedSections: p.requestedSections || 1,
          labConfirmed: !!p.labConfirmed,
        }
      }

      // Fetch catalogs for the effective semester plus any semester that already
      // holds saved preferences, so the summary can show real subject metadata.
      const needed = Array.from(new Set([effective, ...prefsRes.preferences.map(p => p.semester)])).filter(Boolean)
      const catalogs = await Promise.all(needed.map(s => api.facultyAllocation.getSubjectsForSemester(s)))
      const metaMap: Record<string, FacultySubjectDTO> = {}
      for (const c of catalogs) for (const s of c.subjects) metaMap[s.id] = s
      setMeta(metaMap)

      const current = catalogs.find(c => c.semester === effective)
      setCatalog(current?.subjects ?? [])
      setMaxSections(current?.maxRequestedSections ?? DEFAULT_MAX_SECTIONS)

      // Enrich restored selections with canonical metadata.
      for (const id of Object.keys(restored)) {
        const m = metaMap[id]
        if (m) {
          restored[id] = {
            ...restored[id],
            code: m.code,
            name: m.name,
            year: m.year ?? restored[id].year,
            semester: m.semester ?? restored[id].semester,
            deliveryType: m.deliveryType,
          }
        }
      }
      setSelections(restored)

      await loadInterest(effective)
      try {
        const h = await api.facultyAllocation.getHistory()
        setHistory(h.history)
      } catch {
        setHistory([])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load the Faculty Subject Allocation workspace. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [semester, loadInterest])

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyId])

  async function switchSemester(sem: string) {
    if (sem === semester) return
    setSemester(sem)
    setValidationMsg('')
    try {
      await loadSemesterCatalog(sem)
      await loadInterest(sem)
    } catch (e: any) {
      setError(e?.message || `Failed to load Semester ${sem} subjects.`)
    }
  }

  // ── Selection handlers ────────────────────────────────────────────────────
  function toggleSelect(subject: FacultySubjectDTO) {
    if (isLocked) {
      setValidationMsg('Your preferences are submitted or approved and can no longer be edited.')
      return
    }
    if (!yearEligible) {
      setValidationMsg(reasons[selectedYear] || `${selectedYear} is not eligible for your allocation experience.`)
      return
    }
    setValidationMsg('')
    setSelections(prev => {
      const next = { ...prev }
      if (next[subject.id]) {
        delete next[subject.id]
        return next
      }
      const current = Object.values(next)
      if (current.length >= maxTotal) {
        setValidationMsg(`Maximum ${maxTotal} preference${maxTotal === 1 ? '' : 's'} allowed for your allocation experience.`)
        return prev
      }
      const sameYear = current.filter(s => s.year === (subject.year ?? selectedYear)).length
      if (sameYear >= maxPerYear) {
        setValidationMsg(`Maximum ${maxPerYear} preference per academic year. You already selected one for ${subject.year ?? selectedYear}.`)
        return prev
      }
      next[subject.id] = {
        subjectId: subject.id,
        code: subject.code,
        name: subject.name,
        year: subject.year ?? selectedYear,
        semester: subject.semester ?? semester,
        deliveryType: subject.deliveryType,
        requestedSections: 1,
        labConfirmed: false,
      }
      return next
    })
  }

  function setSections(id: string, n: number) {
    const clamped = Math.max(1, Math.min(maxSections, n))
    setSelections(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], requestedSections: clamped } } : prev))
  }

  function toggleLab(id: string) {
    setSelections(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], labConfirmed: !prev[id].labConfirmed } } : prev))
    setValidationMsg('')
  }

  function buildItems(): PreferenceItemPayload[] {
    return selectionArr.map((s, idx) => ({
      subjectId: s.subjectId,
      subjectCode: s.code,
      academicYear: s.year,
      semester: s.semester,
      preferenceRank: idx + 1,
      requestedSections: s.requestedSections,
      labConfirmed: s.deliveryType === 'INTEGRATED' ? s.labConfirmed : true,
    }))
  }

  async function handleSaveDraft() {
    if (isLocked) {
      setValidationMsg('Your preferences are submitted or approved and can no longer be edited.')
      return
    }
    setBusy(true)
    setValidationMsg('')
    try {
      const res = await api.facultyAllocation.saveDraft(buildItems())
      setExistingPrefs(res.preferences)
      setSuccessMsg('Draft saved.')
      setTimeout(() => setSuccessMsg(''), 3500)
      await loadInterest(semester)
    } catch (e: any) {
      setValidationMsg(e?.message || 'Failed to save draft.')
    } finally {
      setBusy(false)
    }
  }

  function openSubmit() {
    if (isLocked) {
      setValidationMsg('Your preferences are submitted or approved and can no longer be edited.')
      return
    }
    if (!experienceConfigured) {
      setValidationMsg('Allocation experience is not configured. Set it in My Profile before submitting.')
      return
    }
    if (selectionArr.length === 0) {
      setValidationMsg('Select at least one subject before submitting.')
      return
    }
    if (integratedPending.length > 0) {
      setValidationMsg(
        `Confirm laboratory responsibility for: ${integratedPending.map(s => s.name).join(', ')}.`
      )
      return
    }
    setValidationMsg('')
    setShowConfirm(true)
  }

  async function handleConfirmSubmit() {
    setBusy(true)
    setShowConfirm(false)
    setValidationMsg('')
    try {
      const res = await api.facultyAllocation.submitPreferences(buildItems())
      setExistingPrefs(res.preferences)
      setSuccessMsg('Preferences submitted for HOD review.')
      setTimeout(() => setSuccessMsg(''), 5000)
      await loadInterest(semester)
    } catch (e: any) {
      setValidationMsg(e?.message || 'Failed to submit preferences.')
    } finally {
      setBusy(false)
    }
  }

  function handleReset() {
    if (isLocked) return
    setSelections({})
    setValidationMsg('')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <div className="w-8 h-8 border-2 border-[#0F4C81] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-500">Loading Faculty Subject Allocation…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
        <p className="text-2xl mb-2">⚠️</p>
        <h2 className="font-display font-700 text-rose-800 mb-1">Could not load the allocation workspace</h2>
        <p className="text-xs text-rose-700 mb-4">{error}</p>
        <button
          onClick={loadAll}
          className="px-4 py-2 bg-[#0F4C81] text-white text-xs font-700 rounded-xl hover:bg-[#0a3860] transition"
        >
          Retry
        </button>
      </div>
    )
  }

  const initials =
    (faculty?.name ?? '')
      .split(' ')
      .filter(w => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map(w => w[0])
      .join('') || 'FAC'

  return (
    <div className="flex flex-col space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex items-center justify-between flex-wrap gap-3 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0F4C81]" />
            <h1 className="font-display font-800 text-lg text-[#0F4C81]">Faculty Subject Allocation</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Preference workflow only — select subjects and requested section capacity. Section assignment is done later by the HOD.
          </p>
        </div>
        <span className={`text-xs font-700 px-3 py-1 rounded-full border ${status.className}`}>{status.label}</span>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-600 rounded-xl px-4 py-3 flex items-center justify-between shadow-xs">
          <span>✓ {successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-800">✕</button>
        </div>
      )}
      {validationMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-600 rounded-xl px-4 py-3 flex items-center justify-between shadow-xs">
          <span>⚠ {validationMsg}</span>
          <button onClick={() => setValidationMsg('')} className="text-rose-500 hover:text-rose-800">✕</button>
        </div>
      )}
      {isLocked && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs font-600 rounded-xl px-4 py-3 shadow-xs">
          🔒 Your preferences are locked ({status.key === 'APPROVED' ? 'approved by the HOD' : 'submitted, pending HOD review'}).
          Editing resumes only if the HOD requests changes.
        </div>
      )}

      {/* Faculty + experience context */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#0F4C81] rounded-xl flex items-center justify-center text-white font-800 font-display text-base flex-shrink-0 shadow-sm">
              {initials}
            </div>
            <div>
              <p className="font-display font-700 text-base text-slate-800">{faculty?.name || 'Not Set'}</p>
              <p className="text-xs text-slate-500">{faculty?.department || 'Not Set'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {faculty?.designation || 'Not Set'} · <span className="font-mono text-blue-700 font-600">{faculty?.id}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="bg-[#0F4C81] text-white text-xs font-700 px-3 py-1 rounded-full whitespace-nowrap shadow-xs">
              {experienceConfigured
                ? `Max ${maxTotal} preference${maxTotal === 1 ? '' : 's'} · ${maxPerYear} per year`
                : 'Allocation experience not configured'}
            </span>
            <span className="text-[11px] text-slate-500">
              Eligible Years:{' '}
              <span className="font-600 text-slate-700">
                {eligibleYears.length ? eligibleYears.join(', ') : 'None (set allocation experience)'}
              </span>
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Previous Experience</p>
            <p className="font-display font-700 text-xl text-slate-700">
              {faculty?.previousExperience != null ? faculty.previousExperience : 'Not Set'}{' '}
              <span className="text-xs font-500">Yrs</span>
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Current Experience</p>
            <p className="font-display font-700 text-xl text-slate-700">
              {faculty?.currentExperience != null ? faculty.currentExperience : 'Not Set'}{' '}
              <span className="text-xs font-500">Yrs</span>
            </p>
          </div>
          <div className="bg-[#0F4C81]/8 border border-[#0F4C81]/20 rounded-lg p-3 text-center">
            <p className="text-xs text-[#0F4C81] font-600 mb-1">Allocation Experience (Policy)</p>
            <p className="font-display font-800 text-xl text-[#0F4C81]">
              {allocationExperience != null ? allocationExperience : 'Not Set'} <span className="text-xs font-500">Yrs</span>
            </p>
          </div>
        </div>

        {!experienceConfigured && (
          <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠ Allocation experience is not configured. Open <span className="font-700">My Profile</span> to set it before selecting subjects.
          </p>
        )}
      </div>

      {/* Semester selector + year eligibility */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <label className="block text-xs font-700 text-slate-700">Select Specific Semester</label>
            <p className="text-[11px] text-slate-400">
              Only canonical subjects for the chosen semester are shown. Year is derived automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentCycle && (
              <span className="text-[11px] font-700 text-white bg-[#0F4C81] rounded-full px-3 py-1">
                Current Cycle: {currentCycle}
              </span>
            )}
            <span className="text-[11px] font-600 text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
              Semester {semester || '—'} → {semester ? selectedYear : '—'}
            </span>
          </div>
        </div>

        {semesterOptions.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-4 text-center text-xs text-amber-800">
            No semesters are available for the current academic cycle context.
          </div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {semesterOptions.map(s => {
            const locked = !eligibleYears.includes(s.year)
            const active = semester === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => switchSemester(s.value)}
                title={locked ? reasons[s.year] || `${s.year} not eligible for your allocation experience` : `Show Semester ${s.value} subjects`}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  active
                    ? 'border-[#0F4C81] bg-[#0F4C81] text-white shadow-xs'
                    : locked
                    ? 'border-slate-200 bg-slate-50 text-slate-400'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#0F4C81]/40'
                }`}
              >
                <span className="block text-xs font-700">{s.label}</span>
                <span className={`block text-[10px] ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                  {s.year} {locked ? '· 🔒' : ''}
                </span>
              </button>
            )
          })}
        </div>
        )}

        {/* Year eligibility legend — all four years always visible */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {YEAR_LIST.map(y => {
            const ok = eligibleYears.includes(y)
            return (
              <div
                key={y}
                className={`rounded-lg border px-3 py-1.5 text-[11px] ${
                  ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                <span className="font-700">{y} (Sem {YEAR_SHORT[y]})</span>
                <span className="block">{ok ? 'Selectable' : reasons[y] || 'Locked by experience policy'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main workspace */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
        {/* Left: subject catalog */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <h2 className="font-display font-700 text-sm text-slate-800">
                Semester {semester} Subjects <span className="text-slate-400 font-500">({selectedYear})</span>
              </h2>
              <span className="text-[11px] text-slate-500">
                {catalog.length} canonical subject{catalog.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="p-5">
              {!yearEligible ? (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-5 text-center">
                  <p className="text-sm font-700 text-amber-800">🔒 {selectedYear} is not eligible for your allocation experience</p>
                  <p className="text-xs text-slate-500 mt-1">{reasons[selectedYear] || 'Select an eligible semester above.'}</p>
                </div>
              ) : catalog.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-2xl mb-2">📭</p>
                  <p className="text-sm font-600 text-slate-700">No subjects configured for Semester {semester}</p>
                  <p className="text-xs text-slate-400 mt-1">There are no canonical curriculum subjects for this semester yet.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {catalog.map(subject => {
                    const selected = !!selections[subject.id]
                    const isIntegrated = subject.deliveryType === 'INTEGRATED'
                    const interestCount = interest[subject.id]
                    const cannotAdd =
                      !selected &&
                      (selectionArr.length >= maxTotal || countInSelectedYear >= maxPerYear)
                    return (
                      <div
                        key={subject.id}
                        className={`rounded-xl border p-4 transition ${
                          selected ? 'border-[#0F4C81] bg-blue-50/40 ring-1 ring-[#0F4C81]/15' : 'border-slate-200 bg-white hover:border-slate-300'
                        } ${isLocked ? 'opacity-70' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-700 tracking-wider text-[#0F4C81] font-mono">{subject.code}</span>
                            <h3 className="font-600 text-sm text-slate-800 leading-snug">{subject.name}</h3>
                          </div>
                          <span className="text-[10px] font-700 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">
                            {subject.deliveryType}
                          </span>
                        </div>

                        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <div className="flex justify-between"><dt className="text-slate-400">Category</dt><dd className="text-slate-700 font-500 truncate ml-1">{notSpecified(subject.category)?.replace(/_/g, ' ')}</dd></div>
                          <div className="flex justify-between"><dt className="text-slate-400">Credits</dt><dd className="text-slate-700 font-500">{notSpecified(subject.credits)}</dd></div>
                          <div className="flex justify-between"><dt className="text-slate-400">Theory</dt><dd className="text-slate-700 font-500">{notSpecified(subject.theoryPeriods)}</dd></div>
                          <div className="flex justify-between"><dt className="text-slate-400">Lab</dt><dd className="text-slate-700 font-500">{notSpecified(subject.labPeriods)}</dd></div>
                        </dl>

                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-blue-700 font-600 bg-blue-100/60 px-2 py-0.5 rounded">
                            👥 {interestUnavailable ? '—' : interestCount ?? 0} interested
                          </span>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => toggleSelect(subject)}
                              disabled={!selected && cannotAdd}
                              className={`px-3 py-1.5 rounded-lg text-xs font-700 transition disabled:opacity-40 disabled:cursor-not-allowed ${
                                selected
                                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                  : 'bg-[#0F4C81] text-white hover:bg-[#0a3860]'
                              }`}
                            >
                              {selected ? 'Remove' : cannotAdd ? 'Limit reached' : 'Select'}
                            </button>
                          )}
                        </div>

                        {selected && !isLocked && (
                          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-600 font-600">Requested capacity</span>
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setSections(subject.id, selections[subject.id].requestedSections - 1)}
                                  className="w-6 h-6 rounded bg-white border border-slate-200 hover:bg-[#0F4C81] hover:text-white text-slate-600 text-xs font-700 flex items-center justify-center transition">−</button>
                                <span className="text-xs font-800 text-[#0F4C81] w-6 text-center">{selections[subject.id].requestedSections}</span>
                                <button type="button" onClick={() => setSections(subject.id, selections[subject.id].requestedSections + 1)}
                                  className="w-6 h-6 rounded bg-white border border-slate-200 hover:bg-[#0F4C81] hover:text-white text-slate-600 text-xs font-700 flex items-center justify-center transition">+</button>
                                <span className="text-[11px] text-slate-500">{selections[subject.id].requestedSections === 1 ? 'section' : 'sections'}</span>
                              </div>
                            </div>
                            <p className="text-[9px] text-slate-400 italic">
                              Requested capacity only (max {maxSections}). Final section assignment is decided separately by the HOD.
                            </p>
                            {isIntegrated && (
                              <label className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer ${
                                selections[subject.id].labConfirmed ? 'border-teal-200 bg-teal-50/60' : 'border-amber-200 bg-amber-50/60'
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={selections[subject.id].labConfirmed}
                                  onChange={() => toggleLab(subject.id)}
                                  className="mt-0.5 accent-teal-600"
                                />
                                <span className="text-[11px] text-slate-700">
                                  <span className="font-700">Integrated subject (Theory + Lab).</span>{' '}
                                  I confirm responsibility for the associated lab component.
                                  {!selections[subject.id].labConfirmed && (
                                    <span className="block text-amber-700 font-600 mt-0.5">⚠ Required before submission.</span>
                                  )}
                                </span>
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Previously handled subjects */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-display font-700 text-xs text-slate-700 uppercase tracking-wider mb-3">Previously Handled Subjects</h3>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No prior teaching history records found.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-600">
                    <th className="text-left py-2">Academic Year</th>
                    <th className="text-left py-2">Semester</th>
                    <th className="text-left py-2">Subject</th>
                    <th className="text-left py-2">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td className="py-2 text-slate-600">{h.academicYear}</td>
                      <td className="py-2 text-slate-600">{h.semester}</td>
                      <td className="py-2 text-slate-800 font-500">{h.subjectName}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-600 ${
                          h.type === 'LAB' ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'
                        }`}>{h.type || 'Theory'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: MY SUBJECT OPTIONS */}
        <div className="self-start sticky top-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
            <h3 className="font-display font-700 text-sm text-slate-800 mb-0.5">My Subject Options</h3>
            <p className="text-[11px] text-slate-400 mb-3">Real persisted preferences · {selectionArr.length}/{maxTotal} selected</p>

            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto min-h-0 space-y-2 mb-3">
              {selectionArr.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-2xl mb-1">🗂️</p>
                  <p className="text-xs text-slate-400">No subjects selected yet.</p>
                </div>
              ) : (
                selectionArr.map((s, idx) => (
                  <div key={s.subjectId} className="rounded-lg border border-slate-100 p-2.5 bg-slate-50/50">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 bg-[#0F4C81] text-white rounded text-[10px] font-700 flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-600 text-slate-800 leading-snug truncate">{s.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{s.code}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Semester {s.semester} · {s.year} · {s.requestedSections} {s.requestedSections === 1 ? 'section' : 'sections'}
                        </p>
                        {s.deliveryType === 'INTEGRATED' && (
                          <p className={`text-[10px] mt-0.5 font-600 ${s.labConfirmed ? 'text-teal-700' : 'text-amber-700'}`}>
                            {s.labConfirmed ? '✓ Lab confirmed' : '⚠ Lab confirmation pending'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="font-700 text-slate-700">{status.label}</span>
              </div>
              {integratedPending.length > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Labs pending</span>
                  <span className="font-700">{integratedPending.length}</span>
                </div>
              )}
            </div>

            {status.key === 'CHANGES_REQUESTED' && existingPrefs.find(p => p.hodComment) && (
              <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <p className="font-700 text-[10px] uppercase tracking-wider mb-0.5">HOD Feedback:</p>
                <p className="italic">{existingPrefs.find(p => p.hodComment)?.hodComment}</p>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={openSubmit}
                disabled={busy || isLocked}
                className="w-full py-2.5 bg-[#0F4C81] hover:bg-[#0a3860] text-white text-xs font-700 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                {busy ? 'Working…' : isLocked ? 'Locked' : 'Submit Preferences'}
              </button>
              {!isLocked && (
                <div className="flex gap-2">
                  <button type="button" onClick={handleSaveDraft} disabled={busy}
                    className="flex-1 py-2 border border-slate-200 text-slate-700 text-xs font-600 rounded-xl hover:bg-slate-50 transition disabled:opacity-40">
                    Save Draft
                  </button>
                  <button type="button" onClick={handleReset} disabled={busy}
                    className="flex-1 py-2 border border-slate-200 text-slate-700 text-xs font-600 rounded-xl hover:bg-slate-50 transition disabled:opacity-40">
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm submission */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-slate-200">
            <h3 className="font-display font-700 text-base text-slate-800 mb-2">Confirm Subject Preferences</h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Once submitted, your preferences are sent to the HOD for review and cannot be edited unless changes are requested.
            </p>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 text-xs space-y-1.5">
              {selectionArr.map((s, idx) => (
                <div key={s.subjectId} className="flex justify-between text-slate-600">
                  <span>#{idx + 1} {s.name} <span className="text-slate-400">(Sem {s.semester})</span></span>
                  <span className="font-600">{s.requestedSections} sec</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-xs font-600 rounded-xl hover:bg-slate-50 transition">
                Back / Edit
              </button>
              <button type="button" onClick={handleConfirmSubmit} disabled={busy}
                className="flex-1 py-2.5 bg-[#0F4C81] text-white text-xs font-700 rounded-xl hover:bg-[#0a3860] transition shadow-xs disabled:opacity-40">
                {busy ? 'Submitting…' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
