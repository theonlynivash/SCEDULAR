import { useMemo, useState } from 'react'
import { Check, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { api, type AssignBoard, type BoardTeacher } from '../api'
import TeacherPicker from './TeacherPicker'

interface PlanRow { facultyId: string; n: number }
interface PlanSubject { subjectId: string; code: string; name: string; open: number; per: number; wanted: number; rows: PlanRow[]; applied: boolean }

/**
 * Auto-fill with an editable workload. "Build plan" proposes who takes how many sections of each open subject; the HOD
 * changes any teacher's share with − / + (a teacher's workload is sections × periods per section), adds or removes teachers,
 * and the subject's remaining need moves with every change. A subject can only be applied when its plan covers exactly
 * the open sections (nothing missing, nothing extra); then the HOD moves on to the next subject.
 */
export default function AutoPlanner({ semester, board, say, onChanged }: {
  semester: string; board: AssignBoard; say: (ok: boolean, text: string) => void; onChanged: () => void
}) {
  const [plans, setPlans] = useState<PlanSubject[] | null>(null)
  const [active, setActive] = useState('')
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const cap = board.maxWeeklyPeriods ?? board.teachers[0]?.max ?? 28
  const byId = useMemo(() => new Map(board.teachers.map(t => [t.facultyId, t])), [board])

  // periods the HOD has planned but not yet saved, per teacher (so the cap is checked across subjects)
  const planned = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of plans ?? []) if (!p.applied) for (const r of p.rows) m.set(r.facultyId, (m.get(r.facultyId) ?? 0) + r.n * p.per)
    return m
  }, [plans])

  async function build() {
    setBusy(true)
    try {
      const r = await api.facultyAllocation.autoAssign({ semester, dryRun: true })
      const next: PlanSubject[] = (r.subjects ?? []).map(s => ({
        subjectId: s.subjectId, code: s.code, name: s.name, open: s.open, per: s.periodsPerSection, wanted: s.teachersWanted, applied: false,
        rows: r.plan.filter(x => x.subjectId === s.subjectId).map(x => ({ facultyId: x.facultyId, n: x.sectionIds.length })),
      }))
      setPlans(next); setActive(next[0]?.subjectId ?? '')
      if (next.length === 0) say(true, 'Every subject already has its teachers.')
    } catch (e: any) { say(false, e?.message || 'Could not build the plan.') }
    finally { setBusy(false) }
  }

  const patch = (id: string, fn: (p: PlanSubject) => PlanSubject) => setPlans(cur => (cur ?? []).map(p => (p.subjectId === id ? fn(p) : p)))
  const step = (p: PlanSubject, facultyId: string, d: number) => patch(p.subjectId, x => ({ ...x, rows: x.rows.map(r => (r.facultyId === facultyId ? { ...r, n: Math.max(1, r.n + d) } : r)) }))
  const drop = (p: PlanSubject, facultyId: string) => patch(p.subjectId, x => ({ ...x, rows: x.rows.filter(r => r.facultyId !== facultyId) }))
  const add = (p: PlanSubject, t: BoardTeacher) => { patch(p.subjectId, x => ({ ...x, rows: [...x.rows, { facultyId: t.facultyId, n: Math.max(1, Math.min(3, x.open - x.rows.reduce((n, r) => n + r.n, 0))) }] })); setAdding('') }

  /** Give the sections that are still uncovered to the teachers with the most room, those who chose the subject first. */
  function fillRest(p: PlanSubject) {
    let left = p.open - p.rows.reduce((n, r) => n + r.n, 0)
    if (left <= 0) return
    const used = new Set(p.rows.map(r => r.facultyId))
    const room = (t: BoardTeacher) => cap - t.load - (planned.get(t.facultyId) ?? 0)
    const cand = board.teachers.filter(t => !used.has(t.facultyId)).sort((a, b) =>
      Number(b.prefs.some(x => x.subjectId === p.subjectId)) - Number(a.prefs.some(x => x.subjectId === p.subjectId)) || Number(b.free) - Number(a.free) || room(b) - room(a))
    const rows = [...p.rows]
    for (const t of cand) {
      if (left <= 0) break
      const k = Math.min(left, Math.floor(room(t) / Math.max(1, p.per)))
      if (k >= 1) { rows.push({ facultyId: t.facultyId, n: k }); left -= k }
    }
    patch(p.subjectId, x => ({ ...x, rows }))
    if (left > 0) say(false, `${left} section${left === 1 ? '' : 's'} of ${p.code} cannot be covered: no teacher has room left. Need more teachers (see the staffing card above).`)
  }

  const balance = (p: PlanSubject) => p.open - p.rows.reduce((n, r) => n + r.n, 0)   // + = still needed, − = too many

  async function apply(p: PlanSubject, override = false): Promise<boolean> {
    setBusy(true)
    try {
      await api.facultyAllocation.applyPlan({ semester, subjectId: p.subjectId, allocations: p.rows.map(r => ({ facultyId: r.facultyId, sectionCount: r.n })), override })
      patch(p.subjectId, x => ({ ...x, applied: true }))
      onChanged()
      const next = (plans ?? []).find(x => !x.applied && x.subjectId !== p.subjectId)
      setActive(next?.subjectId ?? '')
      say(true, `${p.code} is fully staffed.${next ? ` Next: ${next.code}.` : ' That was the last subject.'}`)
      return true
    } catch (e: any) {
      if (e?.code === 'FACULTY_CAPACITY_EXCEEDED' && !override && window.confirm(`${e.message}\n\nAssign anyway?`)) { setBusy(false); return apply(p, true) }
      say(false, e?.message || 'Could not apply this subject.')
      return false
    } finally { setBusy(false) }
  }

  async function applyAll() {
    for (const p of (plans ?? []).filter(x => !x.applied && balance(x) === 0 && x.rows.length > 0)) if (!(await apply(p))) break
  }

  const pending = (plans ?? []).filter(p => !p.applied)
  const balanced = pending.filter(p => balance(p) === 0 && p.rows.length > 0)

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 space-y-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-700 text-sm text-slate-800">Auto-fill with editable workload</h2>
          <p className="text-[11px] text-slate-500">Build a plan from the preferences, then change anyone's share with − / +. Whatever you add or remove changes what the subject still needs; fill the difference with other teachers. A subject can be assigned only when its sections add up exactly.</p>
        </div>
        <button disabled={busy} onClick={build} className="px-4 py-1.5 border border-[#1f6a63] text-[#1f6a63] text-xs font-700 rounded-lg disabled:opacity-40">{plans ? 'Rebuild plan' : 'Build plan'}</button>
        {plans && balanced.length > 1 && <button disabled={busy} onClick={applyAll} className="px-4 py-1.5 bg-[#1f6a63] text-white text-xs font-700 rounded-lg disabled:opacity-40">Assign all {balanced.length} balanced subjects</button>}
      </div>

      {plans && plans.length > 0 && pending.length === 0 && <p className="text-xs font-700 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ Every subject of this plan is assigned. Semester allocation is done; move on to the next semester or generate the timetable.</p>}

      <div className="space-y-2">
        {(plans ?? []).map(p => {
          const bal = balance(p), isOpen = active === p.subjectId && !p.applied
          const covered = p.rows.reduce((n, r) => n + r.n, 0)
          return (
            <div key={p.subjectId} className={`border rounded-xl overflow-hidden ${p.applied ? 'border-emerald-200 bg-emerald-50/40' : bal === 0 ? 'border-slate-200' : 'border-amber-300 bg-amber-50/30'}`}>
              <button onClick={() => !p.applied && setActive(isOpen ? '' : p.subjectId)} className="w-full text-left px-3 py-2 flex items-center gap-2 text-xs">
                <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                <span className="font-mono text-[11px] text-[#1f6a63] font-700">{p.code}</span>
                <span className="font-600 text-slate-800 truncate">{p.name}</span>
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <span className="text-[10.5px] text-slate-500">{covered} of {p.open} sections · {p.rows.length}{p.wanted ? ` of ${p.wanted}` : ''} teachers</span>
                  {p.applied ? <span className="text-[10.5px] font-700 text-emerald-700"><Check className="inline w-3 h-3" /> assigned</span>
                    : bal === 0 ? <span className="text-[10.5px] font-700 text-emerald-700">balanced</span>
                    : bal > 0 ? <span className="text-[10.5px] font-700 text-amber-700">+{bal} still needed</span>
                    : <span className="text-[10.5px] font-700 text-amber-700">{bal} too many</span>}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg bg-white">
                    {p.rows.length === 0 && <p className="px-3 py-3 text-[11px] text-slate-400">Nobody yet. Add a teacher below.</p>}
                    {p.rows.map(r => {
                      const t = byId.get(r.facultyId)
                      if (!t) return null
                      const mine = r.n * p.per, after = t.load + (planned.get(r.facultyId) ?? 0), over = after > cap
                      return (
                        <div key={r.facultyId} className="px-3 py-2 flex items-center gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-600 text-slate-800 truncate">{t.name}{t.prefs.some(x => x.subjectId === p.subjectId) && <span className="ml-1.5 text-[10px] font-700 text-emerald-700">chose it ✓</span>}</p>
                            <p className="text-[10.5px] text-slate-400 truncate">{t.assigned.length ? `already: ${t.assigned.map(a => `${a.code}×${a.sections}`).join(', ')}` : 'free'}</p>
                          </div>
                          <span title="This teacher's workload after everything planned" className={`w-24 text-right text-[11px] font-700 ${over ? 'text-amber-700' : 'text-slate-700'}`}>{after}/{cap}<span className="font-500 text-slate-400"> periods</span></span>
                          <div className="flex items-center border border-slate-200 rounded-md overflow-hidden" title="Sections this teacher takes of this subject">
                            <button onClick={() => step(p, r.facultyId, -1)} disabled={r.n <= 1} className="px-2 py-1 hover:bg-slate-50 disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                            <span className="w-14 text-center font-800">{r.n} <span className="font-500 text-slate-400">sec</span></span>
                            <button onClick={() => step(p, r.facultyId, 1)} className="px-2 py-1 hover:bg-slate-50"><Plus className="w-3 h-3" /></button>
                          </div>
                          <span title="periods per week for this subject" className="w-12 text-right text-[10.5px] text-slate-400">{mine} per</span>
                          <button title="Remove this teacher from the plan" onClick={() => drop(p, r.facultyId)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      )
                    })}
                  </div>

                  <div className={`rounded-lg px-3 py-2 text-[11.5px] font-600 flex items-center gap-2 flex-wrap ${bal === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                    <span>{bal === 0 ? `✓ Balanced: ${p.open} sections covered by ${p.rows.length} teacher${p.rows.length === 1 ? '' : 's'}.` : bal > 0 ? `${bal} section${bal === 1 ? '' : 's'} (${bal * p.per} periods) still need a teacher. Add another teacher or give someone more.` : `${-bal} section${-bal === 1 ? '' : 's'} too many. Take them off a teacher.`}</span>
                    {bal > 0 && <button onClick={() => fillRest(p)} className="ml-auto px-2.5 py-1 rounded-md bg-white border border-amber-300 text-amber-900 font-700 hover:bg-amber-100">Fill the rest automatically</button>}
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => setAdding(adding === p.subjectId ? '' : p.subjectId)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-700 text-[#1b5550] hover:bg-slate-50"><Plus className="w-3.5 h-3.5" /> Add a teacher</button>
                    <button disabled={busy || bal !== 0 || p.rows.length === 0} onClick={() => apply(p)} title={bal !== 0 ? 'Make the sections add up first' : ''} className="ml-auto px-5 py-1.5 rounded-lg bg-[#1f6a63] text-white text-xs font-700 disabled:opacity-40">Assign {p.code}</button>
                  </div>
                  {adding === p.subjectId && (
                    <TeacherPicker teachers={board.teachers} subjectId={p.subjectId} semester={semester} exclude={new Set(p.rows.map(r => r.facultyId))} maxHeight={260}
                      action={t => <button onClick={() => add(p, t)} className="px-3 py-1.5 rounded-md bg-[#1f6a63] text-white text-xs font-700">Add</button>} />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

}
