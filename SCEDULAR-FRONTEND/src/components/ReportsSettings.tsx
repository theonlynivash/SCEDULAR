import { useEffect, useState } from 'react'
import { PageHeader, Btn, GlassPanel, Chip } from './ui'
import type { Page } from '../types'
import { api, type Course, type CourseRequirement, type Faculty, type Section, type TeacherAssignment, type TimetableStatus } from '../api'
import { useScope, matchesScope } from '../scope'

function BarChart({ data, color }: { data: { label: string; value: number; max: number }[]; color: string }) {
  if (data.length === 0) return <p className="text-sm text-slate-400">No data for this scope.</p>
  return (
    <div className="space-y-3">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-36 flex-shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-6 bg-white/30 rounded-lg overflow-hidden border border-white/40">
            <div
              className="h-full rounded-lg flex items-center px-2 transition-all"
              style={{ width: `${d.max > 0 ? (d.value / d.max) * 100 : 0}%`, background: color }}
            >
              <span className="text-xs text-white font-500">{d.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface FacultyStat {
  faculty: Faculty
  sections: { sectionId: string; courseId: string; periods: number }[]
  assigned: number
}

export function Reports({ navigate }: { navigate: (p: Page) => void }) {
  const { scope } = useScope()
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [requirements, setRequirements] = useState<CourseRequirement[]>([])
  const [masterStatus, setMasterStatus] = useState<{ status: TimetableStatus; generatedAt: string; count: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.faculty.list(),
      api.sections.list(),
      api.courses.list(),
      api.workload.listTeacherAssignments(),
      api.workload.listRequirements(),
    ])
      .then(([f, s, c, a, r]) => {
        setFaculty(f)
        setSections(s)
        setCourses(c)
        setAssignments(a)
        setRequirements(r)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load report data from the backend'))
      .finally(() => setLoading(false))

    api.timetable
      .master()
      .then(m => setMasterStatus({ status: m.status, generatedAt: m.generatedAt, count: m.assignments.length }))
      .catch(() => setMasterStatus(null))
  }, [])

  const sectionById = new Map(sections.map(s => [s.id, s]))
  const courseNameById = new Map(courses.map(c => [c.id, c.name]))
  const reqByKey = new Map(requirements.map(r => [`${r.courseId}::${r.sectionId}`, r]))

  const inScope = (sectionId: string) => {
    const sec = sectionById.get(sectionId)
    return matchesScope(scope, sec?.year ?? null, sec?.semester ?? null)
  }

  const stats: FacultyStat[] = faculty.map(f => {
    const rows = assignments
      .filter(a => a.facultyId === f.id && inScope(a.sectionId))
      .map(a => {
        const req = reqByKey.get(`${a.courseId}::${a.sectionId}`)
        const periods = (req?.weeklyTheoryPeriods ?? 0) + (req?.weeklyLabPeriods ?? 0)
        return { sectionId: a.sectionId, courseId: a.courseId, periods }
      })
    return { faculty: f, sections: rows, assigned: rows.reduce((sum, r) => sum + r.periods, 0) }
  })

  const activeStats = stats.filter(s => s.sections.length > 0).sort((a, b) => b.assigned - a.assigned)

  const workloadData = activeStats.map(s => ({ label: s.faculty.name, value: s.assigned, max: s.faculty.maxWeeklyPeriods }))
  const freeData = activeStats.map(s => ({ label: s.faculty.name, value: Math.max(0, s.faculty.maxWeeklyPeriods - s.assigned), max: s.faculty.maxWeeklyPeriods }))

  function downloadCsv() {
    const headers = ['FacultyId', 'FacultyName', 'Designation', 'AssignedPeriodsPerWeek', 'MaxWeeklyPeriods', 'FreePeriodsPerWeek', 'Sections']
    const rows = activeStats.map(s => [
      s.faculty.id,
      s.faculty.name,
      s.faculty.designation ?? '',
      String(s.assigned),
      String(s.faculty.maxWeeklyPeriods),
      String(Math.max(0, s.faculty.maxWeeklyPeriods - s.assigned)),
      s.sections.map(r => r.sectionId).join(' '),
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scedular_faculty_workload.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader title="Reports & Analytics">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-500 text-slate-600 glass-pill transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn onClick={downloadCsv} disabled={activeStats.length === 0}>Export CSV</Btn>
      </PageHeader>

      {error && <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>}
      {loading && <p className="text-sm text-slate-400 mb-4">Loading…</p>}

      {masterStatus && (
        <GlassPanel className="p-4 mb-5 flex items-center gap-3 flex-wrap">
          <Chip tone={masterStatus.status === 'GREEN' ? 'success' : masterStatus.status === 'RED' ? 'danger' : 'warning'}>
            Latest run: {masterStatus.status}
          </Chip>
          <span className="text-xs text-slate-500">{masterStatus.count} assignments · generated {new Date(masterStatus.generatedAt).toLocaleString()}</span>
        </GlassPanel>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <GlassPanel className="p-6">
          <h3 className="font-display font-700 text-sm text-slate-800 mb-4">Faculty Workload (periods/week)</h3>
          <BarChart color="#0e254f" data={workloadData} />
        </GlassPanel>

        <GlassPanel className="p-6">
          <h3 className="font-display font-700 text-sm text-slate-800 mb-4">Free Capacity — Faculty (periods/week)</h3>
          <BarChart color="#f3c326" data={freeData} />
        </GlassPanel>
      </div>

      <GlassPanel className="p-0 overflow-x-auto mt-5">
        <table className="tbl text-sm">
          <thead>
            <tr className="bg-white/40">
              {['Faculty', 'Designation', 'Assigned', 'Max Weekly', 'Free', 'Sections'].map(h => (
                <th key={h} className="border border-slate-300/50 px-3 py-2.5 text-left text-xs font-600 text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && activeStats.length === 0 && (
              <tr><td colSpan={6} className="border border-slate-300/50 px-3 py-8 text-center text-slate-400 text-sm">No faculty assignments in this scope yet.</td></tr>
            )}
            {activeStats.map(s => (
              <tr key={s.faculty.id} className="hover:bg-white/30 transition">
                <td className="border border-slate-300/50 px-3 py-2.5 font-500 text-slate-800 whitespace-nowrap">{s.faculty.name}</td>
                <td className="border border-slate-300/50 px-3 py-2.5 text-slate-500">{s.faculty.designation ?? '—'}</td>
                <td className="border border-slate-300/50 px-3 py-2.5 text-center font-700 text-[#0e254f]">{s.assigned}</td>
                <td className="border border-slate-300/50 px-3 py-2.5 text-center text-slate-600">{s.faculty.maxWeeklyPeriods}</td>
                <td className="border border-slate-300/50 px-3 py-2.5 text-center">
                  <Chip tone={s.faculty.maxWeeklyPeriods - s.assigned < 0 ? 'danger' : 'success'}>{Math.max(0, s.faculty.maxWeeklyPeriods - s.assigned)}</Chip>
                </td>
                <td className="border border-slate-300/50 px-3 py-2.5 text-slate-600">
                  {[...new Set(s.sections.map(r => r.sectionId))].map(id => `${id} (${courseNameById.get(s.sections.find(r => r.sectionId === id)!.courseId) ?? ''})`).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  )
}
