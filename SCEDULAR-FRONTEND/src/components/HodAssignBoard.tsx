import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type AssignBoard } from '../api'
import HodPreferencesTab from './HodPreferencesTab'
import HodTemplatesTab from './HodTemplatesTab'
import HodAssignWorkspace from './HodAssignWorkspace'
import StaffingCard from './StaffingCard'
import { PillTabs } from './ui'

type Tab = 'preferences' | 'assign' | 'templates'

function tl(theory: number, lab: number): string {
  return lab > 0 ? `${theory}T + ${lab}L` : `${theory}T`
}

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'preferences', label: 'Preferences', hint: 'Review what teachers chose' },
  { id: 'assign', label: 'Assign', hint: 'Give sections to teachers' },
  { id: 'templates', label: 'Templates & Auto-fill', hint: 'Workload templates, workload, auto-fill' },
]

/**
 * HOD workspace for staffing a semester: review teacher preferences, assign sections
 * (subject -> teacher -> n sections; the workload template is derived: n x (theory + lab)),
 * and apply templates in bulk with auto-fill.
 */
export default function HodAssignBoard() {
  const [semesters, setSemesters] = useState<string[]>([])
  const [semester, setSemester] = useState('')
  const [boards, setBoards] = useState<Record<string, AssignBoard>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [tab, setTab] = useState<Tab>('assign')

  const say = useCallback((ok: boolean, text: string) => { setNotice({ ok, text }); setTimeout(() => setNotice(null), 6000) }, [])

  const loadAll = useCallback(async (sems: string[], pick?: string) => {
    setLoading(true)
    setError(null)
    try {
      const entries = await Promise.all(sems.map(async s => [s, await api.facultyAllocation.getAssignBoard(s)] as const))
      const map = Object.fromEntries(entries)
      setBoards(map)
      setSemester(prev => pick ?? (prev && map[prev]?.subjects.length ? prev : (sems.find(s => map[s].subjects.length > 0) ?? sems[0] ?? '')))
    } catch (e: any) {
      setError(e?.message || 'Could not load subjects.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api.facultyAllocation.getAcademicCycle()
      .then(ctx => { const list = (ctx as any).allowedSemesters ?? []; setSemesters(list); loadAll(list) })
      .catch(e => { setError(e?.message || 'Could not read academic cycle.'); setLoading(false) })
  }, [loadAll])

  const refresh = useCallback(() => loadAll(semesters, semester), [loadAll, semesters, semester])
  const board = boards[semester] ?? null

  const totals = useMemo(() => {
    const subs = board?.subjects ?? []
    return {
      sections: subs.reduce((n, s) => n + s.sectionCount, 0),
      done: subs.reduce((n, s) => n + s.assignedCount, 0),
      openSubjects: subs.filter(s => s.assignedCount < s.sectionCount).length,
    }
  }, [board])

  return (
    <div className="flex flex-col space-y-4">
      <div className="liquid px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-800 text-lg text-[#0F4C81]">Assign Teachers to Subjects</h1>
            <p className="text-[11px] text-slate-500">Review preferences, give sections to teachers, or apply templates in bulk. Theory and lab always go together.</p>
          </div>
          <PillTabs value={semester} onChange={setSemester}
            tabs={semesters.filter(sm => (boards[sm]?.subjects.length ?? 0) > 0).map(sm => ({ id: sm, label: `Sem ${sm}` }))} />
        </div>
        {board && totals.sections > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-slate-600 mb-1">
              <span><b>{totals.done}</b> of <b>{totals.sections}</b> sections have a teacher</span>
              <span>{totals.openSubjects === 0 ? 'Ready for timetable ✓' : `${totals.openSubjects} subject${totals.openSubjects === 1 ? '' : 's'} still open`}</span>
            </div>
            <div className="h-1.5 bg-[#0e254f]/8 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#2f6fc4]/60 to-[#16367a]/70 transition-all" style={{ width: `${(100 * totals.done) / totals.sections}%` }} />
            </div>
          </div>
        )}
        <div className="mt-3"><PillTabs value={tab} onChange={setTab} tabs={TABS.map(t => ({ id: t.id, label: t.label, title: t.hint }))} /></div>
      </div>

      <StaffingCard refreshKey={boards} />

      {notice && (
        <div className={`text-xs font-600 rounded-xl px-4 py-3 border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {notice.ok ? '✓' : '⚠'} {notice.text}
        </div>
      )}
      {loading && !board && <p className="text-sm text-slate-500 py-10 text-center">Loading…</p>}
      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-4">{error}</p>}

      {semester && tab === 'preferences' && <HodPreferencesTab semester={semester} board={board} say={say} onChanged={refresh} />}
      {semester && tab === 'templates' && <HodTemplatesTab semester={semester} board={board} say={say} onChanged={refresh} />}

      {tab === 'assign' && board && <HodAssignWorkspace board={board} semester={semester} onChanged={refresh} say={say} />}
    </div>
  )
}
