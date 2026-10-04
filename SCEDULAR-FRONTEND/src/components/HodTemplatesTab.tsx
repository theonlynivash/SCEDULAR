import { useMemo, useState } from 'react'
import { type AssignBoard } from '../api'
import AutoPlanner from './AutoPlanner'

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
  const [counts, setCounts] = useState<Record<string, number>>({})

  const teachers = useMemo(() => {
    const by = new Map<string, { name: string; items: { code: string; name: string; n: number; t: number; l: number }[] }>()
    for (const s of board?.subjects ?? []) for (const t of s.teachers) {
      const e = by.get(t.facultyId) ?? { name: t.facultyName, items: [] }
      e.items.push({ code: s.code, name: s.name, n: t.sectionIds.length, t: s.perSection.theory, l: s.perSection.lab })
      by.set(t.facultyId, e)
    }
    return (board?.teachers ?? []).filter(t => by.has(t.facultyId)).map(t => ({ ...t, items: by.get(t.facultyId)!.items })).sort((a, b) => b.load / b.max - a.load / a.max)
  }, [board])

  if (!board) return <p className="text-sm text-slate-500 text-center py-10">Loading…</p>

  return (
    <div className="space-y-4">
      <AutoPlanner semester={semester} board={board} say={say} onChanged={onChanged} />

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
                  <p className="text-xs font-600 text-slate-800 truncate"><span className="font-mono text-[10px] text-[#1f6a63] mr-1.5">{s.code}</span>{s.name}</p>
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
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#3a8a80]/60 to-[#1b5550]/70" style={{ width: `${pct}%` }} /></div>
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
