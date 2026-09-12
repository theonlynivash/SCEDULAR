import { useEffect, useState } from 'react'
import { PageHeader, Btn } from './ui'
import type { Page } from '../types'
import { api, type ComponentType, type Course } from '../api'

const componentTypeLabels: Record<ComponentType, string> = {
  INTEGRATED: 'Integrated (Theory + Lab)',
  NON_INTEGRATED: 'Theory Only',
  MANDATORY: 'Mandatory',
  LAB_ONLY: 'Lab Only',
}

const componentTypeColors: Record<ComponentType, string> = {
  INTEGRATED: 'bg-purple-50 text-purple-700',
  NON_INTEGRATED: 'bg-blue-50 text-blue-700',
  MANDATORY: 'bg-amber-50 text-amber-700',
  LAB_ONLY: 'bg-green-50 text-green-700',
}

export default function SubjectManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ id: '', code: '', name: '', componentType: 'NON_INTEGRATED' as ComponentType, labBlockLength: 3 })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setCourses(await api.courses.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load courses from the backend')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave() {
    if (!form.id || !form.code || !form.name) return
    setSaving(true)
    setError(null)
    try {
      await api.courses.create(form)
      setDrawerOpen(false)
      setForm({ id: '', code: '', name: '', componentType: 'NON_INTEGRATED', labBlockLength: 3 })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save course')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Remove course ${id}?`)) return
    try {
      await api.courses.remove(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete course')
    }
  }

  return (
    <div>
      <PageHeader title="Subject Management" desc="Manage courses and their component type (theory / lab / integrated)">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-500 text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn onClick={() => setDrawerOpen(true)}>+ Add Subject</Btn>
      </PageHeader>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f8faff] border-b border-slate-100">
              {['Course ID', 'Code', 'Name', 'Component Type', 'Lab Block Length', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-600 text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Loading courses…</td></tr>
            )}
            {!loading && courses.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">No courses configured yet.</td></tr>
            )}
            {!loading && courses.map((c, i) => (
              <tr key={c.id} className={`border-b border-slate-50 hover:bg-blue-50/30 transition ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.id}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.code}</td>
                <td className="px-4 py-3 font-500 text-slate-800">{c.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-500 ${componentTypeColors[c.componentType]}`}>
                    {componentTypeLabels[c.componentType]}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">{c.labBlockLength}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(c.id)} className="p-1 hover:bg-red-50 rounded text-red-400 transition text-xs font-500">Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">Showing {courses.length} course{courses.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-96 bg-white shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="font-display font-700 text-[#0F4C81]">Add Subject</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-slate-100 rounded transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Course ID</label>
                <input value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} placeholder="e.g. AIES" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Subject Code</label>
                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. 23AD1311" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Subject Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Component Type</label>
                <select
                  value={form.componentType}
                  onChange={e => setForm({ ...form, componentType: e.target.value as ComponentType })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {Object.entries(componentTypeLabels).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
              {form.componentType !== 'NON_INTEGRATED' && form.componentType !== 'MANDATORY' && (
                <div>
                  <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1">Lab Block Length (periods)</label>
                  <input
                    type="number"
                    value={form.labBlockLength}
                    onChange={e => setForm({ ...form, labBlockLength: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <p className="text-xs text-slate-400 mt-1">Normal labs are 3 contiguous periods; exceptions like TSP use their own configured length.</p>
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !form.id || !form.code || !form.name}
                className="w-full bg-[#0F4C81] text-white py-2.5 rounded-lg font-600 text-sm hover:bg-[#0a3860] transition mt-2 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Subject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
