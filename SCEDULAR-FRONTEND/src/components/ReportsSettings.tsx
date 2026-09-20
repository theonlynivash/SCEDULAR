import { useEffect, useState, useMemo } from 'react'
import { PageHeader, Btn } from './ui'
import type { Page } from '../types'
import { api, type Course, type CourseRequirement, type Faculty, type Section, type TeacherAssignment, type TimetableStatus } from '../api'
import { useScope, matchesScope } from '../scope'

function BarChart({ data, color }: { data: { label: string; value: number; max: number }[]; color: string }) {
  if (data.length === 0) return <p className="text-xs text-slate-400 py-4 text-center">No workload data in this scope.</p>
  return (
    <div className="space-y-3">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-600 font-medium w-36 flex-shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden border border-slate-200/50">
            <div
              className="h-full rounded-lg flex items-center px-2 transition-all"
              style={{ width: `${d.max > 0 ? Math.min(100, (d.value / d.max) * 100) : 0}%`, background: color }}
            >
              <span className="text-[11px] text-white font-600 drop-shadow-sm">{d.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface PreferenceRow {
  faculty: string
  dept: string
  year: string
  subject: string
  code: string
  type: string
  sections: number
  labLinked: boolean
  submitted: boolean
}

function FacultyPreferencesPanel({
  rawPrefs,
  facultyList,
}: {
  rawPrefs: any[]
  facultyList: Faculty[]
}) {
  const chevronDown = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
  const selectStyle = { backgroundImage: chevronDown, backgroundRepeat: 'no-repeat' as const, backgroundPosition: 'right 8px center' }
  const selectCls = "border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 appearance-none cursor-pointer pr-7 font-medium"

  const [acYear, setAcYear] = useState('2026–2027')
  const [sem, setSem] = useState('Odd')
  const [yearFilter, setYearFilter] = useState('All Years')
  const [typeFilter, setTypeFilter] = useState('All')
  const [facultyFilter, setFacultyFilter] = useState('All Faculty')

  // Transform raw preferences from backend into rows
  const transformedRows: PreferenceRow[] = useMemo(() => {
    if (!rawPrefs || rawPrefs.length === 0) {
      return []
    }

    return rawPrefs.map(p => {
      const facName = p.facultyName || facultyList.find(f => f.id === p.facultyId)?.name || p.facultyId
      const yearStr = p.year ? (p.year.toString().includes('Year') ? p.year : `${p.year} Year`) : 'IV Year'
      return {
        faculty: facName,
        dept: 'AI&DS',
        year: yearStr,
        subject: p.subjectName || p.subjectCode || 'Subject',
        code: p.subjectCode || '23ADXXXX',
        type: p.deliveryType === 'LAB' ? 'Lab' : p.isCore ? 'Theory ★' : 'Theory',
        sections: p.requestedSections || p.targetSections || 1,
        labLinked: !!p.relatedLabCode || p.deliveryType === 'INTEGRATED',
        submitted: p.status === 'SUBMITTED' || p.status === 'APPROVED' || true,
      }
    })
  }, [rawPrefs, facultyList])

  // Filtered rows
  const filteredRows = useMemo(() => {
    return transformedRows.filter(r => {
      if (yearFilter !== 'All Years' && !r.year.toLowerCase().includes(yearFilter.toLowerCase().replace('year', '').trim())) {
        return false
      }
      if (typeFilter === 'Theory' && !r.type.includes('Theory')) return false
      if (typeFilter === 'Lab' && !r.type.includes('Lab')) return false
      if (facultyFilter !== 'All Faculty' && r.faculty !== facultyFilter) return false
      return true
    })
  }, [transformedRows, yearFilter, typeFilter, facultyFilter])

  function exportPreferencesCsv() {
    const headers = ['Faculty', 'Department', 'Year', 'Subject Code', 'Subject Name', 'Type', 'Sections', 'Lab Linked', 'Status']
    const rows = filteredRows.map(r => [
      r.faculty,
      r.dept,
      r.year,
      r.code,
      r.subject,
      r.type,
      String(r.sections),
      r.labLinked ? 'Yes' : 'No',
      r.submitted ? 'Submitted' : 'Pending',
    ])
    const csv = [headers.join(','), ...rows.map(row => row.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `faculty_subject_preferences_${acYear}_${sem}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display font-700 text-sm text-slate-800">Faculty Subject Preferences — Opted Subjects</h3>
          <p className="text-xs text-slate-400 mt-0.5">All faculty subject option selections for the selected academic period</p>
        </div>
        <button
          onClick={exportPreferencesCsv}
          className="px-3.5 py-1.5 bg-[#0F4C81] text-white text-xs font-600 rounded-lg hover:bg-[#0a3860] transition shadow-sm"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-slate-100">
        <select value={acYear} onChange={e => setAcYear(e.target.value)} className={selectCls} style={selectStyle}>
          {['2024–2025', '2025–2026', '2026–2027', '2027–2028'].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={sem} onChange={e => setSem(e.target.value)} className={selectCls} style={selectStyle}>
          <option value="Odd">Odd Semester</option>
          <option value="Even">Even Semester</option>
        </select>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={selectCls} style={selectStyle}>
          <option value="All Years">All Years</option>
          <option value="IV Year">IV Year</option>
          <option value="III Year">III Year</option>
          <option value="II Year">II Year</option>
          <option value="I Year">I Year</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={selectCls} style={selectStyle}>
          <option value="All">All Types</option>
          <option value="Theory">Theory Only</option>
          <option value="Lab">Lab Only</option>
        </select>
        <select value={facultyFilter} onChange={e => setFacultyFilter(e.target.value)} className={selectCls} style={selectStyle}>
          <option value="All Faculty">All Faculty ({facultyList.length || '58'})</option>
          {facultyList.map(f => (
            <option key={f.id} value={f.name}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Preferences Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
              <th className="py-2.5 px-3">Faculty Name</th>
              <th className="py-2.5 px-3">Dept</th>
              <th className="py-2.5 px-3">Year</th>
              <th className="py-2.5 px-3">Subject Name &amp; Code</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3 text-center">Sections</th>
              <th className="py-2.5 px-3 text-center">Lab Linked</th>
              <th className="py-2.5 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-6 text-slate-400">
                  No subject preferences found matching filter criteria.
                </td>
              </tr>
            ) : (
              filteredRows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/60 transition">
                  <td className="py-2.5 px-3 font-600 text-slate-800">{r.faculty}</td>
                  <td className="py-2.5 px-3 text-slate-500">{r.dept}</td>
                  <td className="py-2.5 px-3 text-slate-600">{r.year}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-600 text-slate-800">{r.subject}</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">({r.code})</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-600 ${r.type.includes('★') ? 'bg-amber-100 text-amber-800' : r.type === 'Lab' ? 'bg-teal-100 text-teal-800' : 'bg-blue-100 text-blue-800'}`}>
                      {r.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-700 text-[#0F4C81]">{r.sections}</td>
                  <td className="py-2.5 px-3 text-center">
                    {r.labLinked ? (
                      <span className="text-teal-600 font-700">✓ Yes</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-700 bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ✓ Submitted
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
  const [rawPreferences, setRawPreferences] = useState<any[]>([])
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
      api.facultyAllocation.getHodPreferences().catch(() => ({ preferences: [], demand: [] })),
    ])
      .then(([f, s, c, a, r, hodData]) => {
        setFaculty(f)
        setSections(s)
        setCourses(c)
        setAssignments(a)
        setRequirements(r)
        if (hodData?.preferences) {
          setRawPreferences(hodData.preferences)
        }
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

  const displayStats = stats.filter(s => s.assigned > 0 || s.sections.length > 0).sort((a, b) => b.assigned - a.assigned)

  const workloadData = displayStats.map(s => ({ label: s.faculty.name, value: s.assigned, max: s.faculty.maxWeeklyPeriods || 18 }))
  const freeData = displayStats.map(s => ({
    label: s.faculty.name,
    value: Math.max(0, (s.faculty.maxWeeklyPeriods || 18) - s.assigned),
    max: s.faculty.maxWeeklyPeriods || 18,
  }))

  function downloadCsv() {
    const headers = ['FacultyId', 'FacultyName', 'Designation', 'AssignedPeriodsPerWeek', 'MaxWeeklyPeriods', 'FreePeriodsPerWeek', 'Sections']
    const rows = displayStats.map(s => [
      s.faculty.id,
      s.faculty.name,
      s.faculty.designation ?? '',
      String(s.assigned),
      String(s.faculty.maxWeeklyPeriods || 18),
      String(Math.max(0, (s.faculty.maxWeeklyPeriods || 18) - s.assigned)),
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
    <div className="space-y-5">
      <PageHeader title="Reports & Workload Analytics">
        <button
          onClick={() => navigate('dashboard')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Btn onClick={downloadCsv} disabled={displayStats.length === 0}>Export Workload CSV</Btn>
      </PageHeader>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-3">{error}</div>}

      {masterStatus && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-700 ${masterStatus.status === 'GREEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              Master Status: {masterStatus.status}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {masterStatus.count} allocated periods &middot; Generated {new Date(masterStatus.generatedAt).toLocaleString()}
            </span>
          </div>
          <button onClick={() => navigate('view-timetable')} className="text-xs font-600 text-[#0F4C81] hover:underline">
            View Schedule Timetable →
          </button>
        </div>
      )}

      {/* Bar Charts Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-display font-700 text-sm text-slate-800 mb-4">Faculty Workload Distribution (periods/week)</h3>
          <BarChart color="#0F4C81" data={workloadData} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-display font-700 text-sm text-slate-800 mb-4">Free Capacity — Faculty (periods/week)</h3>
          <BarChart color="#f59e0b" data={freeData} />
        </div>
      </div>

      {/* Faculty Preferences Panel Component */}
      <FacultyPreferencesPanel rawPrefs={rawPreferences} facultyList={faculty} />

      {/* Assigned Workload Summary Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-display font-700 text-sm text-slate-800">Assigned Teaching Workload Summary</h3>
          <p className="text-xs text-slate-400 mt-0.5">Summary of faculty section assignments across AI &amp; DS batches</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 uppercase font-700 tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-3">Faculty</th>
                <th className="py-2.5 px-3">Designation</th>
                <th className="py-2.5 px-3 text-center">Assigned</th>
                <th className="py-2.5 px-3 text-center">Max Weekly</th>
                <th className="py-2.5 px-3 text-center">Free Slots</th>
                <th className="py-2.5 px-3">Assigned Sections</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {displayStats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">
                    No assigned workload data in this scope.
                  </td>
                </tr>
              ) : (
                displayStats.map(s => (
                  <tr key={s.faculty.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-2.5 px-3 font-600 text-slate-800 whitespace-nowrap">{s.faculty.name}</td>
                    <td className="py-2.5 px-3 text-slate-500">{s.faculty.designation ?? 'Faculty'}</td>
                    <td className="py-2.5 px-3 text-center font-700 text-[#0F4C81]">{s.assigned}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{s.faculty.maxWeeklyPeriods || 18}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-600 bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {Math.max(0, (s.faculty.maxWeeklyPeriods || 18) - s.assigned)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {[...new Set(s.sections.map(r => r.sectionId))].map(id => `${id} (${courseNameById.get(s.sections.find(r => r.sectionId === id)!.courseId) ?? ''})`).join(', ') || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
