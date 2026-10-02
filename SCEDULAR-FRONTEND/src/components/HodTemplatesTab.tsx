import { useMemo, useState } from 'react'
import { api, type AssignBoard, type AutoAssignResult } from '../api'

const tl = (t: number, l: number) => (l > 0 ? `${t}T + ${l}L` : `${t}T`)

/**
 * Templates: every subject has one template, derived from its printed timetable — "per section: nT + nL".
 * Giving a teacher n sections is n x that template, theory and lab together. Apply it by hand in the Assign tab,
 * or let Auto-fill apply it to every open subject from the teachers' preferences.
 */
export default function HodTemplatesTab({ semester, board, say, onChanged }: {
  semester: string
  board: AssignBoard | null
  say: (ok: boolean, text: string) => void
  onChanged: () => void
}) {
  const [preview, setPreview] = useState<AutoAssignResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [scope, setScope] = useState('')           // '' = every open subject
  const [counts, setCounts] = useState<Record<string, number>>({})

  const openSubjects = useMemo(() => (board?.subjects ?? []).filter(s => s.assignedCount < s.sectionCount), [board])
  const teachers = useMemo(() => {
    const by = new Map<string, { name: string; items: { code: string; name: string; n: number; t: number; l: number }[] }>()
    for (const s of board?.subjects ?? []) for (const t of s.teachers) {
      const e = by.get(t.facultyId) ?? { name: t.facultyName, items: [] }
      e.items.push({ code: s.code, name: s.name, n: t.sectionIds.length, t: s.perSection.theory, l: s.perSection.lab })
      by.set(t.facultyId, e)
    }
    return (board?.teachers ?? []).filter(t => by.has(t.facultyId)).map(t => ({ ...t, items: by.get(t.facultyId)!.items })).sort((a, b) => b.load / b.max - a.load / a.max)
  }, [board])

  async function run(dryRun: boolean) {
    setBusy(true)
    try {
      const r = await api.facultyAllocation.autoAssign({ semester, subjectId: scope || undefined, dryRun })
      if (dryRun) setPreview(r)
      else {
        setPreview(null)
        say(true, `Auto-fill assigned ${r.assignedSections} section${r.assignedSections === 1 ? '' : 's'}.${r.leftover.length ? ` ${r.leftover.length} subject(s) still need a teacher.` : ''}`)
        onChanged()
      }
    } catch (e: any) { say(false, e?.message || 'Auto-fill failed.') }
    finally { setBusy(false) }
  }

  if (!board) return <p className="text-sm text-slate-500 text-center py-10">Loading…</p>

  return (
    <div className="space-y-4">
      {/* Auto-fill */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 space-y-3">
        <div>
          <h2 className="font-display font-700 text-sm text-slate-800">Auto-fill from preferences</h2>
          <p className="text-[11px] text-slate-500">Applies the templates for you: open sections go to the teachers who chose the subject, lightest load first, never past a teacher's weekly limit. You see the plan before anything is saved.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={scope} onChange={e => { setScope(e.target.value); setPreview(null) }} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 min-w-[240px]">
            <option value="">All open subjects ({openSubjects.length})</option>
            {openSubjects.map(s => <option key={s.subjectId} value={s.subjectId}>{s.code} · {s.name}</option>)}
          </select>
          <button disabled={busy || openSubjects.length === 0} onClick={() => run(true)} className="px-4 py-1.5 border border-[#0F4C81] text-[#0F4C81] text-xs font-700 rounded-lg disabled:opacity-40">Preview plan</button>
          {preview && preview.plan.length > 0 && (
            <button disabled={busy} onClick={() => run(false)} className="px-4 py-1.5 bg-[#0F4C81] text-white text-xs font-700 rounded-lg disabled:opacity-40">Apply plan ({preview.assignedSections} sections)</button>
          )}
        </div>
        {openSubjects.length === 0 && <p className="text-xs text-emerald-700 font-600">✓ Every subject already has teachers.</p>}
        {preview && (
          <div className="space-y-1.5">
            {preview.plan.map((x, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <span className="font-mono text-[11px] text-[#0F4C81]">{x.code}</span>
                <span className="font-600 text-slate-800">{x.facultyName}</span>
                <span className="text-slate-500">{x.sectionIds.length} section{x.sectionIds.length === 1 ? '' : 's'} ({x.sectionIds.map(s => s.replace(/^Y\d-/, '')).join(', ')}) · +{x.periods} periods</span>
                <span className="ml-auto text-slate-500">load → <b>{x.loadAfter}</b>/{x.max}</span>
              </div>
            ))}
            {preview.leftover.map((x, i) => (
              <div key={i} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                ⚠ <b>{x.code}</b> {x.name}: {x.remaining} section{x.remaining === 1 ? '' : 's'} left — {x.reason}. Assign them by hand in the Assign tab.
              </div>
            ))}
            {preview.plan.length === 0 && preview.leftover.length === 0 && <p className="text-xs text-slate-500">Nothing to do.</p>}
          </div>
        )}
      </div>

      {/* Subject templates */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4">
        <h2 className="font-display font-700 text-sm text-slate-800 mb-0.5">Subject templates</h2>
        <p className="text-[11px] text-slate-500 mb-3">One template per subject. Pick a number of sections to see the workload a teacher would carry.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {board.subjects.map(s => {
            const n = counts[s.subjectId] ?? 1
            return (
              <div key={s.subjectId} className="border border-slate-100 rounded-lg px-3 py-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-600 text-slate-800 truncate"><span className="font-mono text-[10px] text-[#0F4C81] mr-1.5">{s.code}</span>{s.name}</p>
                  <p className="text-[11px] text-slate-500">per section <b>{tl(s.perSection.theory, s.perSection.lab)}</b> · {s.sectionCount} sections</p>
                </div>
                <div className="flex items-center border border-slate-200 rounded-md overflow-hidden text-xs">
                  <button onClick={() => setCounts({ ...counts, [s.subjectId]: Math.max(1, n - 1) })} className="px-2 py-1 hover:bg-slate-50">−</button>
                  <span className="px-2 font-700">{n}</span>
                  <button onClick={() => setCounts({ ...counts, [s.subjectId]: Math.min(s.sectionCount, n + 1) })} className="px-2 py-1 hover:bg-slate-50">+</button>
                </div>
                <span className="text-[11px] font-700 text-slate-700 w-24 text-right">{tl(n * s.perSection.theory, n * s.perSection.lab)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Workload per teacher */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4">
        <h2 className="font-display font-700 text-sm text-slate-800 mb-3">Teacher workload</h2>
        <div className="space-y-2">
          {teachers.map(t => {
            const pct = Math.min(100, Math.round((100 * t.load) / t.max))
            const over = t.load > t.max
            return (
              <div key={t.facultyId} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-600 text-slate-800 w-56 truncate">{t.name}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#2f6fc4]/60 to-[#16367a]/70" style={{ width: `${pct}%` }} /></div>
                  <span className={`w-16 text-right font-700 text-slate-600`}>{t.load}/{t.max}</span>
                </div>
                <p className="text-[10px] text-slate-400 ml-0.5 mt-0.5">{t.items.map(i => `${i.code}: ${i.n} × (${tl(i.t, i.l)})`).join('  ·  ')}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
