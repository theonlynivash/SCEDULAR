import { useMemo, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import type { BoardTeacher } from '../api'

/** One teacher as the HOD needs to see them when choosing: preferences if free, remaining workload and current subjects if assigned. */
export function TeacherInfo({ t, subjectId, semester, extra }: { t: BoardTeacher; subjectId?: string; semester: string; extra?: ReactNode }) {
  const choseThis = !!subjectId && t.prefs.some(p => p.subjectId === subjectId)
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-600 text-slate-800 truncate">
        {t.name}
        <span className="ml-1.5 text-[10px] font-500 text-slate-400">{t.experience != null ? `${t.experience} yrs` : 'experience not set'}</span>
        {choseThis && <span className="ml-1.5 text-[10px] font-700 text-emerald-700">· chose this subject</span>}
        {extra}
      </p>
      {t.free ? (
        <p className="text-[10.5px] text-slate-500 truncate">
          {t.prefs.length === 0
            ? 'Free · no preference submitted'
            : <>Free · prefers {t.prefs.map((p, i) => <span key={p.subjectId}>{i > 0 && ', '}<span className={p.semester === semester ? 'font-700 text-[color:var(--c-700)]' : ''}>{p.code}</span> <span className="text-slate-400">({p.semester})</span></span>)}</>}
        </p>
      ) : (
        <p className="text-[10.5px] text-slate-500 truncate" title={t.assigned.map(a => `${a.code} ${a.name} · Sem ${a.semester} · ${a.sections} section${a.sections === 1 ? '' : 's'} (${a.periods} periods)`).join('\n')}>
          <b className={t.remaining === 0 ? 'text-amber-700' : 'text-slate-700'}>{t.remaining} left</b> of {t.max} · {t.assigned.map((a, i) => <span key={a.subjectId}>{i > 0 && ', '}{a.code} ×{a.sections} <span className="text-slate-400">({a.semester})</span></span>)}
        </p>
      )}
    </div>
  )
}

/** Free teachers first, then assigned ones; inside each, those who chose this subject / semester come first. */
export function groupTeachers(teachers: BoardTeacher[], subjectId: string | undefined, semester: string, exclude: Set<string> = new Set(), query = '') {
  const q = query.trim().toLowerCase()
  const rank = (t: BoardTeacher) => (subjectId && t.prefs.some(p => p.subjectId === subjectId) ? 0 : t.prefs.some(p => p.semester === semester) ? 1 : 2)
  const list = teachers.filter(t => !exclude.has(t.facultyId) && (!q || t.name.toLowerCase().includes(q) || t.assigned.some(a => a.code.toLowerCase().includes(q)) || t.prefs.some(p => p.code.toLowerCase().includes(q))))
  return {
    free: list.filter(t => t.free).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)),
    assigned: list.filter(t => !t.free).sort((a, b) => rank(a) - rank(b) || b.remaining - a.remaining || a.name.localeCompare(b.name)),
  }
}

/**
 * Searchable list split in two: teachers who are still free (with what they asked for) and teachers who already carry
 * work (with how much room they have left and what they teach). `action` draws the per-teacher button(s).
 */
export default function TeacherPicker({ teachers, subjectId, semester, exclude, action, maxHeight = 360, empty = 'No teachers match.' }: {
  teachers: BoardTeacher[]; subjectId?: string; semester: string; exclude?: Set<string>
  action: (t: BoardTeacher) => ReactNode; maxHeight?: number; empty?: string
}) {
  const [q, setQ] = useState('')
  const [showAssigned, setShowAssigned] = useState(true)
  const g = useMemo(() => groupTeachers(teachers, subjectId, semester, exclude, q), [teachers, subjectId, semester, exclude, q])

  const Row = ({ t }: { t: BoardTeacher }) => (
    <div className="px-3 py-2 flex items-center gap-3 hover:bg-slate-50/70">
      <TeacherInfo t={t} subjectId={subjectId} semester={semester} />
      {action(t)}
    </div>
  )

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="p-2 border-b border-slate-100 relative">
        <Search className="w-3.5 h-3.5 absolute left-4 top-[18px] text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a teacher or subject code…" className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[color:var(--c-600)]" />
      </div>
      <div className="overflow-y-auto" style={{ maxHeight }}>
        <p className="px-3 py-1.5 text-[10px] font-800 uppercase tracking-wider text-emerald-700 bg-emerald-50/60 sticky top-0">Free teachers · {g.free.length} <span className="font-500 normal-case tracking-normal text-slate-400">(nothing assigned yet; their submitted preferences are shown)</span></p>
        <div className="divide-y divide-slate-50">{g.free.map(t => <Row key={t.facultyId} t={t} />)}</div>
        {g.free.length === 0 && <p className="px-3 py-3 text-[11px] text-slate-400">No free teachers.</p>}
        <button onClick={() => setShowAssigned(v => !v)} className="w-full text-left px-3 py-1.5 text-[10px] font-800 uppercase tracking-wider text-[color:var(--c-700)] bg-blue-50/60 sticky top-0 border-y border-blue-100/60">
          Assigned teachers · {g.assigned.length} <span className="font-500 normal-case tracking-normal text-slate-400">(remaining workload and current subjects) {showAssigned ? '▾' : '▸'}</span>
        </button>
        {showAssigned && <div className="divide-y divide-slate-50">{g.assigned.map(t => <Row key={t.facultyId} t={t} />)}</div>}
        {showAssigned && g.assigned.length === 0 && <p className="px-3 py-3 text-[11px] text-slate-400">{empty}</p>}
      </div>
    </div>
  )
}
