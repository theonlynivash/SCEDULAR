import { useEffect, useState } from 'react'
import { PageHeader, Btn, Field, GlassPanel, Chip, IconBtn } from './ui'
import type { Page } from '../types'
import { api, type Course, type Faculty, type Section, type TeacherAssignment } from '../api'
import { Users, Plus, Edit3, Trash2, Check, X, Search } from 'lucide-react'

export default function FacultyManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // In-line Experience Edit
  const [editingFacultyId, setEditingFacultyId] = useState<string | null>(null)
  const [prevExpInput, setPrevExpInput] = useState<string>('')
  const [currExpInput, setCurrExpInput] = useState<string>('')
  const [allocExpInput, setAllocExpInput] = useState<string>('')

  // Add Faculty Form
  const [form, setForm] = useState({
    id: '',
    name: '',
    designation: '',
    department: 'AI & DS',
    previousExperience: '',
    currentExperience: '',
    allocationExperience: '',
    maxDailyPeriods: 6,
    maxWeeklyPeriods: 24,
  })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [f, c, s, a] = await Promise.all([
        api.faculty.list(),
        api.courses.list(),
        api.sections.list(),
        api.workload.listTeacherAssignments().catch(() => []),
      ])
      setFaculty(f || [])
      setCourses(c || [])
      setSections(s || [])
      setAssignments(a || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load faculty from the local database')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const courseNameById = new Map(courses.map(c => [c.id, c.name]))
  const sectionById = new Map(sections.map(s => [s.id, s]))

  function assignmentsFor(facultyId: string) {
    return assignments.filter(a => a.facultyId === facultyId)
  }

  function yearsFor(facultyId: string): string[] {
    const years = new Set<string>()
    for (const a of assignments.filter(x => x.facultyId === facultyId)) {
      const y = sectionById.get(a.sectionId)?.year
      if (y) years.add(y)
    }
    return [...years].sort()
  }

  const filtered = faculty.filter(
    f =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.id.toLowerCase().includes(search.toLowerCase()) ||
      (f.designation && f.designation.toLowerCase().includes(search.toLowerCase()))
  )

  const handleStartEdit = (f: Faculty) => {
    setEditingFacultyId(f.id)
    setPrevExpInput(f.previousExperience != null ? String(f.previousExperience) : '')
    setCurrExpInput(f.currentExperience != null ? String(f.currentExperience) : '')
    setAllocExpInput(f.allocationExperience != null ? String(f.allocationExperience) : '')
  }

  const handleSaveInlineExp = async (facultyId: string) => {
    try {
      const currentFac = faculty.find(x => x.id === facultyId)
      if (!currentFac) return

      const updated = {
        ...currentFac,
        previousExperience: prevExpInput !== '' ? Number(prevExpInput) : null,
        currentExperience: currExpInput !== '' ? Number(currExpInput) : null,
        allocationExperience: allocExpInput !== '' ? Number(allocExpInput) : null,
      }

      await api.faculty.create(updated as any)
      setNotification({ type: 'success', message: `Updated experience for ${facultyId}.` })
      setEditingFacultyId(null)
      load()
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to update experience' })
    }
  }

  async function handleSave() {
    if (!form.id || !form.name) return
    setSaving(true)
    setError(null)
    try {
      await api.faculty.create({
        id: form.id.trim(),
        name: form.name.trim(),
        designation: form.designation?.trim() || null,
        department: form.department || 'AI & DS',
        previousExperience: form.previousExperience ? Number(form.previousExperience) : null,
        currentExperience: form.currentExperience ? Number(form.currentExperience) : null,
        allocationExperience: form.allocationExperience ? Number(form.allocationExperience) : null,
        maxDailyPeriods: Number(form.maxDailyPeriods) || 6,
        maxWeeklyPeriods: Number(form.maxWeeklyPeriods) || 24,
      } as any)
      setDrawerOpen(false)
      setForm({
        id: '',
        name: '',
        designation: '',
        department: 'AI & DS',
        previousExperience: '',
        currentExperience: '',
        allocationExperience: '',
        maxDailyPeriods: 6,
        maxWeeklyPeriods: 24,
      })
      setNotification({ type: 'success', message: `Added new faculty member ${form.name}.` })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save faculty')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove faculty ${name} (${id})?`)) return
    try {
      await api.faculty.remove(id)
      setNotification({ type: 'success', message: `Removed faculty ${name}.` })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete faculty')
    }
  }

  return (
    <div className="relative space-y-6">
      <PageHeader
        title="Faculty Management"
        desc="Department faculty roster, experience records, teaching workload, and max period constraints"
      >
        <div className="flex items-center gap-2">
          <Btn onClick={() => setDrawerOpen(true)}>
            <Plus className="w-4 h-4 mr-1 inline" />
            Add Faculty
          </Btn>
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

      {error && (
        <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5">
          {error}
        </div>
      )}

      <GlassPanel className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by faculty name, ID, designation…"
            className="w-full glass-input rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>
        <div className="text-xs text-slate-500 font-500">
          Showing {filtered.length} of {faculty.length} faculty members
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
                <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Allocation Exp</th>
                <th className="px-4 py-3 text-left text-xs font-600 text-slate-500 uppercase tracking-wider">Teaching Workload</th>
                <th className="px-4 py-3 text-center text-xs font-600 text-slate-500 uppercase tracking-wider">Max Daily</th>
                <th className="px-4 py-3 text-center text-xs font-600 text-slate-500 uppercase tracking-wider">Max Weekly</th>
                <th className="px-4 py-3 text-right text-xs font-600 text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400 text-sm">
                    Loading faculty records…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No faculty found. Add one using the button above.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((f, i) => {
                  const rows = assignmentsFor(f.id)
                  const isEditing = editingFacultyId === f.id
                  const prevExp = f.previousExperience
                  const currExp = f.currentExperience
                  const allocExp = f.allocationExperience

                  return (
                    <tr
                      key={f.id}
                      className={`border-b border-white/25 hover:bg-white/30 transition ${
                        i % 2 === 0 ? '' : 'bg-white/10'
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-xs font-600 text-blue-700">{f.id}</td>
                      <td className="px-4 py-3 font-600 text-slate-800">{f.name}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{f.designation ?? 'Faculty'}</td>

                      {/* Prev Exp */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={prevExpInput}
                            onChange={e => setPrevExpInput(e.target.value)}
                            className="w-14 px-1.5 py-1 rounded-lg glass-input text-xs font-600 text-slate-800 text-center"
                          />
                        ) : prevExp != null ? (
                          <span className="text-slate-700 font-500 text-xs">{prevExp} yrs</span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Not set</span>
                        )}
                      </td>

                      {/* Curr Exp */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={currExpInput}
                            onChange={e => setCurrExpInput(e.target.value)}
                            className="w-14 px-1.5 py-1 rounded-lg glass-input text-xs font-600 text-slate-800 text-center"
                          />
                        ) : currExp != null ? (
                          <span className="text-slate-700 font-500 text-xs">{currExp} yrs</span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Not set</span>
                        )}
                      </td>

                      {/* Alloc Exp */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={allocExpInput}
                            onChange={e => setAllocExpInput(e.target.value)}
                            className="w-14 px-1.5 py-1 rounded-lg glass-input text-xs font-600 text-slate-800 text-center"
                          />
                        ) : allocExp != null ? (
                          <Chip tone="accent">{allocExp} yrs</Chip>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Not set</span>
                        )}
                      </td>

                      {/* Teaching Workload */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-64">
                          {rows.length === 0 && <span className="text-slate-400 text-xs italic">No assignments</span>}
                          {rows.slice(0, 3).map((a, idx) => (
                            <Chip key={idx} tone="neutral">
                              {a.sectionId} · {courseNameById.get(a.courseId) ?? a.courseId}
                            </Chip>
                          ))}
                          {rows.length > 3 && <Chip tone="accent">+{rows.length - 3} more</Chip>}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-xs text-slate-700">{f.maxDailyPeriods}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-slate-700">{f.maxWeeklyPeriods}</td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <Btn variant="secondary" onClick={() => handleSaveInlineExp(f.id)}>
                              <Check className="w-3.5 h-3.5 mr-0.5 inline" /> Save
                            </Btn>
                          ) : (
                            <IconBtn tone="neutral" title="Edit experience" onClick={() => handleStartEdit(f)}>
                              <Edit3 className="w-3.5 h-3.5" />
                            </IconBtn>
                          )}
                          <IconBtn tone="danger" title="Delete faculty" onClick={() => handleDelete(f.id, f.name)}>
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

      {/* Add Faculty Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-xs" onClick={() => setDrawerOpen(false)} />
          <div className="w-96 glass-strong overflow-y-auto rounded-l-[2rem] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/40 pb-3">
              <h3 className="font-display font-700 text-slate-800 text-base">Add Faculty Member</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-white/40 rounded-lg transition text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <Field
                label="Faculty ID"
                placeholder="e.g. FAC-059"
                value={form.id}
                onChange={e => setForm({ ...form, id: e.target.value })}
              />
              <Field
                label="Faculty Name"
                placeholder="e.g. Dr. John Doe"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
              <Field
                label="Designation"
                placeholder="e.g. Asst. Professor"
                value={form.designation}
                onChange={e => setForm({ ...form, designation: e.target.value })}
              />
              <Field
                label="Department"
                placeholder="AI & DS"
                value={form.department}
                onChange={e => setForm({ ...form, department: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Previous Exp (Yrs)"
                  type="number"
                  placeholder="0"
                  value={form.previousExperience}
                  onChange={e => setForm({ ...form, previousExperience: e.target.value })}
                />
                <Field
                  label="Current Exp (Yrs)"
                  type="number"
                  placeholder="0"
                  value={form.currentExperience}
                  onChange={e => setForm({ ...form, currentExperience: e.target.value })}
                />
              </div>
              <Field
                label="Allocation Exp (Policy)"
                type="number"
                placeholder="Leave blank to auto-sum"
                value={form.allocationExperience}
                onChange={e => setForm({ ...form, allocationExperience: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Max Daily Periods"
                  type="number"
                  value={form.maxDailyPeriods}
                  onChange={e => setForm({ ...form, maxDailyPeriods: Number(e.target.value) })}
                />
                <Field
                  label="Max Weekly Periods"
                  type="number"
                  value={form.maxWeeklyPeriods}
                  onChange={e => setForm({ ...form, maxWeeklyPeriods: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <Btn variant="secondary" onClick={() => setDrawerOpen(false)} className="flex-1">
                Cancel
              </Btn>
              <Btn onClick={handleSave} disabled={saving || !form.id || !form.name} className="flex-1">
                {saving ? 'Saving…' : 'Save Faculty'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
