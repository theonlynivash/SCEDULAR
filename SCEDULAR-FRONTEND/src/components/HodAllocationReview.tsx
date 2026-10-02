import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Users, Save, ShieldCheck, Layers, Pencil, X, Eye, LockKeyhole, LayoutGrid, MessageSquareWarning, ClipboardList, BookOpen, UserCheck, CheckSquare } from 'lucide-react'
import { api, type SubjectDemandDTO } from '../api'
import { SEMESTER_TO_YEAR, type AcademicCycle } from '../academicCycle'
import { getDeliveryTypeBadgeClasses, getDeliveryTypeLabel } from '../subjectConfig'

/** Centralized delivery-type badge (THEORY / INTEGRATED / LAB / PROJECT) */
function DeliveryBadge({ deliveryType }: { deliveryType?: string | null }) {
  const dt = deliveryType ?? ''
  const cls = getDeliveryTypeBadgeClasses(dt)
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-700 ${cls.bg} ${cls.text}`}>
      {dt ? getDeliveryTypeLabel(dt) : '—'}
    </span>
  )
}

type Tab = 'confirmed' | 'preferences' | 'section-allocation' | 'all-sem' | 'workload'

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
  reviewedBy?: string | null
  reviewedAt?: string | null
  hodComment?: string | null
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
  const [summary, setSummary] = useState<{ totalFaculty: number; submitted: number; approved: number; changesRequested: number; rejected: number; notSubmitted: number } | null>(null)
  const [reviewModal, setReviewModal] = useState<{ preferenceId: number; status: 'CHANGES_REQUESTED' | 'REJECTED'; comment: string; subjectCode: string } | null>(null)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [viewing, setViewing] = useState<OptionRow | null>(null)
  const [demandList, setDemandList] = useState<any[]>([])
  const [semesterSubjects, setSemesterSubjects] = useState<any[]>([])
  const [editing, setEditing] = useState<{ preferenceId: number; subjectId: string; requestedSections: number } | null>(null)

  // Section allocation state
  const [sectionData, setSectionData] = useState<any>(null)
  const [localAssignments, setLocalAssignments] = useState<Record<string, string>>({})
  const [savingAllocation, setSavingAllocation] = useState(false)

  // ALL SEM consolidated state
  const [allSemSubTab, setAllSemSubTab] = useState<'faculty' | 'subject'>('faculty')
  const [allSemPrefLoading, setAllSemPrefLoading] = useState(true)
  const [allSemDemandLoading, setAllSemDemandLoading] = useState(true)
  const [allSemPrefRows, setAllSemPrefRows] = useState<any[]>([])
  const [allSemDemandList, setAllSemDemandList] = useState<SubjectDemandDTO[]>([])
  const [allSemSemFilter, setAllSemSemFilter] = useState<string>('all')
  const [allSemConfiguredSemesters, setAllSemConfiguredSemesters] = useState<string[]>([])

  // WORKLOAD TAB state
  const [wlLoading, setWlLoading] = useState(false)
  const [wlSummary, setWlSummary] = useState<any>(null)
  const [wlTemplates, setWlTemplates] = useState<any[]>([])
  const [wlFacultyList, setWlFacultyList] = useState<any[]>([])
  const [stagedAllocations, setStagedAllocations] = useState<any[]>([])
  // Form state
  const [wlSelectedSubject, setWlSelectedSubject] = useState<string>('')
  const [wlSelectedTemplate, setWlSelectedTemplate] = useState<string>('')
  const [wlSelectedFaculty, setWlSelectedFaculty] = useState<string>('')
  const [wlSelectedSections, setWlSelectedSections] = useState<string[]>([])
  const [wlStaging, setWlStaging] = useState(false)
  const [wlApproving, setWlApproving] = useState(false)
  const [wlFormError, setWlFormError] = useState<string | null>(null)
  const [wlNewTemplateName, setWlNewTemplateName] = useState('')
  const [wlNewTemplateT, setWlNewTemplateT] = useState('')
  const [wlNewTemplateL, setWlNewTemplateL] = useState('')
  const [wlCreatingTemplate, setWlCreatingTemplate] = useState(false)
  const [wlEditingTemplate, setWlEditingTemplate] = useState<{ id: string; name: string; theoryPeriodsPerSection: number; labPeriodsPerSection: number } | null>(null)
  const [wlDeletingTemplateId, setWlDeletingTemplateId] = useState<string | null>(null)

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

  // ALL SEM: load consolidated faculty preferences across all configured semesters
  useEffect(() => {
    if (activeTab !== 'all-sem' || allowedSemesters.length === 0) return
    ;(async () => {
      try {
        setAllSemPrefLoading(true)
        setAllSemConfiguredSemesters(allowedSemesters)

        const allFacultyMap = new Map<string, {
          facultyId: string; facultyName: string; designation: string;
          allocationExperience: number | null; band: string;
          options: Array<{
            preferenceId: number; rank: number; subjectId: string; subjectCode: string;
            subjectName: string; deliveryType: string | null; requestedSections: number;
            labConfirmed: boolean; status: string; semester: string;
          }>;
          overallStatus: string;
        }>()

        const STATUS_AGGREGATE = ['APPROVED', 'SUBMITTED', 'CHANGES_REQUESTED', 'REJECTED', 'DRAFT']

        const results = await Promise.all(
          allowedSemesters.map(sem => api.facultyAllocation.getHodPreferences(sem).catch(() => ({ facultyRows: [], demand: [] }))),
        )

        for (let i = 0; i < allowedSemesters.length; i++) {
          const sem = allowedSemesters[i]
          const res = results[i]
          for (const row of (res.facultyRows ?? [])) {
            let existing = allFacultyMap.get(row.facultyId)
            if (!existing) {
              existing = { facultyId: row.facultyId, facultyName: row.facultyName, designation: row.designation, allocationExperience: row.allocationExperience, band: row.band, options: [], overallStatus: 'DRAFT' }
              allFacultyMap.set(row.facultyId, existing)
            }
            for (const opt of (row.options ?? [])) {
              existing.options.push({ ...opt, semester: sem })
            }
            const statuses = existing.options.map(o => o.status)
            existing.overallStatus = STATUS_AGGREGATE.find(s => statuses.includes(s)) ?? 'DRAFT'
          }
        }

        const rows = Array.from(allFacultyMap.values())
        const bandOrder: Record<string, number> = { '13+': 0, '10–<13': 1, '0–9': 2, 'Not Configured': 3 }
        rows.sort((a, b) => {
          const ba = bandOrder[a.band] ?? 99; const bb = bandOrder[b.band] ?? 99
          if (ba !== bb) return ba - bb
          return (b.allocationExperience ?? -1) - (a.allocationExperience ?? -1)
        })

        setAllSemPrefRows(rows)
      } catch (err: any) {
        setNotification({ type: 'error', message: err?.message || 'Failed to load ALL SEM preferences' })
      } finally {
        setAllSemPrefLoading(false)
      }
    })()
  }, [activeTab, allowedSemesters])

  // ALL SEM: load consolidated subject demand across all configured semesters
  useEffect(() => {
    if (activeTab !== 'all-sem' || allowedSemesters.length === 0) return
    ;(async () => {
      try {
        setAllSemDemandLoading(true)
        setAllSemConfiguredSemesters(allowedSemesters)
        const res = await api.facultyAllocation.getSubjectDemand()
        setAllSemDemandList(res.demand ?? [])
      } catch (err: any) {
        setNotification({ type: 'error', message: err?.message || 'Failed to load ALL SEM demand' })
      } finally {
        setAllSemDemandLoading(false)
      }
    })()
  }, [activeTab])

  // WORKLOAD TAB: load workload summary, templates and sections when tab is active
  useEffect(() => {
    if (activeTab !== 'workload' || !semester) return
    ;(async () => {
      try {
        setWlLoading(true)
        setWlFormError(null)
        const [sumRes, tplRes] = await Promise.all([
          api.facultyAllocation.getWorkloadSummary(semester),
          api.facultyAllocation.getWorkloadTemplates(),
        ])
        setWlSummary(sumRes)
        setWlTemplates(tplRes)
        setWlFacultyList(sumRes.facultySummaries ?? [])
        setStagedAllocations(sumRes.stagedAllocations ?? [])
        setWlSelectedSubject('')
        setWlSelectedTemplate('')
        setWlSelectedFaculty('')
        setWlSelectedSections([])
      } catch (err: any) {
        setNotification({ type: 'error', message: err?.message || 'Failed to load workload summary' })
      } finally {
        setWlLoading(false)
      }
    })()
  }, [activeTab, semester])

  const refreshWorkload = async () => {
    if (!semester) return
    const [sumRes, tplRes] = await Promise.all([
      api.facultyAllocation.getWorkloadSummary(semester),
      api.facultyAllocation.getWorkloadTemplates(),
    ])
    setWlSummary(sumRes)
    setWlTemplates(tplRes)
    setWlFacultyList(sumRes.facultySummaries ?? [])
    setStagedAllocations(sumRes.stagedAllocations ?? [])
  }

  const handleStageAllocation = async () => {
    setWlFormError(null)
    if (!wlSelectedSubject || !wlSelectedTemplate || !wlSelectedFaculty) {
      setWlFormError('Please select a subject, template, and faculty.')
      return
    }
    try {
      setWlStaging(true)
      const result = await api.facultyAllocation.allocateWorkload({
        semester,
        subjectId: wlSelectedSubject,
        templateId: wlSelectedTemplate,
        facultyId: wlSelectedFaculty,
      })
      setStagedAllocations(prev => [...prev, result])
      setNotification({ type: 'success', message: 'Allocation staged. Review and click Approve to commit.' })
      await refreshWorkload()
    } catch (err: any) {
      setWlFormError(err?.message || 'Staging failed.')
    } finally {
      setWlStaging(false)
    }
  }

  const handleApproveAllocations = async () => {
    try {
      setWlApproving(true)
      const res = await api.facultyAllocation.approveWorkloadAllocation(semester)
      setNotification({ type: 'success', message: `Approved ${res.approvedAllocationsCount} allocations → ${res.syncedTeachingAssignmentsCount} teaching assignments synced.` })
      setStagedAllocations([])
      await refreshWorkload()
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Approval failed.' })
    } finally {
      setWlApproving(false)
    }
  }

  const handleCreateTemplate = async () => {
    if (!wlNewTemplateName.trim()) { setWlFormError('Template name is required.'); return }
    const t = parseInt(wlNewTemplateT, 10)
    const l = parseInt(wlNewTemplateL, 10)
    if (isNaN(t) || isNaN(l) || t + l === 0) { setWlFormError('Template must have at least 1 theory or lab period.'); return }
    try {
      setWlCreatingTemplate(true)
      const created = await api.facultyAllocation.createWorkloadTemplate({ name: wlNewTemplateName.trim(), theoryPeriodsPerSection: t, labPeriodsPerSection: l })
      setWlTemplates(prev => [...prev, created])
      setWlNewTemplateName('')
      setWlNewTemplateT('')
      setWlNewTemplateL('')
      setNotification({ type: 'success', message: `Template '${created.name}' created.` })
    } catch (err: any) {
      setWlFormError(err?.message || 'Template creation failed.')
    } finally {
      setWlCreatingTemplate(false)
    }
  }

  const handleEditTemplateSave = async () => {
    if (!wlEditingTemplate) return
    const { id, name, theoryPeriodsPerSection, labPeriodsPerSection } = wlEditingTemplate
    if (!name.trim()) { setWlFormError('Template name is required.'); return }
    if (theoryPeriodsPerSection + labPeriodsPerSection === 0) { setWlFormError('Template must have at least 1 theory or lab period.'); return }
    try {
      const updated = await api.facultyAllocation.updateWorkloadTemplate(id, { name: name.trim(), theoryPeriodsPerSection, labPeriodsPerSection })
      setWlTemplates(prev => prev.map(t => t.id === id ? updated : t))
      setWlEditingTemplate(null)
      setNotification({ type: 'success', message: `Template '${updated.name}' updated.` })
    } catch (err: any) {
      setWlFormError(err?.message || 'Template update failed.')
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    setWlDeletingTemplateId(id)
    try {
      await api.facultyAllocation.deleteWorkloadTemplate(id)
      setWlTemplates(prev => prev.filter(t => t.id !== id))
      if (wlSelectedTemplate === id) setWlSelectedTemplate('')
      setNotification({ type: 'success', message: 'Template deleted.' })
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Delete failed.' })
    } finally {
      setWlDeletingTemplateId(null)
    }
  }

  /** Re-fetch the HOD review data (rows + summary + demand) from the backend
   *  after any mutating action so every counter reflects live DB state. */
  const refreshHodData = async () => {
    const res = await api.facultyAllocation.getHodPreferences(semester)
    setFacultyRows(res.facultyRows ?? [])
    setSummary(res.summary ?? null)
    setDemandList(res.demand ?? [])
  }

  /** Single-click APPROVE: "Faculty X may teach Subject Y". Never allocates
   *  sections — that stays the separate Section Allocation step. */
  const handleApprove = async (preferenceId: number) => {
    try {
      await api.facultyAllocation.reviewPreference(preferenceId, 'APPROVED')
      setNotification({ type: 'success', message: `Preference #${preferenceId} APPROVED. Approved capacity is now available in Section Allocation.` })
      await refreshHodData()
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Approval failed' })
    }
  }

  const openReviewModal = (opt: OptionRow, status: 'CHANGES_REQUESTED' | 'REJECTED') => {
    setReviewModal({ preferenceId: opt.preferenceId, status, comment: '', subjectCode: opt.subjectCode })
  }

  const confirmReviewModal = async () => {
    if (!reviewModal) return
    if (reviewModal.status === 'REJECTED' && reviewModal.comment.trim().length === 0) {
      setNotification({ type: 'error', message: 'A reason is required when rejecting a preference.' })
      return
    }
    try {
      setReviewSubmitting(true)
      await api.facultyAllocation.reviewPreference(
        reviewModal.preferenceId,
        reviewModal.status,
        reviewModal.comment.trim() || undefined,
      )
      setNotification({ type: 'success', message: `Preference #${reviewModal.preferenceId} → ${reviewModal.status.replace('_', ' ')}.` })
      setReviewModal(null)
      await refreshHodData()
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Action failed' })
    } finally {
      setReviewSubmitting(false)
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
      await refreshHodData()
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

  // ALL SEM: filtered demand list based on semester filter
  const allSemFilteredDemand = useMemo(() => {
    let list = allSemDemandList
    if (allSemSemFilter !== 'all') {
      list = list.filter(d => d.semester === allSemSemFilter)
    }
    return list
  }, [allSemDemandList, allSemSemFilter])

  // ALL SEM: filtered preference rows
  const allSemFilteredPrefRows = useMemo(() => {
    let rows = allSemPrefRows
    if (allSemSemFilter !== 'all') {
      rows = rows.filter(row => row.options.some((o: any) => o.semester === allSemSemFilter))
    }
    return rows
  }, [allSemPrefRows, allSemSemFilter])

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="font-display font-800 text-lg text-[#0F4C81] flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#0F4C81]" />
          Faculty Subject Allocation
          {cycle && <span className="ml-2 px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0F4C81] border border-blue-200 text-[11px] font-600">{cycle}</span>}
        </h1>

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
          <button
            onClick={() => setActiveTab('all-sem')}
            className={`px-4 py-2 rounded-lg text-xs font-600 transition flex items-center gap-2 ${activeTab === 'all-sem' ? 'bg-[#0F4C81] text-white shadow-sm' : 'text-slate-500 hover:text-[#0F4C81]'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> ALL SEM
          </button>
          <button
            onClick={() => setActiveTab('workload')}
            className={`px-4 py-2 rounded-lg text-xs font-600 transition flex items-center gap-2 ${activeTab === 'workload' ? 'bg-[#0F4C81] text-white shadow-sm' : 'text-slate-500 hover:text-[#0F4C81]'}`}
          >
            <ClipboardList className="w-3.5 h-3.5" /> Workload
          </button>
        </div>
      </div>

      {/* Semester context selector — only current-cycle semesters, hidden in ALL SEM */}
      {activeTab !== 'all-sem' && (
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
      )}

      {/* ALL SEM filter bar */}
      {activeTab === 'all-sem' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-700 text-slate-400 uppercase tracking-wider">Filter</span>
            <select
              value={allSemSemFilter}
              onChange={e => setAllSemSemFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-600 border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
            >
              <option value="all">All Semesters</option>
              {allSemConfiguredSemesters.map(s => (
                <option key={s} value={s}>Semester {s} · {SEMESTER_TO_YEAR[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setAllSemSubTab('faculty')}
              className={`px-3 py-1.5 rounded-md text-[11px] font-600 transition flex items-center gap-1.5 ${allSemSubTab === 'faculty' ? 'bg-white text-[#0F4C81] shadow-sm' : 'text-slate-500 hover:text-[#0F4C81]'}`}
            >
              <Users className="w-3 h-3" /> Faculty
            </button>
            <button
              onClick={() => setAllSemSubTab('subject')}
              className={`px-3 py-1.5 rounded-md text-[11px] font-600 transition flex items-center gap-1.5 ${allSemSubTab === 'subject' ? 'bg-white text-[#0F4C81] shadow-sm' : 'text-slate-500 hover:text-[#0F4C81]'}`}
            >
              <Layers className="w-3 h-3" /> Subject
            </button>
          </div>
        </div>
      )}

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
            <h2 className="text-xs font-700 text-slate-500 flex items-center gap-2">
              <LockKeyhole className="w-4 h-4 text-[#0F4C81]" /> Confirmed Allocation — Semester {semester || '—'}
            </h2>

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
                          <td className="py-3 px-3 text-[#0F4C81] font-700">{row.allocationExperience != null ? <>{row.allocationExperience} <span className="text-[10px] font-500 text-slate-500">yrs</span></> : '—'}</td>
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
          {/* DB-derived review summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'Total Faculty', value: summary?.totalFaculty ?? '—', tone: 'text-slate-800' },
              { label: 'Not Submitted', value: summary?.notSubmitted ?? '—', tone: 'text-slate-400' },
              { label: 'Submitted', value: summary?.submitted ?? '—', tone: 'text-[#0F4C81]' },
              { label: 'Approved', value: summary?.approved ?? '—', tone: 'text-emerald-700' },
              { label: 'Changes Requested', value: summary?.changesRequested ?? '—', tone: 'text-amber-600' },
              { label: 'Rejected', value: summary?.rejected ?? '—', tone: 'text-rose-600' },
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
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-center">Theory</th>
                      <th className="py-2.5 px-3 text-center">Lab</th>
                      <th className="py-2.5 px-3 text-center">Required</th>
                      <th className="py-2.5 px-3 text-center">Approved</th>
                      <th className="py-2.5 px-3 text-center">Assigned</th>
                      <th className="py-2.5 px-3 text-center">Shortage</th>
                      <th className="py-2.5 px-3 text-center">Interest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {demandList.map(d => {
                      return (
                      <tr key={d.subjectId} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-3 font-600 text-[#0F4C81]">{d.subjectCode}</td>
                        <td className="py-2.5 px-3 text-slate-800 font-600">{d.subjectName}</td>
                        <td className="py-2.5 px-3">
                          <DeliveryBadge deliveryType={d.deliveryType} />
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-700">{d.requiredTheoryPeriods ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center text-slate-700">{d.requiredLabPeriods ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center text-slate-700">{d.requiredSections}</td>
                        <td className="py-2.5 px-3 text-center text-emerald-700 font-700">{d.approvedSectionTotal ?? 0}</td>
                        <td className="py-2.5 px-3 text-center text-[#0F4C81] font-700">{d.assignedSections ?? 0}</td>
                        <td className="py-2.5 px-3 text-center text-amber-700 font-700">{Math.max(0, d.requiredSections - (d.approvedSectionTotal ?? 0))}</td>
                        <td className="py-2.5 px-3 text-center text-slate-500">{d.facultyInterestedCount} 👥</td>
                      </tr>
                      )
                    })}
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
                          <td className="py-3 px-3 text-[#0F4C81] font-700">{row.allocationExperience != null ? <>{row.allocationExperience} <span className="text-[10px] font-500 text-slate-500">yrs</span></> : '—'}</td>
                          <td className="py-3 px-3 text-slate-600">{row.band}</td>
                          <td className="py-3 px-3">{o1 ? <OptionCell opt={o1} /> : <span className="text-slate-400">-</span>}</td>
                          <td className="py-3 px-3">{o2 ? <OptionCell opt={o2} /> : <span className="text-slate-400">-</span>}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-700 ${STATUS_TONE[row.status] ?? STATUS_TONE.DRAFT}`}>{row.status}</span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col items-start gap-3">
                              {row.options.map(opt => (
                                <ReviewActions
                                  key={opt.preferenceId}
                                  opt={opt}
                                  onApprove={() => handleApprove(opt.preferenceId)}
                                  onRequestChanges={() => openReviewModal(opt, 'CHANGES_REQUESTED')}
                                  onReject={() => openReviewModal(opt, 'REJECTED')}
                                  onEdit={() => setEditing({ preferenceId: opt.preferenceId, subjectId: opt.subjectId, requestedSections: opt.requestedSections })}
                                  onView={() => setViewing(opt)}
                                />
                              ))}
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
                        <p className="text-xs text-slate-500">Delivery: <strong className="text-slate-700">{getDeliveryTypeLabel(subj.deliveryType)}</strong></p>
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

      {/* TAB: ALL SEM */}
      {activeTab === 'all-sem' && (
        <div className="space-y-5">
          {/* Faculty sub-tab */}
          {allSemSubTab === 'faculty' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              {allSemPrefLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading…</div>
              ) : allSemFilteredPrefRows.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">No preferences found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                        <th className="py-2.5 px-3 sticky left-0 bg-slate-50/90 z-10">Faculty</th>
                        <th className="py-2.5 px-3">ID</th>
                        <th className="py-2.5 px-3 text-center">Exp</th>
                        <th className="py-2.5 px-3">Band</th>
                        <th className="py-2.5 px-3 border-l-2 border-slate-200">Preference 1</th>
                        <th className="py-2.5 px-3 text-center">Sections</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Sem</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 border-l-2 border-slate-200">Preference 2</th>
                        <th className="py-2.5 px-3 text-center">Sections</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Sem</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Overall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allSemFilteredPrefRows.map(row => {
                        const sorted = [...row.options].sort((a: any, b: any) => a.rank - b.rank)
                        const o1 = sorted[0]; const o2 = sorted[1]
                        const prefCell = (o: any) => o ? (
                          <>
                            <td className="py-2.5 px-3 border-l-2 border-slate-100">
                              <div className="font-600 text-[#0F4C81]">{o.subjectCode}</div>
                              <div className="text-slate-500 text-[10px]">{o.subjectName}</div>
                            </td>
                            <td className="py-2.5 px-3 text-center">{o.requestedSections ?? '—'}</td>
                            <td className="py-2.5 px-3">
                              <DeliveryBadge deliveryType={o.deliveryType} />
                            </td>
                            <td className="py-2.5 px-3">
                              {o.semester ? <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0F4C81] border border-blue-200 text-[10px] font-700">Sem {o.semester}</span> : '—'}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-700 ${STATUS_TONE[o.status] ?? STATUS_TONE.DRAFT}`}>{o.status}</span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 px-3 border-l-2 border-slate-100"><span className="text-slate-300">—</span></td>
                            <td className="py-2.5 px-3 text-center"><span className="text-slate-300">—</span></td>
                            <td className="py-2.5 px-3"><span className="text-slate-300">—</span></td>
                            <td className="py-2.5 px-3"><span className="text-slate-300">—</span></td>
                            <td className="py-2.5 px-3"><span className="text-slate-300">—</span></td>
                          </>
                        )
                        return (
                          <tr key={row.facultyId} className="align-top hover:bg-slate-50/60 transition">
                            <td className="py-2.5 px-3 sticky left-0 bg-white/90 z-10">
                              <div className="font-600 text-slate-800">{row.facultyName}</div>
                              <div className="text-slate-500 text-[10px]">{row.designation}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600 text-[10px]">{row.facultyId}</td>
                            <td className="py-2.5 px-3 text-[#0F4C81] font-700 text-center">{row.allocationExperience != null ? <>{row.allocationExperience} <span className="text-[10px] font-500 text-slate-500">yrs</span></> : '—'}</td>
                            <td className="py-2.5 px-3 text-slate-600">{row.band}</td>
                            {prefCell(o1)}
                            {prefCell(o2)}
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-700 ${STATUS_TONE[row.overallStatus] ?? STATUS_TONE.DRAFT}`}>{row.overallStatus}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Subject sub-tab */}
          {allSemSubTab === 'subject' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              {allSemDemandLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading…</div>
              ) : allSemFilteredDemand.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">No demand data available.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                        <th className="py-2.5 px-3">Subject</th>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Sem</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-center">Sections Req</th>
                        <th className="py-2.5 px-3 text-center">Allocated</th>
                        <th className="py-2.5 px-3 text-center">Theory / Wk</th>
                        <th className="py-2.5 px-3 text-center">Lab / Wk</th>
                        <th className="py-2.5 px-3 text-center">Total Hrs / Sem</th>
                        <th className="py-2.5 px-3 text-center">Interested</th>
                        <th className="py-2.5 px-3 text-center">Gap</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {allSemFilteredDemand.map(d => {
                        const allocated = d.approvedSectionTotal ?? 0
                        const gap = d.requiredSections - allocated
                        const totalHrsSem = d.requiredPeriodsWeekly * 16
                        return (
                          <tr key={`${d.semester}-${d.subjectId}`} className="hover:bg-slate-50/60 transition">
                            <td className="py-2.5 px-3 font-600 text-slate-800">{d.subjectName}</td>
                            <td className="py-2.5 px-3 font-600 text-[#0F4C81]">{d.subjectCode}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0F4C81] border border-blue-200 text-[10px] font-700">Sem {d.semester}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <DeliveryBadge deliveryType={d.deliveryType} />
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-700">{d.requiredSections}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={allocated >= d.requiredSections ? 'text-emerald-700 font-700' : 'text-amber-700 font-700'}>{allocated}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-600">{d.requiredTheoryPeriods ?? 0}</td>
                            <td className="py-2.5 px-3 text-center text-slate-600">{d.requiredLabPeriods ?? 0}</td>
                            <td className="py-2.5 px-3 text-center text-slate-600">{totalHrsSem}</td>
                            <td className="py-2.5 px-3 text-center text-[#0F4C81] font-600">{d.submittedCount}</td>
                            <td className="py-2.5 px-3 text-center">
                              {gap > 0 ? <span className="text-amber-700 font-700">{gap}</span> : <span className="text-emerald-700">✓</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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

      {/* Review comment modal — Request Changes / Reject (comment goes to the faculty) */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-700 flex items-center gap-2">
                {reviewModal.status === 'CHANGES_REQUESTED'
                  ? <><AlertCircle className="w-4 h-4 text-amber-600" /> Request Changes · Preference #{reviewModal.preferenceId}</>
                  : <><XCircle className="w-4 h-4 text-rose-600" /> Reject · Preference #{reviewModal.preferenceId}</>}
              </h3>
              <button onClick={() => setReviewModal(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {reviewModal.status === 'CHANGES_REQUESTED'
                ? <>Tell the faculty what to change for <strong className="text-slate-700">{reviewModal.subjectCode}</strong>. The preference is unlocked and they can edit &amp; resubmit it.</>
                : <>Provide the reason you are rejecting <strong className="text-slate-700">{reviewModal.subjectCode}</strong>. The faculty will see it.</>}
            </p>
            <div>
              <label className="block text-[11px] font-700 text-slate-400 uppercase tracking-wider mb-1">
                {reviewModal.status === 'REJECTED' ? 'Reason (required)' : 'Comment (optional)'}
              </label>
              <textarea
                autoFocus
                rows={3}
                value={reviewModal.comment}
                onChange={e => setReviewModal({ ...reviewModal, comment: e.target.value })}
                placeholder={reviewModal.status === 'REJECTED' ? 'e.g. Subject already staffed by another faculty member…' : 'e.g. Please reduce requested sections to 1…'}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setReviewModal(null)} className="px-4 py-2 rounded-lg bg-white text-slate-600 border border-slate-200 text-xs font-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={confirmReviewModal}
                disabled={reviewSubmitting || (reviewModal.status === 'REJECTED' && reviewModal.comment.trim().length === 0)}
                className={`px-4 py-2 rounded-lg text-white text-xs font-600 shadow-sm hover:brightness-95 disabled:opacity-50 ${reviewModal.status === 'CHANGES_REQUESTED' ? 'bg-amber-600' : 'bg-rose-600'}`}
              >
                {reviewSubmitting ? 'Saving…' : reviewModal.status === 'CHANGES_REQUESTED' ? 'Request Changes' : 'Reject Preference'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View modal — approved / review details (audit trail, no further review actions) */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-700 flex items-center gap-2"><Eye className="w-4 h-4 text-[#0F4C81]" /> Preference #{viewing.preferenceId}</h3>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Subject</span>
                <span className="font-600 text-slate-800 text-right">{viewing.subjectCode} — {viewing.subjectName}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Requested Sections</span>
                <span className="font-600 text-slate-800">{viewing.requestedSections} section{viewing.requestedSections === 1 ? '' : 's'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Lab Confirmation</span>
                <span className="font-600 text-slate-800">{viewing.labConfirmed ? '🧪 Confirmed' : 'Not confirmed'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Status</span>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-700 ${STATUS_TONE[viewing.status] ?? STATUS_TONE.DRAFT}`}>{viewing.status.replace('_', ' ')}</span>
              </div>
              {viewing.reviewedBy && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Reviewed By</span>
                  <span className="font-600 text-slate-800">{viewing.reviewedBy}</span>
                </div>
              )}
              {viewing.reviewedAt && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Reviewed At</span>
                  <span className="font-600 text-slate-800">{new Date(viewing.reviewedAt).toLocaleString()}</span>
                </div>
              )}
              {viewing.hodComment && (
                <div>
                  <span className="text-slate-400 block mb-1">HOD Comment</span>
                  <p className="italic bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700">{viewing.hodComment}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setViewing(null)} className="px-4 py-2 rounded-lg bg-[#0F4C81] text-white text-xs font-600 hover:bg-[#0a3860]">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: WORKLOAD ALLOCATION WORKSPACE ───────────────────────────── */}
      {activeTab === 'workload' && (
        <div className="space-y-5">
          {/* Subject Workload Summary */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-700 text-slate-500 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0F4C81]" /> Subject Workload — Semester {semester || '—'}
            </h2>
            {wlLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading workload summary…</div>
            ) : (wlSummary?.subjectSummaries ?? []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No subjects configured for Semester {semester}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Code</th>
                      <th className="py-2.5 px-3">Subject</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-center">Sections</th>
                      <th className="py-2.5 px-3 text-center">T Req</th>
                      <th className="py-2.5 px-3 text-center">T Asgn</th>
                      <th className="py-2.5 px-3 text-center">T Rem</th>
                      <th className="py-2.5 px-3 text-center">L Req</th>
                      <th className="py-2.5 px-3 text-center">L Asgn</th>
                      <th className="py-2.5 px-3 text-center">L Rem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(wlSummary?.subjectSummaries ?? []).map((sub: any) => {
                      const tFull = sub.remainingTheory === 0 && sub.requiredTheory > 0
                      const lFull = sub.remainingLab === 0 && sub.requiredLab > 0
                      return (
                        <tr key={sub.subjectId} className="hover:bg-slate-50/60 transition">
                          <td className="py-2 px-3 font-600 text-[#0F4C81]">{sub.subjectCode}</td>
                          <td className="py-2 px-3 text-slate-800">{sub.subjectName}</td>
                          <td className="py-2 px-3"><DeliveryBadge deliveryType={sub.deliveryType} /></td>
                          <td className="py-2 px-3 text-center text-slate-600">{sub.sectionCount}</td>
                          <td className="py-2 px-3 text-center text-slate-600">{sub.requiredTheory}</td>
                          <td className="py-2 px-3 text-center text-[#0F4C81] font-700">{sub.assignedTheory}</td>
                          <td className={`py-2 px-3 text-center font-700 ${tFull ? 'text-emerald-600' : sub.remainingTheory > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{sub.remainingTheory}</td>
                          <td className="py-2 px-3 text-center text-slate-600">{sub.requiredLab}</td>
                          <td className="py-2 px-3 text-center text-[#0F4C81] font-700">{sub.assignedLab}</td>
                          <td className={`py-2 px-3 text-center font-700 ${lFull ? 'text-emerald-600' : sub.remainingLab > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{sub.remainingLab}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Template Manager */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-700 text-slate-500 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#0F4C81]" /> Workload Templates
            </h2>

            {/* Templates table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-4">Name</th>
                    <th className="py-2.5 px-4 text-center">Theory / sec</th>
                    <th className="py-2.5 px-4 text-center">Lab / sec</th>
                    <th className="py-2.5 px-4 text-center">Total / sec</th>
                    <th className="py-2.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wlTemplates.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                        No templates yet. Add one below.
                      </td>
                    </tr>
                  )}
                  {wlTemplates.map((t: any) => {
                    const et = wlEditingTemplate
                    if (et && et.id === t.id) {
                      return (
                        /* Inline edit row */
                        <tr key={t.id} className="bg-blue-50/40">
                          <td className="py-2 px-3">
                            <input
                              autoFocus
                              value={et.name}
                              onChange={e => setWlEditingTemplate({ ...et, name: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-[#0F4C81]/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number" min={0}
                              value={et.theoryPeriodsPerSection}
                              onChange={e => setWlEditingTemplate({ ...et, theoryPeriodsPerSection: Number(e.target.value) })}
                              className="w-16 px-2 py-1 text-xs border border-[#0F4C81]/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 text-center mx-auto block"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number" min={0}
                              value={et.labPeriodsPerSection}
                              onChange={e => setWlEditingTemplate({ ...et, labPeriodsPerSection: Number(e.target.value) })}
                              className="w-16 px-2 py-1 text-xs border border-[#0F4C81]/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 text-center mx-auto block"
                            />
                          </td>
                          <td className="py-2 px-3 text-center text-slate-500">
                            {et.theoryPeriodsPerSection + et.labPeriodsPerSection}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={handleEditTemplateSave}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-700 hover:bg-emerald-100 transition"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Save
                              </button>
                              <button
                                onClick={() => setWlEditingTemplate(null)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-[10px] font-700 hover:bg-slate-50 transition"
                              >
                                <X className="w-3 h-3" /> Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }
                    return (
                      /* Normal row */
                      <tr key={t.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-4 font-600 text-slate-800">{t.name}</td>
                        <td className="py-2.5 px-4 text-center text-[#0F4C81] font-700">{t.theoryPeriodsPerSection}</td>
                        <td className="py-2.5 px-4 text-center text-emerald-700 font-700">{t.labPeriodsPerSection}</td>
                        <td className="py-2.5 px-4 text-center text-slate-700 font-600">{t.theoryPeriodsPerSection + t.labPeriodsPerSection}</td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setWlEditingTemplate({ id: t.id, name: t.name, theoryPeriodsPerSection: t.theoryPeriodsPerSection, labPeriodsPerSection: t.labPeriodsPerSection })}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-blue-200 bg-blue-50 text-[#0F4C81] text-[10px] font-700 hover:bg-blue-100 transition"
                              title="Edit template"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(t.id)}
                              disabled={wlDeletingTemplateId === t.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-700 hover:bg-rose-100 transition disabled:opacity-50"
                              title="Delete template"
                            >
                              <X className="w-3 h-3" /> {wlDeletingTemplateId === t.id ? '…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Add new template row */}
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-700 text-slate-400 uppercase tracking-wider mb-2">Add New Template</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">Name</label>
                  <input
                    value={wlNewTemplateName}
                    onChange={e => setWlNewTemplateName(e.target.value)}
                    placeholder="e.g. 3T+2L"
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 w-36"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">Theory / sec</label>
                  <input
                    type="number" min={0}
                    value={wlNewTemplateT}
                    onChange={e => setWlNewTemplateT(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 w-20"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">Lab / sec</label>
                  <input
                    type="number" min={0}
                    value={wlNewTemplateL}
                    onChange={e => setWlNewTemplateL(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 w-20"
                  />
                </div>
                <button
                  id="wl-create-template-btn"
                  onClick={handleCreateTemplate}
                  disabled={wlCreatingTemplate}
                  className="px-4 py-1.5 rounded-lg bg-[#0F4C81] text-white text-xs font-700 hover:bg-[#0a3d6b] transition disabled:opacity-50"
                >
                  {wlCreatingTemplate ? 'Creating…' : '+ Add Template'}
                </button>
              </div>
            </div>
          </div>


          {/* Stage Allocation Form */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-700 text-slate-500 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#0F4C81]" /> Stage New Allocation
            </h2>
            {wlFormError && (
              <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-600 flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5" /> {wlFormError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Subject */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">Subject</label>
                <select
                  id="wl-subject-select"
                  value={wlSelectedSubject}
                  onChange={e => setWlSelectedSubject(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 bg-white"
                >
                  <option value="">— Select Subject —</option>
                  {(wlSummary?.subjectSummaries ?? []).map((s: any) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      {s.subjectCode} — {s.subjectName}
                    </option>
                  ))}
                </select>
              </div>
              {/* Template */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">Template</label>
                <select
                  id="wl-template-select"
                  value={wlSelectedTemplate}
                  onChange={e => setWlSelectedTemplate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 bg-white"
                >
                  <option value="">— Select Template —</option>
                  {wlTemplates.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (T:{t.theoryPeriodsPerSection} L:{t.labPeriodsPerSection})
                    </option>
                  ))}
                </select>
              </div>
              {/* Faculty */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">Faculty</label>
                <select
                  id="wl-faculty-select"
                  value={wlSelectedFaculty}
                  onChange={e => setWlSelectedFaculty(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 bg-white"
                >
                  <option value="">— Select Faculty —</option>
                  {wlFacultyList.map((f: any) => (
                    <option key={f.facultyId} value={f.facultyId} disabled={f.remainingCapacity === 0}>
                      {f.facultyName} ({f.totalWorkload}/{f.maximumWorkload} periods{f.remainingCapacity === 0 ? ' · FULL' : ''})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Subject Workload Tracker — shown as soon as a subject is selected */}
            {wlSelectedSubject && (() => {
              const selSubj = (wlSummary?.subjectSummaries ?? []).find((s: any) => s.subjectId === wlSelectedSubject)
              if (!selSubj) return null
              const totalT = selSubj.requiredTheory
              const totalL = selSubj.requiredLab
              const assignedT = selSubj.assignedTheory
              const assignedL = selSubj.assignedLab
              const remT = selSubj.remainingTheory
              const remL = selSubj.remainingLab
              const totalPeriods = totalT + totalL
              const assignedPeriods = assignedT + assignedL
              const pct = totalPeriods > 0 ? Math.round((assignedPeriods / totalPeriods) * 100) : 0
              const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-[#0F4C81]' : 'bg-amber-400'
              const remPeriods = remT + remL
              return (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">Subject Workload</p>
                      <p className="text-sm font-700 text-slate-800 mt-0.5">{selSubj.subjectCode} — {selSubj.subjectName}</p>
                    </div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-700 border ${pct >= 100 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                      {pct >= 100 ? '✓ Fully Assigned' : `${remPeriods} periods remaining`}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Assigned: <strong className="text-slate-700">{assignedPeriods}</strong></span>
                      <span>Total: <strong className="text-slate-700">{totalPeriods}</strong></span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="text-right text-[10px] text-slate-400">{pct}% assigned</div>
                  </div>

                  {/* Theory / Lab breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {[
                      { label: 'Theory Required', val: totalT, tone: 'text-slate-700' },
                      { label: 'Theory Assigned', val: assignedT, tone: 'text-[#0F4C81] font-700' },
                      { label: 'Lab Required', val: totalL, tone: 'text-slate-700' },
                      { label: 'Lab Assigned', val: assignedL, tone: 'text-emerald-700 font-700' },
                    ].map(item => (
                      <div key={item.label} className="bg-white border border-slate-200 rounded-lg p-2.5 text-center">
                        <div className="text-[9px] text-slate-400 uppercase tracking-wider">{item.label}</div>
                        <div className={`text-lg font-800 font-display mt-0.5 ${item.tone}`}>{item.val}</div>
                        <div className="text-[9px] text-slate-400">periods</div>
                      </div>
                    ))}
                  </div>

                  {remPeriods > 0 && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                      ⚠ Still needs: <strong>{remT > 0 ? `${remT} theory` : ''}{remT > 0 && remL > 0 ? ' + ' : ''}{remL > 0 ? `${remL} lab` : ''}</strong> period{remPeriods === 1 ? '' : 's'} assigned.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Workload Preview + Faculty Capacity — shown once subject, template and faculty are chosen */}
            {wlSelectedSubject && wlSelectedTemplate && wlSelectedFaculty && (() => {
              const tmpl = wlTemplates.find((t: any) => t.id === wlSelectedTemplate)
              const facInfo = wlFacultyList.find((f: any) => f.facultyId === wlSelectedFaculty)
              const selSubj = (wlSummary?.subjectSummaries ?? []).find((s: any) => s.subjectId === wlSelectedSubject)
              const nSections = 1
              const previewT = tmpl ? tmpl.theoryPeriodsPerSection * nSections : 0
              const previewL = tmpl ? tmpl.labPeriodsPerSection * nSections : 0
              const previewTotal = previewT + previewL
              const projectedTotal = facInfo ? facInfo.totalWorkload + previewTotal : previewTotal
              const overCapacity = facInfo ? projectedTotal > facInfo.maximumWorkload : false
              const overSubjectT = selSubj ? previewT > selSubj.remainingTheory : false
              const overSubjectL = selSubj ? previewL > selSubj.remainingLab : false
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1.5">
                    <div className="text-[10px] font-700 text-[#0F4C81] uppercase tracking-wider">Workload Preview</div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500">Template:</span>
                      <span className="font-700 text-slate-800">{tmpl ? `${tmpl.theoryPeriodsPerSection}T + ${tmpl.labPeriodsPerSection}L per section` : '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500">Section Allocation:</span>
                      <span className="font-600 text-emerald-700">Auto (Solver Random Assignment)</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500">Total Theory:</span>
                      <span className={`font-700 ${overSubjectT ? 'text-rose-600' : 'text-[#0F4C81]'}`}>{previewT} periods{overSubjectT ? ' ⚠ exceeds remaining' : ''}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500">Total Lab:</span>
                      <span className={`font-700 ${overSubjectL ? 'text-rose-600' : 'text-[#0F4C81]'}`}>{previewL} periods{overSubjectL ? ' ⚠ exceeds remaining' : ''}</span>
                    </div>
                    {selSubj && (
                      <div className="pt-1 border-t border-blue-200 flex flex-wrap gap-3 text-[10px]">
                        <span className="text-slate-500">Subj T rem: <span className="font-700 text-amber-600">{selSubj.remainingTheory}</span></span>
                        <span className="text-slate-500">Subj L rem: <span className="font-700 text-amber-600">{selSubj.remainingLab}</span></span>
                      </div>
                    )}
                  </div>
                  {facInfo && (
                    <div className={`rounded-lg border p-3 space-y-1.5 ${overCapacity ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
                      <div className={`text-[10px] font-700 uppercase tracking-wider ${overCapacity ? 'text-rose-700' : 'text-emerald-700'}`}>Faculty Capacity</div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">Existing:</span>
                        <span className="font-700 text-slate-800">{facInfo.existingWorkload} periods</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">Staged (DRAFT):</span>
                        <span className="font-700 text-slate-800">{facInfo.newAllocation} periods</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">This allocation:</span>
                        <span className="font-700 text-[#0F4C81]">+{previewTotal} periods</span>
                      </div>
                      <div className={`flex items-center gap-3 text-xs border-t pt-1 ${overCapacity ? 'border-rose-200' : 'border-emerald-200'}`}>
                        <span className="text-slate-500">Projected total:</span>
                        <span className={`font-700 ${overCapacity ? 'text-rose-600' : 'text-emerald-600'}`}>{projectedTotal} / {facInfo.maximumWorkload}{overCapacity ? ' ⚠ OVER CAPACITY' : ''}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            <div className="flex items-center gap-3 pt-2">
              <button
                id="wl-stage-btn"
                onClick={handleStageAllocation}
                disabled={wlStaging || !wlSelectedSubject || !wlSelectedTemplate || !wlSelectedFaculty}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0F4C81] text-white text-xs font-700 hover:bg-[#0a3d6b] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                {wlStaging ? 'Staging…' : 'Stage Allocation'}
              </button>

              {stagedAllocations.length > 0 && (
                <button
                  id="wl-approve-btn"
                  onClick={handleApproveAllocations}
                  disabled={wlApproving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-700 hover:bg-emerald-700 transition disabled:opacity-40 shadow-sm"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {wlApproving ? 'Approving…' : `Approve ${stagedAllocations.length} Staged`}
                </button>
              )}
            </div>
          </div>

          {/* Staged allocations queue */}
          {stagedAllocations.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5 space-y-3">
              <h2 className="text-xs font-700 text-amber-600 flex items-center gap-2">
                <MessageSquareWarning className="w-4 h-4" /> Staged (Pending Approval) — {stagedAllocations.length} allocation{stagedAllocations.length > 1 ? 's' : ''}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                      <th className="py-2 px-3">Faculty</th>
                      <th className="py-2 px-3">Subject</th>
                      <th className="py-2 px-3">Section Assignment</th>
                      <th className="py-2 px-3 text-center">T Periods</th>
                      <th className="py-2 px-3 text-center">L Periods</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stagedAllocations.map((a: any, idx: number) => {
                      const facName = a.facultyName || wlFacultyList.find((f: any) => f.facultyId === a.facultyId)?.facultyName || a.facultyId
                      const subObj = (wlSummary?.subjectSummaries ?? []).find((s: any) => s.subjectId === a.subjectId)
                      const subLabel = a.subjectCode ? `${a.subjectCode} — ${a.subjectName || ''}` : (subObj ? `${subObj.subjectCode} — ${subObj.subjectName}` : a.subjectId)
                      return (
                        <tr key={idx} className="hover:bg-amber-50/30 transition">
                          <td className="py-2 px-3 font-600 text-slate-800">{facName}</td>
                          <td className="py-2 px-3 text-slate-700">{subLabel}</td>
                          <td className="py-2 px-3 text-emerald-700 font-600">Auto (Solver Random)</td>
                          <td className="py-2 px-3 text-center text-[#0F4C81] font-700">{a.totalTheoryPeriods}</td>
                          <td className="py-2 px-3 text-center text-emerald-700 font-700">{a.totalLabPeriods}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Faculty Capacity Overview */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h2 className="text-xs font-700 text-slate-500 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0F4C81]" /> Faculty Capacity Overview
            </h2>
            {wlLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Loading…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Faculty</th>
                      <th className="py-2.5 px-3">Designation</th>
                      <th className="py-2.5 px-3 text-center">Existing</th>
                      <th className="py-2.5 px-3 text-center">New (Staged)</th>
                      <th className="py-2.5 px-3 text-center">Total</th>
                      <th className="py-2.5 px-3 text-center">Max</th>
                      <th className="py-2.5 px-3 text-center">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wlFacultyList.map((f: any) => {
                      const pct = f.maximumWorkload > 0 ? Math.round((f.totalWorkload / f.maximumWorkload) * 100) : 0
                      const barColor = pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
                      return (
                        <tr key={f.facultyId} className="hover:bg-slate-50/60 transition align-middle">
                          <td className="py-2.5 px-3">
                            <div className="font-600 text-slate-800">{f.facultyName}</div>
                            <div className="text-slate-400 text-[10px] font-mono">{f.facultyId}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{f.designation}</td>
                          <td className="py-2.5 px-3 text-center text-slate-600">{f.existingWorkload}</td>
                          <td className="py-2.5 px-3 text-center text-[#0F4C81] font-700">{f.newAllocation}</td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center gap-2">
                              <span className="font-700 text-slate-800 w-6 text-right">{f.totalWorkload}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <span className="text-[10px] text-slate-400">{pct}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-500">{f.maximumWorkload}</td>
                          <td className={`py-2.5 px-3 text-center font-700 ${f.remainingCapacity === 0 ? 'text-rose-600' : f.remainingCapacity <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {f.remainingCapacity}
                          </td>
                        </tr>
                      )
                    })}
                    {wlFacultyList.length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-slate-400">No faculty data.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OptionCell({ opt }: { opt: OptionRow }) {
  const isIntegrated = opt.deliveryType === 'INTEGRATED'
  const isLab = opt.deliveryType === 'LAB'
  return (
    <div>
      <div className="font-600 text-slate-800">{opt.subjectCode}</div>
      <div className="text-slate-500">{opt.subjectName}</div>
      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
        <DeliveryBadge deliveryType={opt.deliveryType} />
        {isIntegrated && (
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-700 ${
            opt.labConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>{opt.labConfirmed ? '🧪 Lab ✓' : '🧪 Lab ?'}</span>
        )}
        <span className="text-slate-400">{opt.requestedSections} sec</span>
        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-700 ${STATUS_TONE[opt.status] ?? STATUS_TONE.DRAFT}`}>{opt.status}</span>
      </div>
    </div>
  )
}

/**
 * Compact explicit action button used in the Preference Review action column.
 * Buttons are always visible for reviewable statuses — the primary approval
 * action is never hidden inside a menu.
 */
function ActionBtn({ onClick, tone, title, children }: { onClick: () => void; tone: 'approve' | 'changes' | 'reject' | 'edit' | 'view'; title?: string; children: ReactNode }) {
  const tones: Record<string, string> = {
    approve: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    changes: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    reject: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
    edit: 'bg-blue-50 text-[#0F4C81] border-blue-200 hover:bg-blue-100',
    view: 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100',
  }
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-700 whitespace-nowrap transition ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

/**
 * Status-aware action set for ONE preference option (a row may hold two).
 *  - SUBMITTED         → [Approve] [Request Changes] [Reject] [Edit]
 *  - CHANGES_REQUESTED → [Approve] [Reject] [Edit]
 *  - REJECTED          → [Approve] [Request Changes] [Edit]
 *  - DRAFT             → [Edit]
 *  - APPROVED          → [View] (locked; approval is terminal, no re-review)
 */
function ReviewActions({ opt, onApprove, onRequestChanges, onReject, onEdit, onView }: {
  opt: OptionRow
  onApprove: () => void
  onRequestChanges: () => void
  onReject: () => void
  onEdit: () => void
  onView: () => void
}) {
  const status = opt.status
  const isApproved = status === 'APPROVED'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-700">Opt {opt.rank}</span>
        <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-700 ${STATUS_TONE[status] ?? STATUS_TONE.DRAFT}`}>{status.replace('_', ' ')}</span>
        {isApproved && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-700">🔒 Locked</span>
        )}
      </div>
      {isApproved ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionBtn tone="view" onClick={onView} title="View approval details and review trail"><Eye className="w-3 h-3" /> View</ActionBtn>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {status !== 'DRAFT' && (
            <>
              <ActionBtn tone="approve" onClick={onApprove} title="Approve: faculty may teach this subject with the requested capacity">
                <CheckCircle2 className="w-3 h-3" /> Approve
              </ActionBtn>
              {status !== 'REJECTED' && (
                <ActionBtn tone="changes" onClick={onRequestChanges} title="Ask the faculty to revise and resubmit">
                  <AlertCircle className="w-3 h-3" /> Request Changes
                </ActionBtn>
              )}
              {status !== 'CHANGES_REQUESTED' && (
                <ActionBtn tone="reject" onClick={onReject} title="Reject this preference">
                  <XCircle className="w-3 h-3" /> Reject
                </ActionBtn>
              )}
            </>
          )}
          <ActionBtn tone="edit" onClick={onEdit} title="Edit subject and requested section capacity">
            <Pencil className="w-3 h-3" /> Edit
          </ActionBtn>
        </div>
      )}
    </div>
  )
}
