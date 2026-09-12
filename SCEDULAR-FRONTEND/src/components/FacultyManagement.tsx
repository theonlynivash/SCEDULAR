import { useEffect, useState } from 'react'
import { PageHeader, Btn, Field, GlassPanel, Chip, IconBtn } from './ui'
import type { Page } from '../types'
import { api, type Course, type Faculty, type Section, type TeacherAssignment } from '../api'
import { useScope, matchesScope } from '../scope'

export default function FacultyManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { scope } = useScope()

  const [form, setForm] = useState({
    id: '',
    name: '',
    designation: '',
    maxDailyPeriods: 8,
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
        api.workload.listTeacherAssignments(),
      ])
      setFaculty(f)
      setCourses(c)
      setSections(s)
      setAssignments(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load faculty from the backend')
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
    return assignments
      .filter(a => a.facultyId === facultyId)
      .filter(a => {
        const sec = sectionById.get(a.sectionId)
        return matchesScope(scope, sec?.year ?? null, sec?.semester ?? null)
      })
  }

  // Faculty teaching more than one distinct year -> the "spans years" case
  // called out explicitly (a teacher can appear on a II-year row and a
  // III-year row; the solver just sees two more schedulable units for the
  // same person and keeps their whole week collision-free across both).
  function yearsFor(facultyId: string): string[] {
    const years = new Set<string>()
    for (const a of assignments.filter(x => x.facultyId === facultyId)) {
      const y = sectionById.get(a.sectionId)?.year
      if (y) years.add(y)
    }
    return [...years].sort()
  }

  const filtered = faculty
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.id.toLowerCase().includes(search.toLowerCase()))
    .filter(f => scope.year === 'ALL' || assignmentsFor(f.id).length > 0)

  async function handleSave() {
    if (!form.id || !form.name) return
    setSaving(true)
    setError(null)
    try {
      await api.faculty.create({
        id: form.id,
        name: form.name,
        designation: form.designation || null,
        maxDailyPeriods: Number(form.maxDailyPeriods),
        maxWeeklyPeriods: Number(form.maxWeeklyPeriods),
      })
      setDrawerOpen(false)
      setForm({ id: '', name: '', designation: '', maxDailyPeriods: 8, maxWeeklyPeriods: 24 })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save faculty')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Remove faculty ${id}? This also removes their teaching assignments.`)) return
    try {
      await api.faculty.remove(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete faculty')
    }
  }

  return (
    <div className="relative">
      <PageHeader title="Faculty Management" desc="Faculty profiles and their cross-year, cross-section workload">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn variant="secondary" onClick={() => navigate('data-hub')}>Import Workload</Btn>
        <Btn onClick={() => setDrawerOpen(true)}>+ Add Faculty</Btn>
      </PageHeader>

      {error && (
        <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>
      )}

      <GlassPanel className="p-4 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or ID…"
          className="w-full glass-input rounded-xl px-4 py-2 text-sm text-slate-800"
        />
      </GlassPanel>

      <GlassPanel className="overflow-hidden">
        <table className="tbl text-sm">
          <thead>
            <tr className="border-b border-white/40 bg-white/25">
              {['Faculty', 'Designation', 'Teaching (in scope)', 'Years', 'Max Daily', 'Max Weekly', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-600 text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Loading faculty…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">No faculty found for this scope. Add one or import a workload sheet.</td></tr>
            )}
            {!loading && filtered.map((f, i) => {
              const rows = assignmentsFor(f.id)
              return (
                <tr key={f.id} className={`border-b border-white/25 hover:bg-white/30 transition ${i % 2 === 0 ? '' : 'bg-white/10'}`}>
                  <td className="px-4 py-3">
                    <p className="font-500 text-slate-800">{f.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{f.id}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{f.designation ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-72">
                      {rows.length === 0 && <span className="text-slate-400 text-xs">—</span>}
                      {rows.slice(0, 4).map((a, idx) => (
                        <Chip key={idx} tone="neutral">{a.sectionId} · {courseNameById.get(a.courseId) ?? a.courseId}</Chip>
                      ))}
                      {rows.length > 4 && <Chip tone="accent">+{rows.length - 4} more</Chip>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {yearsFor(f.id).map(y => <Chip key={y} tone={yearsFor(f.id).length > 1 ? 'accent' : 'neutral'}>Yr {y}</Chip>)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">{f.maxDailyPeriods}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs">{f.maxWeeklyPeriods}</td>
                  <td className="px-4 py-3">
                    <IconBtn tone="danger" title="Delete faculty" onClick={() => handleDelete(f.id)}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </IconBtn>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-white/30">
          <p className="text-xs text-slate-500">Showing {filtered.length} of {faculty.length} faculty</p>
        </div>
      </GlassPanel>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="w-96 glass-strong overflow-y-auto rounded-l-[2rem]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/40 sticky top-0 glass-strong">
              <h3 className="font-display font-700 text-slate-800">Add Faculty</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-white/40 rounded-lg transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Faculty ID" placeholder="e.g. FAC_JEGAN" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} />
              <Field label="Faculty Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Field label="Designation" placeholder="e.g. Asst. Professor" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
              <Field
                label="Maximum Periods per Day"
                type="number"
                value={form.maxDailyPeriods}
                onChange={e => setForm({ ...form, maxDailyPeriods: Number(e.target.value) })}
              />
              <Field
                label="Maximum Periods per Week"
                hint="Their TRUE total across every year they teach, not just this scope."
                type="number"
                value={form.maxWeeklyPeriods}
                onChange={e => setForm({ ...form, maxWeeklyPeriods: Number(e.target.value) })}
              />
              <Btn onClick={handleSave} disabled={saving || !form.id || !form.name}>{saving ? 'Saving…' : 'Save Faculty'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
