import { useEffect, useState } from 'react'
import { PageHeader, Btn, Field, GlassPanel, Chip, IconBtn } from './ui'
import type { Page } from '../types'
import { api, type Course, type Lab } from '../api'

function BackBtn({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <button
      onClick={() => navigate('dashboard')}
      className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill transition"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  )
}

export default function LabManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [labs, setLabs] = useState<Lab[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ id: '', name: '' })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [mappingBusy, setMappingBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [l, c] = await Promise.all([api.labs.list(), api.courses.list()])
      setLabs(l)
      setCourses(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load labs from the backend')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAddLab() {
    if (!form.id || !form.name) return
    setSaving(true)
    setError(null)
    try {
      await api.labs.create(form)
      setForm({ id: '', name: '' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save lab')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteLab(id: string) {
    if (!confirm(`Remove lab ${id}? This also clears its course mappings.`)) return
    try {
      await api.labs.remove(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete lab')
    }
  }

  async function toggleMapping(lab: Lab, courseId: string, mapped: boolean) {
    setMappingBusy(`${lab.id}:${courseId}`)
    try {
      if (mapped) await api.labs.unmapCourse(lab.id, courseId)
      else await api.labs.mapCourse(lab.id, courseId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update lab/course mapping')
    } finally {
      setMappingBusy(null)
    }
  }

  const courseNameById = new Map(courses.map(c => [c.id, c.name]))
  const labCandidateCourses = courses.filter(c => c.componentType === 'LAB_ONLY' || c.componentType === 'INTEGRATED_LAB')

  // Courses that need at least one lab but currently have none mapped --
  // the exact gap that leaves the solver with zero placement candidates
  // for a lab block (Section 9: eligibility vs. capacity shortage).
  const unhostedCourses = labCandidateCourses.filter(c => !labs.some(l => l.courseIds.includes(c.id)))

  return (
    <div>
      <PageHeader title="Lab Management" desc="Physical rooms and which courses each can host — a lab may host several courses, and a course may run in several labs">
        <BackBtn navigate={navigate} />
      </PageHeader>

      {error && (
        <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>
      )}

      <GlassPanel className="p-5 mb-5">
        <p className="text-sm text-slate-700 font-500 mb-1">Sharing one lab across two subjects</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          If OOP and DBMS both run in the same physical room, add that lab once and check both courses below —
          the solver treats every checked course as a valid candidate for that room and will never double-book it.
          A course left with zero mapped labs (flagged in red below) cannot be scheduled at all.
        </p>
      </GlassPanel>

      {unhostedCourses.length > 0 && (
        <GlassPanel className="p-4 mb-5 bg-rose-400/10">
          <p className="text-xs font-600 text-rose-700 uppercase tracking-wider mb-2">Lab/Integrated courses with no lab mapped yet</p>
          <div className="flex flex-wrap gap-1.5">
            {unhostedCourses.map(c => <Chip key={c.id} tone="danger">{c.name}</Chip>)}
          </div>
        </GlassPanel>
      )}

      <GlassPanel className="p-5 mb-5">
        <p className="text-xs font-600 text-slate-500 uppercase tracking-wider mb-3">Add Lab / Physical Room</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Field label="Lab ID" placeholder="e.g. LAB_AIES_3" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} />
          <Field label="Lab Name" placeholder="e.g. AIES Lab 3" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Btn onClick={handleAddLab} disabled={saving || !form.id || !form.name}>{saving ? 'Adding…' : '+ Add Lab'}</Btn>
        </div>
      </GlassPanel>

      <GlassPanel className="overflow-hidden">
        <div className="px-5 py-3 border-b border-white/40">
          <p className="text-xs font-600 text-slate-500 uppercase tracking-wider">Labs already added ({labs.length})</p>
        </div>
        {loading && <p className="px-5 py-8 text-center text-slate-400 text-sm">Loading labs…</p>}
        {!loading && labs.length === 0 && (
          <p className="px-5 py-8 text-center text-slate-400 text-sm">No labs configured yet — add one above.</p>
        )}
        <div className="divide-y divide-white/30">
          {labs.map(lab => {
            const isOpen = expanded === lab.id
            return (
              <div key={lab.id}>
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-white/25 transition">
                  <button onClick={() => setExpanded(isOpen ? null : lab.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                    <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="min-w-0">
                      <p className="font-500 text-slate-800 truncate">{lab.name}</p>
                      <p className="font-mono text-[11px] text-slate-400">{lab.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 ml-2">
                      {lab.courseIds.length === 0 && <span className="text-xs text-slate-400">No courses mapped</span>}
                      {lab.courseIds.slice(0, 3).map(cid => <Chip key={cid} tone="accent">{courseNameById.get(cid) ?? cid}</Chip>)}
                      {lab.courseIds.length > 3 && <Chip tone="neutral">+{lab.courseIds.length - 3} more</Chip>}
                    </div>
                  </button>
                  <IconBtn tone="danger" title="Delete lab" onClick={() => handleDeleteLab(lab.id)}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </IconBtn>
                </div>
                {isOpen && (
                  <div className="px-5 pb-4 pl-12">
                    <p className="text-xs text-slate-500 mb-2">Courses hosted in {lab.name}:</p>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      {labCandidateCourses.map(c => {
                        const mapped = lab.courseIds.includes(c.id)
                        const busy = mappingBusy === `${lab.id}:${c.id}`
                        return (
                          <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer transition ${mapped ? 'bg-[#0e254f]/10 text-[#0e254f] font-500' : 'bg-white/40 text-slate-600 hover:bg-white/60'} ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                            <input type="checkbox" checked={mapped} onChange={() => toggleMapping(lab, c.id, mapped)} className="accent-[#0e254f]" />
                            {c.name}
                          </label>
                        )
                      })}
                      {labCandidateCourses.length === 0 && <p className="text-xs text-slate-400">No lab/integrated courses configured yet.</p>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </GlassPanel>
    </div>
  )
}
