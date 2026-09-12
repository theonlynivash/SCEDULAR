import { useEffect, useState } from 'react'
import { PageHeader, Btn } from './ui'
import type { Page } from '../types'
import { api, type Course, type Faculty, type TeacherAssignment } from '../api'

export default function FacultyManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    id: '',
    name: '',
    designation: '',
    maxDailyPeriods: 6,
    maxWeeklyPeriods: 24,
  })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [f, c, a] = await Promise.all([api.faculty.list(), api.courses.list(), api.workload.listTeacherAssignments()])
      setFaculty(f)
      setCourses(c)
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
  const subjectsFor = (facultyId: string) =>
    assignments
      .filter(a => a.facultyId === facultyId)
      .map(a => courseNameById.get(a.courseId) ?? a.courseId)
      .join(', ') || '—'

  const filtered = faculty.filter(
    f => f.name.toLowerCase().includes(search.toLowerCase()) || f.id.toLowerCase().includes(search.toLowerCase())
  )

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
      setForm({ id: '', name: '', designation: '', maxDailyPeriods: 6, maxWeeklyPeriods: 24 })
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
      <PageHeader title="Faculty Management" desc="Manage faculty profiles and workload assignments">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-500 text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn variant="secondary" onClick={() => navigate('upload-workload')}>Import Excel</Btn>
        <Btn onClick={() => setDrawerOpen(true)}>+ Add Faculty</Btn>
      </PageHeader>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or ID…"
          className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-[#f8faff]">
              {['Faculty ID', 'Name', 'Designation', 'Subjects', 'Max Daily', 'Max Weekly', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-600 text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Loading faculty…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">No faculty found. Add one or import an Excel sheet.</td></tr>
            )}
            {!loading && filtered.map((f, i) => (
              <tr key={f.id} className={`border-b border-slate-50 hover:bg-blue-50/30 transition ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.id}</td>
                <td className="px-4 py-3 font-500 text-slate-800">{f.name}</td>
                <td className="px-4 py-3 text-slate-600">{f.designation ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500 max-w-56 truncate" title={subjectsFor(f.id)}>{subjectsFor(f.id)}</td>
                <td className="px-4 py-3 text-center font-mono text-xs">{f.maxDailyPeriods}</td>
                <td className="px-4 py-3 text-center font-mono text-xs">{f.maxWeeklyPeriods}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600 transition"
                    title="Delete faculty"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">Showing {filtered.length} of {faculty.length} faculty</p>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-96 bg-white shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="font-display font-700 text-[#0F4C81]">Add Faculty</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-slate-100 rounded transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Faculty ID</label>
                <input
                  value={form.id}
                  onChange={e => setForm({ ...form, id: e.target.value })}
                  placeholder="e.g. FAC059"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Faculty Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Designation</label>
                <input
                  value={form.designation}
                  onChange={e => setForm({ ...form, designation: e.target.value })}
                  placeholder="e.g. Asst. Professor"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Maximum Periods per Day</label>
                <input
                  type="number"
                  value={form.maxDailyPeriods}
                  onChange={e => setForm({ ...form, maxDailyPeriods: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Maximum Periods per Week</label>
                <input
                  type="number"
                  value={form.maxWeeklyPeriods}
                  onChange={e => setForm({ ...form, maxWeeklyPeriods: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <p className="text-xs text-slate-400">
                Subjects and sections are assigned separately via workload import (Section/course/teacher rows), not here.
              </p>
              <button
                onClick={handleSave}
                disabled={saving || !form.id || !form.name}
                className="w-full bg-[#0F4C81] text-white py-2.5 rounded-lg font-600 text-sm hover:bg-[#0a3860] transition mt-2 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Faculty'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
