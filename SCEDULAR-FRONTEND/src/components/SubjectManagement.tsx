import { useEffect, useRef, useState } from 'react'
import { PageHeader, Btn, Field, Select, GlassPanel, Chip, IconBtn } from './ui'
import type { Page } from '../types'
import { api, type ComponentType, type Course } from '../api'
import { CYCLE_LABELS, CYCLE_VALUES, isOddSemester } from '../academicCycle'
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
  const [subjects, setSubjects] = useState<any[]>([])
  const [semesterFilter, setSemesterFilter] = useState<'BOTH' | 'ODD' | 'EVEN'>('BOTH')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.subjects.list()
      setSubjects(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subjects from backend')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredSubjects = subjects.filter(s => {
    const isOdd = isOddSemester(s.semester)
    if (semesterFilter === 'ODD') return isOdd
    if (semesterFilter === 'EVEN') return !isOdd
    return true
  })

  return (
    <div className="space-y-4">
      <PageHeader title="Subject Management" desc="Canonical Department Syllabus Catalog (Regulation 2024 — B.Tech AI & DS)">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </PageHeader>

      {/* Semester Type Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs font-700 text-slate-700 uppercase tracking-wider">Semester Type Filter:</span>
          <div className="inline-flex p-1 bg-slate-100 rounded-lg">
            {CYCLE_VALUES.map(t => (
              <button
                key={t}
                onClick={() => setSemesterFilter(t)}
                className={`px-3 py-1 text-xs font-700 rounded-md transition ${
                  semesterFilter === t ? 'bg-[#0F4C81] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {CYCLE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500 font-500">
          Showing <span className="font-700 text-[#0F4C81]">{filteredSubjects.length}</span> of {subjects.length} Canonical Subjects
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline font-600">Retry</button>
        </div>
      )}

      <GlassPanel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl text-xs w-full min-w-[700px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-700 uppercase">
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Subject Name</th>
                <th className="px-4 py-3 text-left">Year / Semester</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-center">Delivery Type</th>
                <th className="px-4 py-3 text-center">Credits</th>
                <th className="px-4 py-3 text-center">Theory / Lab Periods</th>
                <th className="px-4 py-3 text-left">Elective Group / Vertical</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading canonical syllabus...</td></tr>
              )}
              {!loading && filteredSubjects.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No subjects found for this semester filter.</td></tr>
              )}
              {!loading && filteredSubjects.map((s, i) => (
                <tr key={s.id || s.code} className={`hover:bg-slate-50/80 transition ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-4 py-3 font-mono font-700 text-[#0F4C81]">{s.code}</td>
                  <td className="px-4 py-3 font-600 text-slate-800">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className="font-600 text-slate-700">{s.year || 'Year 2'}</span>
                    <span className="text-slate-400 ml-1">· Sem {s.semester || 'III'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-600 text-[10px]">
                      {String(s.category || 'CORE').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded font-700 text-[10px] ${
                      s.deliveryType === 'INTEGRATED' ? 'bg-blue-100 text-blue-800' :
                      s.deliveryType === 'LAB' ? 'bg-teal-100 text-teal-800' :
                      s.deliveryType === 'PROJECT' ? 'bg-purple-100 text-purple-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {s.deliveryType || 'THEORY'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-700 text-slate-700">{s.credits ?? 3}</td>
                  <td className="px-4 py-3 text-center font-mono text-slate-600">
                    {s.theoryPeriods ?? 3}T {s.labPeriods ? `+ ${s.labPeriods}L` : ''}
                  </td>
                  <td className="px-4 py-3 text-slate-500 truncate max-w-[200px]" title={s.vertical || ''}>
                    {s.vertical || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Regulation 2024 Authoritative Curriculum</span>
          <span>Total: {filteredSubjects.length} subjects</span>
        </div>
      </GlassPanel>
    </div>
  )
}
