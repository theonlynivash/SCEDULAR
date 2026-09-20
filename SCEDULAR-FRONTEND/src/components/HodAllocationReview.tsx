import { useState, useEffect, useMemo } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Users, Save, ShieldCheck, Layers, Pencil, X, ChevronDown, LockKeyhole } from 'lucide-react'
import { api } from '../api'
import { SEMESTER_TO_YEAR, type AcademicCycle } from '../academicCycle'

type Tab = 'confirmed' | 'preferences' | 'section-allocation'

interface ConfirmedFacultyRow {
  facultyId: string
  facultyName: string
  designation: string
  allocationExperience: number | null
  subjects: Array<{ subjectId: string; subjectCode: string; subjectName: string; component: string; sectionId: string; sectionName: string }>
}

interface OptionRow {
  preferenceId: number
  rank: number
  subjectId: string
  subjectCode: string
  subjectName: string
  deliveryType: string | null
  requestedSections: number
  labConfirmed: boolean
  status: string
}

interface FacultyRow {
  facultyId: string
  facultyName: string
  designation: string
  allocationExperience: number | null
  band: string
  options: OptionRow[]
  status: string
}

const STATUS_TONE: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUBMITTED: 'bg-blue-50 text-[#0F4C81] border-blue-200',
  CHANGES_REQUESTED: 'bg-amber-50 text-amber-700 border-amber-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
}

const ALLOC_STATUS_TONE: Record<string, string> = {
  FULL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  NOT_STARTED: 'bg-slate-100 text-slate-600 border-slate-200',
}

export default function HodAllocationReview() {
  const [activeTab, setActiveTab] = useState<Tab>('preferences')
  const [cycle, setCycle] = useState<AcademicCycle | null>(null)
  const [allowedSemesters, setAllowedSemesters] = useState<string[]>([])
  const [semester, setSemester] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Confirmed (already-known) teaching-allocation state
  const [confirmedRows, setConfirmedRows] = useState<ConfirmedFacultyRow[]>([])
  const [confirmedSummary, setConfirmedSummary] = useState<{ totalFaculty: number; confirmed: number; unallocated: number; totalAssignments: number } | null>(null)
  const [confirmedLoading, setConfirmedLoading] = useState(true)

  // Preferences review state
  const [facultyRows, setFacultyRows] = useState<FacultyRow[]>([])
  const [summary, setSummary] = useState<{ totalFaculty: number; submitted: number; pending: number; notSubmitted: number } | null>(null)
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const [demandList, setDemandList] = useState<any[]>([])
  const [semesterSubjects, setSemesterSubjects] = useState<any[]>([])
  const [editing, setEditing] = useState<{ preferenceId: number; subjectId: string; requestedSections: number } | null>(null)

  // Section allocation state
  const [sectionData, setSectionData] = useState<any>(null)
  const [localAssignments, setLocalAssignments] = useState<Record<string, string>>({})
  const [savingAllocation, setSavingAllocation] = useState(false)

  const year = semester ? SEMESTER_TO_YEAR[semester] : ''

  // Load the DB-configured cycle once; default the semester to the first allowed.
  useEffect(() => {
    ;(async () => {
      try {
        const ctx = await api.facultyAllocation.getAcademicCycle()
        setCycle(ctx.currentCycle)
        setAllowedSemesters(ctx.allowedSemesters ?? [])
        setSemester(prev => prev || (ctx.allowedSemesters?.[0] ?? ''))
      } catch (err: any) {
        setNotification({ type: 'error', message: err?.message || 'Failed to load academic cycle context' })
      }
    })()
  }, [])

  // Confirmed (already-known) teaching-allocation data for the selected semester.
  useEffect(() => {
    if (!semester) return
    ;(async () => {
      try {
        setConfirmedLoading(true)
        const res = await api.facultyAllocation.getConfirmedAllocation(semester)
        setConfirmedRows(res.facultyRows ?? [])
        setConfirmedSummary(res.summary ?? null)
      } catch (err: any) {
        setNotification({ type: 'error', message: err?.message || 'Failed to load confirmed allocation' })
      } finally {
        setConfirmedLoading(false)
      }
    })()
  }, [semester])

  // Preferences tab data (band-sorted rows + demand) for the selected semester.
  useEffect(() => {
    if (!semester) return
    ;(async () => {
      try {
        setLoading(true)
        const [res, subjRes] = await Promise.all([
          api.facultyAllocation.getHodPreferences(semester),
          api.facultyAllocation.getSubjectsForSemester(semester).catch(() => ({ subjects: [] })),
        ])
        setFacultyRows(res.facultyRows ?? [])
        setSummary(res.summary ?? null)
        setDemandList(res.demand ?? [])
        setSemesterSubjects((subjRes as any).subjects ?? [])
      } catch (err: any) {
        setNotification({ type: 'error', message: err?.message || 'Failed to load preferences' })
      } finally {
        setLoading(false)
      }
    })()
  }, [semester])

  // Section allocation data for the selected semester (cycle-aware year).
  useEffect(() => {
    if (activeTab !== 'section-allocation' || !semester) return
    ;(async () => {
      try {
        setLoading(true)
        const res = await api.teachingAssignments.getSectionAllocation(year, semester)
        setSectionData(res)
        const initialMap: Record<string, string> = {}
        for (const subj of res?.subjects ?? []) {
          for (const off of subj.offerings) {
            for (const ta of off.currentAssignments) {
              initialMap[`${off.sectionSubjectId}:${ta.component}`] = ta.facultyId
            }
          }
        }
        setLocalAssignments(initialMap)
      } catch (err: any) {
        setNotification({ type: 'error', message: err?.message || 'Failed to load section allocation' })
      } finally {
        setLoading(false)
      }
    })()
  }, [activeTab, semester, year])

  const handleReviewAction = async (preferenceId: number, status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED') => {
    try {
      await api.facultyAllocation.reviewPreference(preferenceId, status)
      setNotification({ type: 'success', message: `Preference #${preferenceId} → ${status.replace('_', ' ')}.` })
      setOpenMenu(null)
      const res = await api.facultyAllocation.getHodPreferences(semester)
      setFacultyRows(res.facultyRows ?? [])
      setSummary(res.summary ?? null)
      setDemandList(res.demand ?? [])
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Action failed' })
    }
  }

  const handleEditSave = async () => {
    if (!editing) return
    try {
      await api.facultyAllocation.editHodPreference(editing.preferenceId, {
        subjectId: editing.subjectId,
        requestedSections: editing.requestedSections,
      })
      setNotification({ type: 'success', message: `Preference #${editing.preferenceId} updated.` })
      setEditing(null)
      const res = await api.facultyAllocation.getHodPreferences(semester)
      setFacultyRows(res.facultyRows ?? [])
      setSummary(res.summary ?? null)
      setDemandList(res.demand ?? [])
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Edit failed' })
    }
  }

  const handleAssignmentChange = (sectionSubjectId: number, component: 'THEORY' | 'LAB', facultyId: string) => {
    const key = `${sectionSubjectId}:${component}`
    setLocalAssignments(prev => {
      const next = { ...prev }
      if (!facultyId) delete next[key]
      else next[key] = facultyId
      return next
    })
  }

  const handleSaveSectionAllocations = async () => {
    try {
      setSavingAllocation(true)
      const allocations: Array<{ facultyId: string; sectionSubjectId: number; component: 'THEORY' | 'LAB' }> = []
      for (const [key, facultyId] of Object.entries(localAssignments)) {
        if (!facultyId) continue
        const [ssIdStr, component] = key.split(':')
        allocations.push({ sectionSubjectId: Number(ssIdStr), component: component as 'THEORY' | 'LAB', facultyId })
      }
      const res = await api.teachingAssignments.commitSectionAllocation({ year, semester, allocations })
      if (res?.success) {
        setNotification({ type: 'success', message: res.message || 'Section allocations saved.' })
        const refreshed = await api.teachingAssignments.getSectionAllocation(year, semester)
        setSectionData(refreshed)
        const map: Record<string, string> = {}
        for (const subj of refreshed?.subjects ?? []) {
          for (const off of subj.offerings) {
            for (const ta of off.currentAssignments) map[`${off.sectionSubjectId}:${ta.component}`] = ta.facultyId
          }
        }
        setLocalAssignments(map)
      } else {
        setNotification({ type: 'error', message: res?.message || 'Failed to commit allocations.' })
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Validation failed on commit.' })
    } finally {
      setSavingAllocation(false)
    }
  }

  const semesterOptions = useMemo(
    () => allowedSemesters.map(s => ({ value: s, label: `Semester ${s}`, year: SEMESTER_TO_YEAR[s] })),
    [allowedSemesters],
  )

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-800 text-lg text-[#0F4C81] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#0F4C81]" />
            Faculty Subject Allocation
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Review confirmed faculty-subject allocations, or the fresh preference-submission workflow, then generate the timetable.
            {cycle && <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-50 text-[#0F4C81] border border-blue-200 text-[11px] font-600">Current Cycle: {cycle}</span>}
          </p>
        </div>

        <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-4 py-2 rounded-lg text-xs font-600 transition flex items-center gap-2 ${activeTab === 'preferences' ? 'bg-[#0F4C81] text-white shadow-sm' : 'text-slate-500 hover:text-[#0F4C81]'}`}
          >
            <Users className="w-3.5 h-3.5" /> Preference Review
          </button>
          <button
            onClick={() => setActiveTab('section-allocation')}
            className={`px-4 py-2 rounded-lg text-xs font-600 transition flex items-center gap-2 ${activeTab === 'section-allocation' ? 'bg-[#0F4C81] text-white shadow-sm' : 'text-slate-500 hover:text-[#0F4C81]'}`}
          >
            <Layers className="w-3.5 h-3.5" /> Section Allocation
          </button>
          <button
            onClick={() => setActiveTab('confirmed')}
            className={`px-4 py-2 rounded-lg text-xs font-600 transition flex items-center gap-2 ${activeTab === 'confirmed' ? 'bg-[#0F4C81] text-white shadow-sm' : 'text-slate-500 hover:text-[#0F4C81]'}`}
          >
            <LockKeyhole className="w-3.5 h-3.5" /> Confirmed Allocation
          </button>
        </div>
      </div>

      {/* Semester context selector — only current-cycle semesters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-700 text-slate-400 uppercase tracking-wider">Semester</span>
        <div className="flex flex-wrap gap-2">
          {semesterOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSemester(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition ${semester === opt.value ? 'bg-[#0F4C81] text-white border-[#0F4C81]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#0F4C81]/40'}`}
            >
              {opt.label} <span className="opacity-70">· {opt.year}</span>
            </button>
          ))}
        </div>
      </div>

      {notification && (
        <div className={`px-4 py-3 rounded-xl flex items-center justify-between border text-xs font-600 shadow-sm ${notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-xs text-slate-400 hover:text-slate-700">Dismiss</button>
        </div>
      )}

      {/* TAB: CONFIRMED (ALREADY-KNOWN) FACULTY-SUBJECT ALLOCATION */}
      {activeTab === 'confirmed' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total Faculty', value: confirmedSummary?.totalFaculty ?? '—', tone: 'text-slate-800' },
              { label: 'Confirmed', value: confirmedSummary?.confirmed ?? '—', tone: 'text-emerald-700' },
              { label: 'Unallocated', value: confirmedSummary?.unallocated ?? '—', tone: 'text-amber-600' },
              { label: 'Assignments', value: confirmedSummary?.totalAssignments ?? '—', tone: 'text-[#0F4C81]' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">{card.label}</div>
                <div className={`text-2xl font-800 font-display mt-1 ${card.tone}`}>{card.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div>
              <h2 className="text-xs font-700 text-slate-500 flex items-center gap-2">
                <LockKeyhole className="w-4 h-4 text-[#0F4C81]" /> Confirmed Faculty-Subject Allocation — Semester {semester || '—'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                These assignments are already known (teaching_assignments) and do not require a fresh preference submission. Faculty with no row below have no confirmed allocation for this semester yet.
              </p>
            </div>

            {confirmedLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading confirmed allocation…</div>
            ) : confirmedRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No confirmed teaching assignments on record for Semester {semester}. Use Preference Review to start a fresh allocation round.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Faculty</th>
                      <th className="py-2.5 px-3">Experience</th>
                      <th className="py-2.5 px-3">Subjects (Section · Component)</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {confirmedRows.map(row => {
                      const bySubject = new Map<string, { subjectCode: string; subjectName: string; entries: string[] }>()
                      for (const s of row.subjects) {
                        const entry = bySubject.get(s.subjectId) ?? { subjectCode: s.subjectCode, subjectName: s.subjectName, entries: [] }
                        entry.entries.push(`${s.sectionName} · ${s.component}`)
                        bySubject.set(s.subjectId, entry)
                      }
                      return (
                        <tr key={row.facultyId} className="align-top hover:bg-slate-50/60 transition">
                          <td className="py-3 px-3">
                            <div className="font-600 text-slate-800">{row.facultyName}</div>
                            <div className="text-slate-500">{row.designation}</div>
                            <div className="text-slate-400 text-[10px] font-mono">{row.facultyId}</div>
                          </td>
                          <td className="py-3 px-3 text-[#0F4C81] font-700">{row.allocationExperience ?? '—'}</td>
                          <td className="py-3 px-3">
                            <div className="space-y-1.5">
                              {Array.from(bySubject.values()).map(s => (
                                <div key={s.subjectCode}>
                                  <span className="font-600 text-slate-800">{s.subjectCode}</span>
                                  <span className="text-slate-500"> — {s.subjectName}</span>
                                  <div className="text-slate-400 text-[10px]">{s.entries.join(', ')}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full border text-[10px] font-700 bg-emerald-50 text-emerald-700 border-emerald-200">LOCKED</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: PREFERENCE REVIEW */}
      {activeTab === 'preferences' && (
        <div className="space-y-5">
          {/* Info strip */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <span>
              Reviewing preferences for Semester <strong className="text-slate-800">{semester || '—'}</strong> ({year || '—'}).
            </span>
            {cycle && (
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#0F4C81] border border-blue-200 text-[11px] font-700">
                Current Cycle: {cycle}
              </span>
            )}
          </div>

          {/* DB-derived review summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total Faculty', value: summary?.totalFaculty ?? '—', tone: 'text-slate-800' },
              { label: 'Submitted', value: summary?.submitted ?? '—', tone: 'text-[#0F4C81]' },
              { label: 'Pending', value: summary?.pending ?? '—', tone: 'text-amber-600' },
              { label: 'Not Submitted', value: summary?.notSubmitted ?? '—', tone: 'text-slate-400' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">{card.label}</div>
                <div className={`text-2xl font-800 font-display mt-1 ${card.tone}`}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Demand / coverage view */}
          <div>
            <h2 className="text-xs font-700 text-slate-400 uppercase tracking-wider px-1 mb-2">Subject Demand · Semester {semester || '—'}</h2>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Code</th>
                      <th className="py-2.5 px-3">Subject</th>
                      <th className="py-2.5 px-3 text-center">Required</th>
                      <th className="py-2.5 px-3 text-center">Approved</th>
                      <th className="py-2.5 px-3 text-center">Assigned</th>
                      <th className="py-2.5 px-3 text-center">Shortage</th>
                      <th className="py-2.5 px-3 text-center">Interest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {demandList.map(d => (
                      <tr key={d.subjectId} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-3 font-600 text-[#0F4C81]">{d.subjectCode}</td>
                        <td className="py-2.5 px-3 text-slate-800 font-600">{d.subjectName}</td>
                        <td className="py-2.5 px-3 text-center text-slate-700">{d.requiredSections}</td>
                        <td className="py-2.5 px-3 text-center text-emerald-700 font-700">{d.approvedCapacity ?? d.approvedSectionTotal}</td>
                        <td className="py-2.5 px-3 text-center text-[#0F4C81] font-700">{d.assignedSections ?? 0}</td>
                        <td className="py-2.5 px-3 text-center text-amber-700 font-700">{d.shortage ?? 0}</td>
                        <td className="py-2.5 px-3 text-center text-slate-500">{d.facultyInterestedCount} 👥</td>
                      </tr>
                    ))}
                    {demandList.length === 0 && !loading && (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-slate-400">
                          No canonical subjects configured for Semester {semester}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Band-sorted faculty preference table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-700 text-slate-500 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0F4C81]" /> Faculty Preferences (13+ → 10–&lt;13 → 0–9, higher experience first)
            </h2>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading preferences…</div>
            ) : facultyRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No faculty preferences submitted for Semester {semester} yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Faculty</th>
                      <th className="py-2.5 px-3">Exp</th>
                      <th className="py-2.5 px-3">Band</th>
                      <th className="py-2.5 px-3">Option 1</th>
                      <th className="py-2.5 px-3">Option 2</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {facultyRows.map(row => {
                      const o1 = row.options[0]
                      const o2 = row.options[1]
                      return (
                        <tr key={row.facultyId} className="align-top hover:bg-slate-50/60 transition">
                          <td className="py-3 px-3">
                            <div className="font-600 text-slate-800">{row.facultyName}</div>
                            <div className="text-slate-500">{row.designation}</div>
                            <div className="text-slate-400 text-[10px] font-mono">{row.facultyId}</div>
                          </td>
                          <td className="py-3 px-3 text-[#0F4C81] font-700">{row.allocationExperience ?? '—'}</td>
                          <td className="py-3 px-3 text-slate-600">{row.band}</td>
                          <td className="py-3 px-3">{o1 ? <OptionCell opt={o1} /> : <span className="text-slate-400">-</span>}</td>
                          <td className="py-3 px-3">{o2 ? <OptionCell opt={o2} /> : <span className="text-slate-400">-</span>}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-700 ${STATUS_TONE[row.status] ?? STATUS_TONE.DRAFT}`}>{row.status}</span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {row.options.map(opt => {
                                const locked = opt.status === 'APPROVED'
                                const open = openMenu === opt.preferenceId
                                return (
                                  <div key={opt.preferenceId} className="relative inline-flex items-center gap-1">
                                    <button
                                      onClick={() => setOpenMenu(open ? null : opt.preferenceId)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-[#0F4C81] border border-blue-200 text-[10px] font-700 hover:bg-blue-100 transition"
                                    >
                                      Edit
                                      <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                    {locked && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-700">#{opt.rank} Locked</span>
                                    )}
                                    {open && (
                                      <div className="absolute z-20 mt-1 top-full left-0 w-48 rounded-xl bg-white border border-slate-200 shadow-lg overflow-hidden">
                                        <button
                                          onClick={() => { setEditing({ preferenceId: opt.preferenceId, subjectId: opt.subjectId, requestedSections: opt.requestedSections }); setOpenMenu(null) }}
                                          disabled={locked}
                                          title={locked ? 'Approved preference is locked' : 'Edit subject and requested section capacity'}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-600 text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          <Pencil className="w-3.5 h-3.5 text-[#0F4C81]" /> Edit Preference
                                        </button>
                                        <button
                                          onClick={() => handleReviewAction(opt.preferenceId, 'APPROVED')}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-600 text-slate-700 hover:bg-slate-50 transition"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Approve
                                        </button>
                                        <button
                                          onClick={() => handleReviewAction(opt.preferenceId, 'CHANGES_REQUESTED')}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-600 text-slate-700 hover:bg-slate-50 transition"
                                        >
                                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Request Changes
                                        </button>
                                        <button
                                          onClick={() => handleReviewAction(opt.preferenceId, 'REJECTED')}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-600 text-slate-700 hover:bg-slate-50 transition"
                                        >
                                          <XCircle className="w-3.5 h-3.5 text-rose-600" /> Reject
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SECTION ALLOCATION */}
      {activeTab === 'section-allocation' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Context: <strong className="text-[#0F4C81]">{cycle}</strong> · Semester <strong className="text-slate-800">{semester || '—'}</strong> · <strong className="text-slate-800">{year}</strong>
            </p>
            <button
              onClick={handleSaveSectionAllocations}
              disabled={savingAllocation || !semester}
              className="px-5 py-2 rounded-lg bg-[#0F4C81] text-white font-600 text-xs shadow-sm hover:bg-[#0a3860] transition flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> {savingAllocation ? 'Validating & Saving…' : 'Commit Section Allocations'}
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">Loading section allocation matrix…</div>
          ) : !sectionData?.subjects || sectionData.subjects.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">
              No active subjects or sections configured for {year} Semester {semester}.
            </div>
          ) : (
            <div className="space-y-5">
              {sectionData.subjects.map((subj: any) => {
                const isIntegrated = subj.deliveryType === 'INTEGRATED'
                const isTheory = subj.deliveryType === 'THEORY' || isIntegrated
                const isLab = subj.deliveryType === 'LAB' || isIntegrated

                return (
                  <div key={subj.subjectId} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                      <div>
                        <span className="text-xs font-700 text-[#0F4C81] tracking-wider">{subj.code}</span>
                        <h3 className="text-base font-800 font-display text-slate-800">{subj.name}</h3>
                        <p className="text-xs text-slate-500">Delivery: <strong className="text-slate-700">{subj.deliveryType}</strong></p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">Req: <strong className="text-slate-800">{subj.requiredSections}</strong></span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">Approved: <strong className="text-emerald-700">{subj.totalApprovedCapacity}</strong></span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">Assigned: <strong className="text-[#0F4C81]">{subj.assignedSections}</strong></span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">Shortage: <strong className="text-amber-700">{subj.shortage}</strong></span>
                        <span className={`px-2.5 py-1 rounded-full border font-700 ${ALLOC_STATUS_TONE[subj.status] ?? ALLOC_STATUS_TONE.NOT_STARTED}`}>{subj.status}</span>
                      </div>
                    </div>

                    {/* Approved faculty pool with capacity */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="text-slate-500 self-center mr-1">Approved Pool:</span>
                      {subj.approvedFacultyPool.length === 0 ? (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-700 border border-rose-200">No Approved Faculty</span>
                      ) : (
                        subj.approvedFacultyPool.map((fac: any) => (
                          <span key={fac.facultyId} className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#0F4C81] text-[11px] font-700 border border-blue-200">
                            {fac.facultyName} · cap {fac.approvedSectionsCapacity} · assigned {fac.assignedSections} · left {fac.remainingCapacity}{isLab && fac.labConfirmed ? ' · 🧪' : ''}
                          </span>
                        ))
                      )}
                    </div>

                    {/* Section grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {subj.offerings.map((offering: any) => {
                        const theoryKey = `${offering.sectionSubjectId}:THEORY`
                        const labKey = `${offering.sectionSubjectId}:LAB`
                        const sectionName = sectionData.sections?.find((s: any) => s.id === offering.sectionId)?.name ?? offering.sectionId
                        return (
                          <div key={offering.sectionSubjectId} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-700 text-slate-800 text-sm">{sectionName}</span>
                              <span className="text-[10px] text-slate-400">#{offering.sectionSubjectId}</span>
                            </div>
                            {isTheory && (
                              <div>
                                <label className="block text-[10px] font-700 text-slate-400 uppercase tracking-wider mb-1">Theory Teacher</label>
                                <select
                                  value={localAssignments[theoryKey] || ''}
                                  onChange={e => handleAssignmentChange(offering.sectionSubjectId, 'THEORY', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
                                >
                                  <option value="">-- Select Approved Staff --</option>
                                  {subj.approvedFacultyPool.map((fac: any) => (
                                    <option key={fac.facultyId} value={fac.facultyId}>{fac.facultyName}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {isLab && (
                              <div>
                                <label className="block text-[10px] font-700 text-slate-400 uppercase tracking-wider mb-1">Lab Teacher (lab-confirmed only)</label>
                                <select
                                  value={localAssignments[labKey] || ''}
                                  onChange={e => handleAssignmentChange(offering.sectionSubjectId, 'LAB', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
                                >
                                  <option value="">-- Select Approved Staff --</option>
                                  {subj.approvedFacultyPool.filter((fac: any) => fac.labConfirmed).map((fac: any) => (
                                    <option key={fac.facultyId} value={fac.facultyId}>{fac.facultyName}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {openMenu !== null && <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />}

      {/* Edit preference modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-700 flex items-center gap-2"><Pencil className="w-4 h-4 text-[#0F4C81]" /> Edit Preference #{editing.preferenceId}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>

            <div>
              <label className="block text-[11px] font-700 text-slate-400 uppercase tracking-wider mb-1">Subject (Semester {semester})</label>
              <select
                value={editing.subjectId}
                onChange={e => setEditing({ ...editing, subjectId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
              >
                {semesterSubjects.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-700 text-slate-400 uppercase tracking-wider mb-1">Requested Section Capacity</label>
              <input
                type="number"
                min={0}
                value={editing.requestedSections}
                onChange={e => setEditing({ ...editing, requestedSections: Number(e.target.value) })}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg bg-white text-slate-600 border border-slate-200 text-xs font-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleEditSave} className="px-4 py-2 rounded-lg bg-[#0F4C81] text-white text-xs font-600 hover:bg-[#0a3860]">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OptionCell({ opt }: { opt: OptionRow }) {
  return (
    <div>
      <div className="font-600 text-slate-800">{opt.subjectCode}</div>
      <div className="text-slate-500">{opt.subjectName}</div>
      <div className="text-slate-400 mt-0.5">
        {opt.requestedSections} sec · {opt.deliveryType ?? '—'}
        <span className={`ml-1 px-1.5 py-0.5 rounded border text-[9px] font-700 ${STATUS_TONE[opt.status] ?? STATUS_TONE.DRAFT}`}>{opt.status}</span>
      </div>
    </div>
  )
}
