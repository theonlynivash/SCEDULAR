import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { api, type StaffingReport, type TeacherWorkload } from '../api'

const YEAR: Record<string, string> = { I: 'Year 1', II: 'Year 1', III: 'Year 2', IV: 'Year 2', V: 'Year 3', VI: 'Year 3', VII: 'Year 4', VIII: 'Year 4' }
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Staffing for this cycle. Closed it is one calm line (are the teachers enough?); opened it shows the figures behind that:
 * demand and capacity, semester by semester, the minimum teachers needed, who still has room, and what to do about it.
 */
export default function StaffingCard({ refreshKey }: { refreshKey: unknown }) {
  const [r, setR] = useState<StaffingReport | null>(null)
  const [open, setOpen] = useState(false)
  const [teachers, setTeachers] = useState<TeacherWorkload[] | null>(null)
  const [allSubjects, setAllSubjects] = useState(false)
  useEffect(() => { api.facultyAllocation.staffing().then(setR).catch(() => setR(null)) }, [refreshKey])
  // each teacher's load is only fetched once the card is opened
  useEffect(() => {
    if (!open) return
    let live = true
    api.facultyAllocation.teacherWorkload().then(x => { if (live) setTeachers(x.teachers) }).catch(() => { if (live) setTeachers([]) })
    return () => { live = false }
  }, [open, refreshKey])

  const calc = useMemo(() => {
    if (!r) return null
    const cap = r.maxWeeklyPeriods
    const capacity = r.teachers * cap
    const sectionsTotal = r.subjects.reduce((n, s) => n + s.sections, 0)
    const typical = sectionsTotal > 0 ? Math.max(1, Math.round(r.totalDemandPeriods / sectionsTotal)) : 0   // periods a teacher takes on per section
    const limitNeeded = r.teachers > 0 ? Math.ceil(r.totalDemandPeriods / r.teachers) : 0                  // weekly limit at which today's teachers would suffice
    const attention = r.subjects.filter(s => s.openSections > 0)
    return { cap, capacity, spare: capacity - r.totalDemandPeriods, typical, limitNeeded, attention, slotsWanted: r.subjects.reduce((n, s) => n + s.teachersWanted, 0), slotsChosen: r.subjects.reduce((n, s) => n + Math.min(s.chosen, s.teachersWanted), 0) }
  }, [r])

  if (!r || !calc || r.totalDemandPeriods === 0) return null
  const { cap, capacity, spare, typical, limitNeeded, attention } = calc
  const scale = Math.max(capacity, r.totalDemandPeriods, 1)
  const tone = r.enough ? 'ok' : 'warn'

  // who can take more: free capacity per teacher, from the loads of every semester (the weekly limit is shared)
  const live = teachers?.filter(t => t.max > 0) ?? []
  const idle = live.filter(t => t.load === 0)
  const over = live.filter(t => t.overBy > 0)
  const full = live.filter(t => t.load > 0 && t.remaining === 0 && t.overBy === 0)
  const free = live.filter(t => t.remaining > 0).sort((a, b) => b.remaining - a.remaining)
  const freePeriods = free.reduce((n, t) => n + t.remaining, 0)
  const absorb = typical > 0 ? free.reduce((n, t) => n + Math.floor(t.remaining / typical), 0) : 0
  const avgLoad = live.length ? Math.round(live.reduce((n, t) => n + t.load, 0) / live.length) : 0

  // plain suggestions, only the ones that apply
  const tips: string[] = []
  if (!r.enough) {
    tips.push(`Add ${plural(r.moreTeachersNeeded, 'teacher')}, or raise the weekly limit from ${cap} to ${limitNeeded} periods (Settings → Policy & cycle) so today's ${r.teachers} teachers can carry the demand.`)
  } else if (r.openPeriods > 0) {
    tips.push(`${r.openPeriods} periods are still without a teacher, and the teachers have enough room for them. Use Auto-assign, or assign by hand.`)
  }
  if (r.enough && r.openPeriods === 0 && spare > 0) tips.push(`Every period has a teacher. There is room for about ${Math.floor(spare / Math.max(1, typical))} more section${Math.floor(spare / Math.max(1, typical)) === 1 ? '' : 's'} before the limit is reached.`)
  if (teachers && over.length > 0) tips.push(`${plural(over.length, 'teacher')} ${over.length === 1 ? 'is' : 'are'} above the ${cap}-period limit (${over.slice(0, 3).map(t => `${t.name} +${t.overBy}`).join(', ')}${over.length > 3 ? ', …' : ''}). Move a section to someone with free time.`)
  if (teachers && idle.length > 0 && r.openPeriods > 0) tips.push(`${plural(idle.length, 'teacher')} ${idle.length === 1 ? 'has' : 'have'} no classes yet and can take the open sections first.`)
  if (attention.length > 0) tips.push(`${plural(attention.length, 'subject')} still ${attention.length === 1 ? 'has' : 'have'} sections without a teacher (listed below).`)

  const stat = (label: string, value: string, note?: string) => (
    <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2.5 min-w-0">
      <p className="text-[10.5px] uppercase tracking-wider font-600 text-slate-500">{label}</p>
      <p className="text-[17px] leading-tight font-700 text-slate-800 mt-0.5 tabular-nums">{value}</p>
      {note && <p className="text-[10.5px] text-slate-500 mt-0.5">{note}</p>}
    </div>
  )

  return (
    <div className={`rounded-2xl border ${tone === 'ok' ? 'border-emerald-200/70 bg-emerald-50/40' : 'border-amber-300/70 bg-amber-50/60'}`}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tone === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-700 ${tone === 'ok' ? 'text-emerald-800' : 'text-amber-900'}`}>
            {r.enough ? 'Teachers are enough for this cycle' : `Need ${plural(r.moreTeachersNeeded, 'more teacher')}`}
          </p>
          <p className="text-[11.5px] text-slate-600 mt-0.5 truncate">{r.teachers} teachers · at least {r.teachersNeeded} needed · {r.assignedPeriods} of {r.totalDemandPeriods} periods assigned</p>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4 space-y-4 border-t border-slate-900/[0.06] pt-3.5">
            <p className="text-[12px] text-slate-600">{r.message}</p>

            {/* the figures */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {stat('Weekly demand', `${r.totalDemandPeriods}`, 'periods, all sections')}
              {stat('Teacher capacity', `${capacity}`, `${r.teachers} teachers × ${cap} periods`)}
              {stat('Minimum teachers', `${r.teachersNeeded}`, `${r.totalDemandPeriods} ÷ ${cap}, rounded up`)}
              {stat(spare >= 0 ? 'Spare capacity' : 'Short by', `${Math.abs(spare)}`, spare >= 0 ? `${r.teachers - r.teachersNeeded} spare teacher${r.teachers - r.teachersNeeded === 1 ? '' : 's'} · ${Math.round((100 * r.totalDemandPeriods) / Math.max(1, capacity))}% used` : `${r.moreTeachersNeeded} more teacher${r.moreTeachersNeeded === 1 ? '' : 's'} at ${cap}`)}
            </div>
            <div>
              <div className="relative h-2 rounded-full bg-[color:var(--ink-800)]/8 overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--ink-800)]/20" style={{ width: `${(100 * capacity) / scale}%` }} title="Total teacher capacity" />
                <div className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--c-500)]/75" style={{ width: `${(100 * r.assignedPeriods) / scale}%` }} title="Periods already assigned" />
                {r.totalDemandPeriods > capacity && <div className="absolute inset-y-0 right-0 rounded-full bg-amber-400/80" style={{ width: `${(100 * (r.totalDemandPeriods - capacity)) / scale}%` }} title="Demand beyond capacity" />}
              </div>
              <div className="flex justify-between text-[10.5px] text-slate-500 mt-1">
                <span>{r.assignedPeriods} assigned</span>
                <span>{r.openPeriods} still open · capacity {capacity}</span>
              </div>
            </div>

            {/* semester by semester */}
            <section>
              <h4 className="text-[12px] font-700 text-slate-800 mb-1.5">Semester by semester</h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-[12px] min-w-[520px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-500 bg-slate-50">
                      <th className="font-600 px-3 py-2">Semester</th>
                      <th className="font-600 px-2 py-2 text-right">Sections</th>
                      <th className="font-600 px-2 py-2 text-right">Weekly periods</th>
                      <th className="font-600 px-2 py-2 text-right" title={`Periods ÷ ${cap}, rounded up`}>Min. teachers</th>
                      <th className="font-600 px-2 py-2 text-right">Assigned</th>
                      <th className="font-600 px-2 py-2 text-right">Open</th>
                      <th className="font-600 px-3 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {r.bySemester.map(s => (
                      <tr key={s.semester}>
                        <td className="px-3 py-2 font-600 text-slate-800">Sem {s.semester} <span className="font-500 text-slate-400">{YEAR[s.semester]}</span></td>
                        <td className="px-2 py-2 text-right text-slate-700">{s.sections}</td>
                        <td className="px-2 py-2 text-right text-slate-700">{s.demandPeriods}</td>
                        <td className="px-2 py-2 text-right text-slate-700">{Math.ceil(s.demandPeriods / cap)}</td>
                        <td className="px-2 py-2 text-right text-slate-700">{s.assignedPeriods}</td>
                        <td className="px-2 py-2 text-right text-slate-700">{s.openPeriods}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-700 ${s.openPeriods === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{s.openPeriods === 0 ? 'Staffed' : `${s.openPeriods} open`}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-700 text-slate-800 tabular-nums">
                      <td className="px-3 py-2">All semesters</td>
                      <td className="px-2 py-2 text-right">{r.bySemester.reduce((n, s) => n + s.sections, 0)}</td>
                      <td className="px-2 py-2 text-right">{r.totalDemandPeriods}</td>
                      <td className="px-2 py-2 text-right">{r.teachersNeeded}</td>
                      <td className="px-2 py-2 text-right">{r.assignedPeriods}</td>
                      <td className="px-2 py-2 text-right">{r.openPeriods}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[10.5px] text-slate-500 mt-1.5">A teacher can teach in more than one semester, so the minimum for all semesters together ({r.teachersNeeded}) is smaller than the semester minimums added up.</p>
            </section>

            {/* who has room */}
            <section>
              <h4 className="text-[12px] font-700 text-slate-800 mb-1.5">Who can take more</h4>
              {!teachers ? <p className="text-[11.5px] text-slate-500">Loading each teacher's load…</p> : live.length === 0 ? <p className="text-[11.5px] text-slate-500">No teacher information yet.</p> : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {stat('Have free time', `${free.length}`, `${freePeriods} periods in all`)}
                    {stat('No classes yet', `${idle.length}`, idle.length ? 'can take sections first' : 'everyone has a load')}
                    {stat('Average load', `${avgLoad}`, `of ${cap} periods a week`)}
                    {stat('At or above limit', `${full.length + over.length}`, over.length ? `${over.length} above the limit` : 'none above')}
                  </div>
                  {free.length > 0 && (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                      {free.slice(0, 6).map(t => (
                        <div key={t.facultyId} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
                          <span className="min-w-0 flex-1 truncate font-600 text-slate-800">{t.name}</span>
                          <span className="hidden sm:block w-28 h-1.5 rounded-full bg-[color:var(--ink-800)]/8 overflow-hidden"><span className="block h-full rounded-full bg-[color:var(--c-500)]/75" style={{ width: `${Math.min(100, (100 * t.load) / t.max)}%` }} /></span>
                          <span className="w-24 text-right tabular-nums text-slate-600">{t.load}/{t.max} <span className="text-emerald-700 font-600">· {t.remaining} free</span></span>
                        </div>
                      ))}
                      {free.length > 6 && <p className="px-3 py-1.5 text-[10.5px] text-slate-500">and {free.length - 6} more with free time. Full list: Reports → Teacher workload.</p>}
                    </div>
                  )}
                  {typical > 0 && <p className="text-[10.5px] text-slate-500 mt-1.5">Free time is enough for about {absorb} more section{absorb === 1 ? '' : 's'} (a section is about {typical} periods a week).</p>}
                </>
              )}
            </section>

            {/* subjects that still need teachers */}
            <section>
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className="text-[12px] font-700 text-slate-800">{attention.length > 0 ? `Subjects without a teacher · ${attention.length}` : 'Subjects'}</h4>
                <button onClick={() => setAllSubjects(a => !a)} className="ml-auto text-[11px] font-700 text-[color:var(--c-700)] hover:underline">{allSubjects ? 'Show only open ones' : `All ${r.subjects.length} subjects`}</button>
              </div>
              {(() => {
                const list = allSubjects ? r.subjects : attention
                if (list.length === 0) return <p className="text-[11.5px] text-emerald-800">Every subject has a teacher for each of its sections.</p>
                return (
                  <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {list.map(s => (
                      <div key={s.subjectId} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-[11px] font-700 text-[color:var(--c-700)] mr-1.5">{s.code}</span><span className="text-slate-800">{s.name}</span>
                          <span className="block text-[10.5px] text-slate-500">Sem {s.semester} · {plural(s.sections, 'section')} × {s.periodsPerSection} periods</span>
                        </span>
                        <span className="text-right text-[11px] text-slate-600 shrink-0">
                          <span className="block">Teachers: {s.chosen} chosen of {s.teachersWanted} wanted</span>
                          <span className={`block font-700 ${s.openSections > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>{s.openSections > 0 ? `${plural(s.openSections, 'section')} open` : 'All staffed'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              <p className="text-[10.5px] text-slate-500 mt-1.5">Minimum per subject: one teacher for every {r.avgSectionsPerTeacher} sections, so {calc.slotsWanted} teacher places in all, {calc.slotsChosen} filled by teachers' choices.</p>
            </section>

            {tips.length > 0 && (
              <section>
                <h4 className="text-[12px] font-700 text-slate-800 mb-1.5">What to do</h4>
                <ul className="space-y-1 text-[12px] text-slate-700 list-disc pl-4">
                  {tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </section>
            )}

            <p className="text-[10.5px] text-slate-400">A teacher carries at most {cap} periods a week and each subject accepts about one teacher per {r.avgSectionsPerTeacher} sections. Both can be changed in Settings → Policy &amp; cycle.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
