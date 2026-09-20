import { useState, useEffect } from 'react'
import { PageHeader, Btn, Field, GlassPanel, Chip, IconBtn } from './ui'
import { Users, Settings, Plus, Save, Shield, X, Edit3, Trash2, Layers, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api, type Subject, type Section } from '../api'
import { DEFAULT_ALLOCATION_CONFIG, type AllocationConfig } from '../utils/allocationPolicy'

export default function HodFacultyManagement() {
  const [activeTab, setActiveTab] = useState<'faculty' | 'policy' | 'status'>('faculty')
  const [facultyList, setFacultyList] = useState<any[]>([])
  const [config, setConfig] = useState<AllocationConfig>(DEFAULT_ALLOCATION_CONFIG)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [preferences, setPreferences] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Edit State
  const [editingFacultyId, setEditingFacultyId] = useState<string | null>(null)
  const [prevExpInput, setPrevExpInput] = useState<string>('')
  const [currExpInput, setCurrExpInput] = useState<string>('')
  const [allocExpInput, setAllocExpInput] = useState<string>('')

  // Add Faculty Modal State
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newFacId, setNewFacId] = useState('')
  const [newFacName, setNewFacName] = useState('')
  const [newFacDesig, setNewFacDesig] = useState('Asst.Prof')
  const [newFacDept, setNewFacDept] = useState('AI & DS')

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [facRes, cfgRes, subRes, prefRes, assignRes, secRes] = await Promise.all([
        api.faculty.list().catch(() => []),
        api.facultyAllocation.getAllocationSettings().catch(() => ({ config: DEFAULT_ALLOCATION_CONFIG })),
        api.subjects.list().catch(() => []),
        api.facultyAllocation.getHodPreferences().catch(() => ({ preferences: [] })),
        api.teachingAssignments.list().catch(() => []),
        api.sections.list().catch(() => []),
      ])

      if (facRes && Array.isArray(facRes)) {
        setFacultyList(facRes)
      }
      if (cfgRes?.config) {
        setConfig(cfgRes.config)
      }
      if (subRes && Array.isArray(subRes)) {
        setSubjects(subRes)
      }
      if (prefRes?.preferences) {
        setPreferences(prefRes.preferences)
      }
      if (assignRes && Array.isArray(assignRes)) {
        setAssignments(assignRes)
      }
      if (secRes && Array.isArray(secRes)) {
        setSections(secRes)
      }
    } catch {
      // fallback
    } finally {
      setLoading(false)
    }
  }

  const handleStartEdit = (f: any) => {
    setEditingFacultyId(f.id)
    setPrevExpInput(f.previousExperience != null ? String(f.previousExperience) : '')
    setCurrExpInput(f.currentExperience != null ? String(f.currentExperience) : '')
    setAllocExpInput(f.allocationExperience != null ? String(f.allocationExperience) : '')
  }

  const handleSaveFacultyEdit = async (facultyId: string) => {
    try {
      const prevExp = prevExpInput !== '' ? Number(prevExpInput) : null
      const currExp = currExpInput !== '' ? Number(currExpInput) : null
      const allocExp = allocExpInput !== '' ? Number(allocExpInput) : null

      const currentFac = facultyList.find(x => x.id === facultyId)
      if (!currentFac) return

      const updated = {
        ...currentFac,
        previousExperience: prevExp,
        currentExperience: currExp,
        allocationExperience: allocExp,
      }

      await api.faculty.create(updated)
      setNotification({ type: 'success', message: `Updated experience profile for ${facultyId}.` })
      setEditingFacultyId(null)
      loadData()
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to update faculty' })
    }
  }

  const handleAddFaculty = async () => {
    if (!newFacId.trim() || !newFacName.trim()) {
      setNotification({ type: 'error', message: 'Faculty ID and Name are required.' })
      return
    }

    try {
      await api.faculty.create({
        id: newFacId.trim(),
        name: newFacName.trim(),
        designation: newFacDesig.trim(),
        department: newFacDept.trim() || 'AI & DS',
        maxDailyPeriods: 6,
        maxWeeklyPeriods: 24,
        unavailability: [],
      } as any)

      setNotification({ type: 'success', message: `Added faculty ${newFacName} (${newFacId}).` })
      setAddModalOpen(false)
      setNewFacId('')
      setNewFacName('')
      loadData()
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to add faculty' })
    }
  }

  const handleDeleteFaculty = async (facultyId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name} (${facultyId})?`)) return

    try {
      await api.faculty.remove(facultyId)
      setNotification({ type: 'success', message: `Deleted faculty ${name}.` })
      loadData()
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to delete faculty' })
    }
  }

  const handleSavePolicy = async () => {
    try {
      await api.facultyAllocation.saveAllocationSettings(config)
      setNotification({ type: 'success', message: 'Allocation Experience Policy updated successfully.' })
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to save policy' })
    }
  }

  const filteredFaculty = facultyList.filter(
    f => f.name.toLowerCase().includes(search.toLowerCase()) || f.id.toLowerCase().includes(search.toLowerCase())
  )

  // Map preferences and allocations per faculty
  function getFacultyPreferenceInfo(facId: string) {
    const facPrefs = preferences.filter(p => p.facultyId === facId)
    const approvedPrefs = facPrefs.filter(p => p.status === 'APPROVED')
    return {
      totalPrefs: facPrefs.length,
      approvedCount: approvedPrefs.length,
      approvedSubjects: approvedPrefs.map(p => p.subjectCode || p.subjectId).join(', ') || '—',
    }
  }

  // Compute Subject Allocation Matrix for Tab C
  const subjectAllocationRows = subjects.slice(0, 30).map(sub => {
    // calculate required sections based on year
    const ySections = sections.filter(s => s.year === (sub.year || 'Year 2')).length || (sub.year === 'Year 2' ? 12 : 8)
    const requiredSections = ySections

    // approved capacity
    const approvedPrefs = preferences.filter(
      p => (p.subjectId === sub.id || p.subjectCode === sub.code) && p.status === 'APPROVED'
    )
    const approvedCapacity = approvedPrefs.reduce((sum, p) => sum + (p.requestedSections || 1), 0)

    // assigned sections
    const assignedCount = assignments.filter((a: any) => a.subjectId === sub.id || a.subjectCode === sub.code).length
    const remaining = Math.max(0, approvedCapacity - assignedCount)

    let status: 'COVERED' | 'SHORTAGE' | 'IN_PROGRESS' = 'SHORTAGE'
    if (approvedCapacity >= requiredSections && assignedCount >= requiredSections) {
      status = 'COVERED'
    } else if (approvedCapacity >= requiredSections) {
      status = 'IN_PROGRESS'
    }

    return {
      id: sub.id,
      code: sub.code,
      name: sub.name,
      deliveryType: sub.deliveryType,
      year: sub.year || 'Year 2',
      semester: sub.semester || 'III',
      requiredSections,
      approvedCapacity,
      assignedCount,
      remaining,
      status,
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="HOD Faculty & Policy"
        desc="Seed real faculty records, set/edit experience parameters, configure experience policy bands, and review allocation coverage"
      >
        <div className="flex gap-2 flex-wrap">
          <Btn
            variant={activeTab === 'faculty' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('faculty')}
          >
            <Users className="w-4 h-4 mr-1.5 inline" />
            Faculty Management ({facultyList.length})
          </Btn>
          <Btn
            variant={activeTab === 'policy' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('policy')}
          >
            <Settings className="w-4 h-4 mr-1.5 inline" />
            Experience / Allocation Policy
          </Btn>
          <Btn
            variant={activeTab === 'status' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('status')}
          >
            <Layers className="w-4 h-4 mr-1.5 inline" />
            Subject Allocation Status
          </Btn>
          {activeTab === 'faculty' && (
            <Btn onClick={() => setAddModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1 inline" />
              Add Faculty
            </Btn>
          )}
        </div>
      </PageHeader>

      {notification && (
        <div
          className={`px-4 py-3 rounded-2xl flex items-center justify-between text-sm font-500 ${
            notification.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-800'
              : 'bg-rose-500/15 border border-rose-400/30 text-rose-800'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-xs text-slate-500 hover:text-slate-800 font-600">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab A: Faculty Management */}
      {activeTab === 'faculty' && (
        <div className="space-y-4">
          <GlassPanel className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search faculty by name or ID…"
              className="w-full md:w-80 glass-input rounded-xl px-4 py-2 text-sm text-slate-800"
            />
            <div className="text-xs text-slate-500 font-500">
              Showing {filteredFaculty.length} of {facultyList.length} faculty profiles
            </div>
          </GlassPanel>

          <GlassPanel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl text-sm" style={{ minWidth: 960 }}>
                <thead>
                  <tr className="border-b border-white/40 bg-white/25">
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">S.No</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Faculty ID</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Designation</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Previous Exp</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Current Exp</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Total Exp</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Allocation Exp (HOD)</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Approved Subjects</th>
                    <th className="px-4 py-3 text-right text-xs font-600 text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-sm">
                        Loading department faculty roster…
                      </td>
                    </tr>
                  )}
                  {!loading && filteredFaculty.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-sm">
                        No faculty profiles found.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    filteredFaculty.map((f, idx) => {
                      const isEditing = editingFacultyId === f.id
                      const prevExp = f.previousExperience
                      const currExp = f.currentExperience
                      const actualTot = prevExp != null && currExp != null ? prevExp + currExp : null
                      const allocExp = f.allocationExperience
                      const prefInfo = getFacultyPreferenceInfo(f.id)

                      return (
                        <tr
                          key={f.id}
                          className={`border-b border-white/25 hover:bg-white/30 transition ${
                            idx % 2 === 0 ? '' : 'bg-white/10'
                          }`}
                        >
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs font-600 text-blue-700">{f.id}</td>
                          <td className="px-4 py-3 font-600 text-slate-800">{f.name}</td>
                          <td className="px-4 py-3 text-slate-600">{f.designation || 'Faculty'}</td>

                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number"
                                placeholder="Prev"
                                value={prevExpInput}
                                onChange={e => setPrevExpInput(e.target.value)}
                                className="w-16 px-2 py-1 rounded-lg glass-input text-xs font-600 text-slate-800 text-center"
                              />
                            ) : prevExp != null ? (
                              <span className="text-slate-700 font-500">{prevExp} yrs</span>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Not Set</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number"
                                placeholder="Curr"
                                value={currExpInput}
                                onChange={e => setCurrExpInput(e.target.value)}
                                className="w-16 px-2 py-1 rounded-lg glass-input text-xs font-600 text-slate-800 text-center"
                              />
                            ) : currExp != null ? (
                              <span className="text-slate-700 font-500">{currExp} yrs</span>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Not Set</span>
                            )}
                          </td>

                          <td className="px-4 py-3 font-600 text-amber-700">
                            {actualTot != null ? `${actualTot} yrs` : <span className="text-slate-400 italic font-normal text-xs">Not Set</span>}
                          </td>

                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number"
                                placeholder="Alloc"
                                value={allocExpInput}
                                onChange={e => setAllocExpInput(e.target.value)}
                                className="w-16 px-2 py-1 rounded-lg glass-input text-xs font-600 text-slate-800 text-center"
                              />
                            ) : allocExp != null ? (
                              <Chip tone="accent">{allocExp} yrs</Chip>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Not Set</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-xs">
                            {prefInfo.approvedCount > 0 ? (
                              <span className="text-emerald-700 font-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                {prefInfo.approvedSubjects}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditing ? (
                                <Btn variant="secondary" onClick={() => handleSaveFacultyEdit(f.id)}>
                                  Save
                                </Btn>
                              ) : (
                                <IconBtn tone="neutral" title="Edit experience" onClick={() => handleStartEdit(f)}>
                                  <Edit3 className="w-3.5 h-3.5" />
                                </IconBtn>
                              )}
                              <IconBtn tone="danger" title="Delete faculty" onClick={() => handleDeleteFaculty(f.id, f.name)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </IconBtn>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        </div>
      )}

      {/* Tab B: Allocation Policy Engine */}
      {activeTab === 'policy' && (
        <GlassPanel className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/30 pb-4">
            <div>
              <h2 className="text-base font-700 text-slate-800 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Experience Band Allocation Engine
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Configure senior thresholds and experience bands used by the HOD faculty allocation engine.
              </p>
            </div>

            <Btn onClick={handleSavePolicy}>
              <Save className="w-4 h-4 mr-1.5 inline" />
              Save Policy Changes
            </Btn>
          </div>

          <div className="space-y-4">
            {config.bands.map((band, idx) => (
              <GlassPanel key={band.id} className="p-5 space-y-3 bg-white/20">
                <div className="flex justify-between items-center border-b border-white/30 pb-2">
                  <h3 className="text-sm font-700 text-slate-800">
                    Band #{idx + 1}: {band.name}
                  </h3>
                  <Chip tone="neutral">
                    Experience Range: {band.minExperience} to {band.maxExperience === null ? '∞' : `${band.maxExperience} yrs`}
                  </Chip>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
                  <div>
                    <label className="block text-slate-600 font-500 mb-1">Eligible Academic Years:</label>
                    <input
                      type="text"
                      value={band.eligibleYears.join(', ')}
                      onChange={e => {
                        const years = e.target.value.split(',').map(s => s.trim())
                        const newBands = [...config.bands]
                        newBands[idx].eligibleYears = years
                        setConfig({ ...config, bands: newBands })
                      }}
                      className="w-full glass-input rounded-xl px-3 py-2 text-slate-800 font-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-500 mb-1">Max Total Preferences:</label>
                    <input
                      type="number"
                      value={band.maxTotalPreferences}
                      onChange={e => {
                        const newBands = [...config.bands]
                        newBands[idx].maxTotalPreferences = Number(e.target.value)
                        setConfig({ ...config, bands: newBands })
                      }}
                      className="w-full glass-input rounded-xl px-3 py-2 text-slate-800 font-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-500 mb-1">Max Per Academic Year:</label>
                    <input
                      type="number"
                      value={band.maxPreferencesPerYear}
                      onChange={e => {
                        const newBands = [...config.bands]
                        newBands[idx].maxPreferencesPerYear = Number(e.target.value)
                        setConfig({ ...config, bands: newBands })
                      }}
                      className="w-full glass-input rounded-xl px-3 py-2 text-slate-800 font-500"
                    />
                  </div>
                </div>
              </GlassPanel>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Tab C: Subject Allocation Status */}
      {activeTab === 'status' && (
        <div className="space-y-4">
          <GlassPanel className="p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-700 text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0F4C81]" />
                Curriculum Subject Allocation & Capacity Matrix
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Overview of section requirements, approved faculty capacity pools, and assigned section coverage.
              </p>
            </div>
            <Chip tone="accent">Total Curriculum Subjects: {subjects.length}</Chip>
          </GlassPanel>

          <GlassPanel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl text-sm" style={{ minWidth: 860 }}>
                <thead>
                  <tr className="border-b border-white/40 bg-white/25">
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Year / Sem</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-slate-500 uppercase tracking-wider">Required Sections</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-slate-500 uppercase tracking-wider">Approved Capacity</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-slate-500 uppercase tracking-wider">Assigned Sections</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-slate-500 uppercase tracking-wider">Remaining Capacity</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-slate-500 uppercase tracking-wider">Coverage Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectAllocationRows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-white/25 hover:bg-white/30 transition ${
                        i % 2 === 0 ? '' : 'bg-white/10'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-600 text-slate-800 text-xs">{row.name}</p>
                        <p className="font-mono text-[10px] text-slate-400">{row.code}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Chip tone={row.deliveryType === 'INTEGRATED' ? 'accent' : 'neutral'}>{row.deliveryType}</Chip>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-500">
                        {row.year} · Sem {row.semester}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700 font-mono text-xs">
                        {row.requiredSections}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-blue-700 font-mono text-xs">
                        {row.approvedCapacity}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-700 font-mono text-xs">
                        {row.assignedCount}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-slate-600">
                        {row.remaining}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.status === 'COVERED' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-700 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> COVERED
                          </span>
                        ) : row.status === 'IN_PROGRESS' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-700 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            IN PROGRESS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-700 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3" /> SHORTAGE
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        </div>
      )}

      {/* Add Faculty Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="max-w-md w-full glass-strong p-6 rounded-3xl space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/40 pb-3">
              <h3 className="text-base font-700 text-slate-800">Add New Faculty Member</h3>
              <button onClick={() => setAddModalOpen(false)} className="p-1 hover:bg-white/40 rounded-lg transition text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field
                label="Faculty ID"
                placeholder="e.g. FAC-059"
                value={newFacId}
                onChange={e => setNewFacId(e.target.value)}
              />
              <Field
                label="Faculty Name"
                placeholder="e.g. Dr. John Doe"
                value={newFacName}
                onChange={e => setNewFacName(e.target.value)}
              />
              <Field
                label="Designation"
                placeholder="Asst.Prof / Assoc.Prof / Professor"
                value={newFacDesig}
                onChange={e => setNewFacDesig(e.target.value)}
              />
              <Field
                label="Department"
                placeholder="AI & DS"
                value={newFacDept}
                onChange={e => setNewFacDept(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setAddModalOpen(false)} className="flex-1">
                Cancel
              </Btn>
              <Btn onClick={handleAddFaculty} className="flex-1">
                Add Faculty
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
