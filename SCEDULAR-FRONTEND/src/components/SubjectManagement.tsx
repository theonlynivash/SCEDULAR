import { useEffect, useRef, useState } from 'react'
import { PageHeader, Btn, Field, Select, GlassPanel, Chip, IconBtn } from './ui'
import type { Page } from '../types'
import { api, type ComponentType, type Course } from '../api'
import { Download, Upload } from 'lucide-react'

// An "integrated" subject (theory + lab, e.g. OOP + OOP_LAB) is always two
// paired course rows -- one Integrated Theory row, one Integrated Lab row
// -- never a single row carrying both counts, whether or not the same
// faculty teaches both halves. Lab Only has no theory counterpart at all
// (e.g. TSP). Mandatory (Constitution of India, Aptitude) and Additional
// (Skills for Career Development, Library) are both theory-only but kept
// distinct since Additional periods are not compulsory curriculum.
const componentTypeLabels: Record<ComponentType, string> = {
  INTEGRATED_THEORY: 'Integrated Theory',
  INTEGRATED_LAB: 'Integrated Lab',
  LAB_ONLY: 'Lab Only',
  THEORY_ONLY: 'Theory Only',
  MANDATORY: 'Mandatory',
  ADDITIONAL: 'Additional (Non-Mandatory)',
}

const componentTypeTones: Record<ComponentType, 'accent' | 'neutral' | 'warning' | 'success'> = {
  INTEGRATED_THEORY: 'accent',
  INTEGRATED_LAB: 'success',
  LAB_ONLY: 'success',
  THEORY_ONLY: 'neutral',
  MANDATORY: 'warning',
  ADDITIONAL: 'neutral',
}

const SUBJECT_TEMPLATE_HEADERS = ['CourseId', 'CourseName', 'ComponentType', 'WeeklyPeriods', 'LabBlockLength']
const SUBJECT_TEMPLATE_ROWS = [
  ['OOP', 'Object Oriented Programming Paradigm', 'INTEGRATED_THEORY', '5', ''],
  ['OOP_LAB', 'Object Oriented Programming Paradigm Laboratory', 'INTEGRATED_LAB', '3', '3'],
]

function componentTypeValue(course: Course): string {
  const raw = course.componentType ?? (course as Course & { component_type?: string }).component_type
  if (!raw) return 'Unknown'
  return raw.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function componentTypeTone(course: Course): 'accent' | 'neutral' | 'warning' | 'success' {
  return componentTypeTones[course.componentType] ?? 'neutral'
}

export default function SubjectManagement({ navigate }: { navigate: (p: Page) => void }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ totalRows: number; imported: number; rejected: number; rejectedRows: { row: number; issues: unknown }[] } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ id: '', code: '', name: '', componentType: 'THEORY_ONLY' as ComponentType, labBlockLength: 3 })

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

  function downloadSubjectTemplate() {
    const csv = [SUBJECT_TEMPLATE_HEADERS.join(','), ...SUBJECT_TEMPLATE_ROWS.map(row => row.join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'scedular_subject_template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleSubjectImport(file: File) {
    setImporting(true)
    setError(null)
    setImportResult(null)
    try {
      setImportResult(await api.importSubjects(file))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import subjects')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function handleSave() {
    if (!form.id || !form.code || !form.name) return
    setSaving(true)
    setError(null)
    try {
      await api.courses.create(form)
      setDrawerOpen(false)
      setForm({ id: '', code: '', name: '', componentType: 'THEORY_ONLY', labBlockLength: 3 })
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
      <PageHeader title="Subject Management" desc="The department-wide syllabus catalog — every course, any year, tagged by component type">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn variant="secondary" onClick={downloadSubjectTemplate}><Download size={17} strokeWidth={1.8} />Subject Template</Btn>
        <Btn variant="secondary" onClick={() => importInputRef.current?.click()} disabled={importing}><Upload size={17} strokeWidth={1.8} />{importing ? 'Importing…' : 'Import Subjects'}</Btn>
        <Btn onClick={() => setDrawerOpen(true)}>+ Add Subject</Btn>
      </PageHeader>

      <input ref={importInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && handleSubjectImport(e.target.files[0])} />

      {error && (
        <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>
      )}

      {importResult && (
        <GlassPanel className="mb-4 overflow-hidden">
          <div className={`px-5 py-3 text-sm font-500 ${importResult.rejected === 0 ? 'bg-emerald-400/15 text-emerald-700' : 'bg-amber-400/15 text-amber-700'}`}>
            {importResult.imported} of {importResult.totalRows} subject rows imported{importResult.rejected > 0 ? `, ${importResult.rejected} rejected` : ''}.
          </div>
          {importResult.rejectedRows.length > 0 && (
            <div className="divide-y divide-slate-200/70 text-xs text-slate-600">
              {importResult.rejectedRows.map(row => <div key={row.row} className="px-5 py-2.5 font-mono">Row {row.row}: {JSON.stringify(row.issues)}</div>)}
            </div>
          )}
        </GlassPanel>
      )}

      <GlassPanel className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="tbl text-sm" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-white/25 border-b border-white/40">
              {['Course ID', 'Code', 'Name', 'Component Type', 'Lab Block', ''].map(h => (
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
              <tr key={c.id} className={`border-b border-white/25 hover:bg-white/30 transition ${i % 2 === 0 ? '' : 'bg-white/10'}`}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.id}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.code}</td>
                <td className="px-4 py-3 font-500 text-slate-800">{c.name}</td>
                <td className="px-4 py-3">
                  <Chip tone={componentTypeTone(c)}>{componentTypeLabels[c.componentType] ?? componentTypeValue(c)}</Chip>
                </td>
                <td className="px-4 py-3 text-center font-mono text-xs text-slate-600">{c.labBlockLength}</td>
                <td className="px-4 py-3">
                  <IconBtn tone="danger" title="Delete subject" onClick={() => handleDelete(c.id)}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </IconBtn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="px-4 py-3 border-t border-white/30">
          <p className="text-xs text-slate-500">Showing {courses.length} course{courses.length !== 1 ? 's' : ''}</p>
        </div>
      </GlassPanel>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="w-96 glass-strong overflow-y-auto rounded-l-[2rem]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/40 sticky top-0 glass-strong">
              <h3 className="font-display font-700 text-slate-800">Add Subject</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-white/40 rounded-lg transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Course ID" placeholder="e.g. AIES" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} />
              <Field label="Subject Code" placeholder="e.g. 23AD1311" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              <Field label="Subject Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Select label="Component Type" value={form.componentType} onChange={e => setForm({ ...form, componentType: e.target.value as ComponentType })}>
                {Object.entries(componentTypeLabels).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </Select>
              {(form.componentType === 'LAB_ONLY' || form.componentType === 'INTEGRATED_LAB') && (
                <Field
                  label="Lab Block Length (periods)"
                  hint="Normal labs are 3 contiguous periods; exceptions like Technical Skill Practices use their own configured length."
                  type="number"
                  value={form.labBlockLength}
                  onChange={e => setForm({ ...form, labBlockLength: Number(e.target.value) })}
                />
              )}
              <Btn onClick={handleSave} disabled={saving || !form.id || !form.code || !form.name}>{saving ? 'Saving…' : 'Save Subject'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
