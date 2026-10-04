import { useEffect, useMemo, useState } from 'react'
import { Search, Check } from 'lucide-react'
import { api, type AssignBoard, type AssignBoardSubject, type BoardTeacher } from '../api'
import TeacherPicker from './TeacherPicker'

type Filter = 'open' | 'all' | 'done'
const tl = (t: number, l: number) => (l > 0 ? `${t}T + ${l}L` : `${t}T`)
const letter = (id: string) => id.replace(/^Y\d(S\d)?-/, '')
/** "Dr.R.JEGAN" -> "Jegan": the longest word of the name, title-cased. */
const surname = (name: string) => {
  const w = name.replace(/^(Dr|Mr|Mrs|Ms)\.?\s*/i, '').split(/[ .]+/).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? name
  const t = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  return t.length > 9 ? t.slice(0, 8) + '…' : t
}

/** Circular percentage, like a battery indicator: filled arc = share of sections that have a teacher. */
function Ring({ pct, size = 44, title }: { pct: number; size?: number; title?: string }) {
  const stroke = 3.5, r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <span className="relative flex-shrink-0" style={{ width: size, height: size }} title={title}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(14,37,79,0.10)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 100 ? '#2f6fc4' : pct > 0 ? '#f3c326' : 'transparent'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[9px] font-600 text-slate-700 tracking-tight">{pct}%</span>
    </span>
  )
}

/**
 * Side by side: subjects (with what is still missing) on the left; on the right the selected subject's
 * requirement, which sections are covered, and the candidate teachers to fill the gap.
 */
export default function HodAssignWorkspace({ board, semester, onChanged, say }: {
  board: AssignBoard
  semester: string
  onChanged: () => void
  say: (ok: boolean, text: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return board.subjects.filter(s => {
      const done = s.assignedCount >= s.sectionCount
      if (filter === 'open' && done) return false
      if (filter === 'done' && !done) return false
      return !t || s.code.toLowerCase().includes(t) || s.name.toLowerCase().includes(t)
    })
  }, [board, filter, q])

  const nOpen = board.subjects.filter(s => s.assignedCount < s.sectionCount).length

  // keep a valid selection: stay on the chosen subject, else the first open one, else the first
  useEffect(() => {
    if (board.subjects.some(s => s.subjectId === selected)) return
    setSelected((board.subjects.find(s => s.assignedCount < s.sectionCount) ?? board.subjects[0])?.subjectId ?? '')
  }, [board, selected])
  useEffect(() => { setCounts({}) }, [selected, semester])
  useEffect(() => { setFilter(board.subjects.some(s => s.assignedCount < s.sectionCount) ? 'open' : 'all') }, [semester]) // eslint-disable-line react-hooks/exhaustive-deps

  const sub = board.subjects.find(s => s.subjectId === selected)

  return (
    <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'minmax(250px, 300px) minmax(0, 1fr)' }}>
      {/* LEFT: subjects */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-0">
        <div className="p-2.5 border-b border-slate-100 space-y-2">
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find subject…" className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-[#0F4C81]" /></div>
          <div className="flex border border-slate-200 rounded-md overflow-hidden text-[11px] font-700">
            {([['open', `Open ${nOpen}`], ['all', `All ${board.subjects.length}`], ['done', `Done ${board.subjects.length - nOpen}`]] as [Filter, string][]).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1.5 ${filter === f ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="max-h-[calc(100vh-290px)] overflow-y-auto divide-y divide-slate-50">
          {list.length === 0 && <p className="text-xs text-slate-400 text-center py-8">{filter === 'open' ? 'Everything is staffed 🎉' : 'Nothing here.'}</p>}
          {list.map(s => {
            const on = s.subjectId === selected
            const pct = Math.round((100 * s.assignedCount) / Math.max(1, s.sectionCount))
            return (
              <button key={s.subjectId} onClick={() => setSelected(s.subjectId)} className={`w-full text-left px-3 py-2 flex items-center gap-3 border-l-[3px] transition ${on ? 'bg-blue-50/70 border-[#0F4C81]' : 'border-transparent hover:bg-slate-50'}`}>
                <Ring pct={pct} title={`${s.assignedCount} of ${s.sectionCount} sections have a teacher`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-mono text-[10px] text-[#0F4C81] font-700">{s.code}</span><span className="text-[10px] text-slate-400">{tl(s.perSection.theory, s.perSection.lab)}</span></div>
                  <p className="text-xs font-600 text-slate-800 truncate leading-snug">{s.name}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT: workspace */}
      {sub ? <Detail key={sub.subjectId} sub={sub} board={board} semester={semester} counts={counts} setCounts={setCounts} busy={busy} setBusy={setBusy} onChanged={onChanged} say={say} /> : <p className="text-sm text-slate-500 text-center py-16">Select a subject.</p>}
    </div>
  )
}

function Detail({ sub, board, semester, counts, setCounts, busy, setBusy, onChanged, say }: {
  sub: AssignBoardSubject; board: AssignBoard; semester: string
  counts: Record<string, number>; setCounts: (c: Record<string, number>) => void
  showOthers?: boolean; setShowOthers?: (b: boolean) => void
  busy: boolean; setBusy: (b: boolean) => void
  onChanged: () => void; say: (ok: boolean, text: string) => void
}) {
  const [changing, setChanging] = useState<string | null>(null)   // teacher whose sections are being moved
  const remaining = sub.sectionCount - sub.assignedCount
  const per = sub.perSection.theory + sub.perSection.lab
  const nFor = (id: string) => Math.max(1, Math.min(remaining, counts[id] ?? 1))

  async function assign(facultyId: string, name: string, override = false): Promise<void> {
    const n = nFor(facultyId)
    setBusy(true)
    try {
      const r = await api.facultyAllocation.assignSections({ semester, subjectId: sub.subjectId, facultyId, sectionCount: n, override })
      say(true, `${name} · ${n} section${n === 1 ? '' : 's'} of ${sub.code} (+${r.addedPeriods} periods). Load ${r.facultyLoad}/${r.facultyMax}.`)
      onChanged()
    } catch (e: any) {
      if (e?.code === 'FACULTY_CAPACITY_EXCEEDED' && window.confirm(`${e.message}\n\nAssign anyway?`)) { setBusy(false); return assign(facultyId, name, true) }
      say(false, e?.message || 'Could not assign.')
    } finally { setBusy(false) }
  }
  async function remove(facultyId: string) {
    setBusy(true)
    try { await api.facultyAllocation.unassignSections({ subjectId: sub.subjectId, facultyId }); onChanged() }
    catch (e: any) { say(false, e?.message || 'Could not remove.') }
    finally { setBusy(false) }
  }
  async function move(fromId: string, toId: string, toName: string, override = false): Promise<void> {
    setBusy(true)
    try {
      const r = await api.facultyAllocation.reassign({ subjectId: sub.subjectId, fromFacultyId: fromId, toFacultyId: toId, override })
      say(true, `Moved ${sub.code} to ${toName} (+${r.movedPeriods} periods, load ${r.newLoad}/${r.max}).`)
      setChanging(null); onChanged()
    } catch (e: any) {
      if (e?.code === 'FACULTY_CAPACITY_EXCEEDED' && window.confirm(`${e.message}\n\nMove anyway?`)) { setBusy(false); return move(fromId, toId, toName, true) }
      say(false, e?.message || 'Could not change the teacher.')
    } finally { setBusy(false) }
  }

  // stepper + Assign for the "fill the remaining sections" list
  const assignControl = (t: BoardTeacher) => {
    const n = nFor(t.facultyId), after = t.load + n * per
    return (
      <>
        <span className={`text-[10.5px] w-24 text-right ${after > t.max ? 'text-amber-700 font-700' : 'text-slate-500'}`}>{t.load} → <b>{after}</b>/{t.max}</span>
        <div className="flex items-center border border-slate-200 rounded-md overflow-hidden text-xs">
          <button disabled={remaining < 1} onClick={() => setCounts({ ...counts, [t.facultyId]: Math.max(1, n - 1) })} className="px-2 py-1 hover:bg-slate-50">−</button>
          <span className="w-12 text-center font-700">{n} sec</span>
          <button disabled={remaining < 1} onClick={() => setCounts({ ...counts, [t.facultyId]: Math.min(remaining, n + 1) })} className="px-2 py-1 hover:bg-slate-50">+</button>
        </div>
        <button disabled={busy || remaining < 1} onClick={() => assign(t.facultyId, t.name)} className="px-3 py-1.5 rounded-md bg-[#0F4C81] text-white text-xs font-700 hover:bg-[#0a3860] disabled:opacity-40">Assign</button>
      </>
    )
  }

  return (
    <div className="space-y-3 min-w-0">
      {/* requirement */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-[#0F4C81] font-700">{sub.code} · {sub.year}</p>
            <h2 className="font-display font-800 text-base text-slate-900 leading-snug">{sub.name}</h2>
          </div>
          <div className="ml-auto flex gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-center"><p className="text-[9px] uppercase tracking-wider text-slate-400 font-700">Template</p><p className="text-sm font-800 text-slate-800">{tl(sub.perSection.theory, sub.perSection.lab)}</p><p className="text-[9px] text-slate-400">per section</p></div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-center"><p className="text-[9px] uppercase tracking-wider text-slate-400 font-700">Need</p><p className="text-sm font-800 text-slate-800">{sub.sectionCount} sections</p><p className="text-[9px] text-slate-400">{sub.sectionCount * per} periods / wk{sub.teachersWanted ? ` · ${sub.teachersWanted} teachers` : ''}</p></div>
            <div className={`px-3 py-1.5 rounded-lg border text-center ${remaining === 0 ? 'bg-[#2f6fc4]/6 border-[#2f6fc4]/15' : 'bg-amber-50 border-amber-200'}`}><p className="text-[9px] uppercase tracking-wider text-slate-500 font-700">Still open</p><p className="text-sm font-800 text-slate-800">{remaining} section{remaining === 1 ? '' : 's'}</p><p className="text-[9px] text-slate-400">{remaining * per} periods</p></div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sub.sections.map(sec => (
            <span key={sec.sectionId} title={sec.facultyName ? `${sec.sectionName} · ${sec.facultyName}` : `${sec.sectionName} · no teacher`}
              className={`px-2 py-1 rounded-md text-[11px] font-700 border ${sec.complete ? 'bg-[#2f6fc4]/8 border-[#2f6fc4]/20 text-[#16367a]' : 'bg-white/60 border-dashed border-amber-400 text-amber-700'}`}>
              {letter(sec.sectionId)}{sec.facultyName && <span className="ml-1.5 font-500 text-slate-500">· {surname(sec.facultyName)}</span>}
            </span>
          ))}
        </div>
      </div>

      {/* assigned */}
      {sub.teachers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2 text-[10px] font-800 uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">Teaching it · {sub.teachers.length}</p>
          <div className="divide-y divide-slate-50">
            {sub.teachers.map(t => (
              <div key={t.facultyId}>
                <div className="px-4 py-2 flex items-center gap-3 text-xs">
                  <span className="font-600 text-slate-800 w-48 truncate">{t.facultyName}</span>
                  <span className="text-slate-500">{t.sectionIds.length} × ({tl(sub.perSection.theory, sub.perSection.lab)}) = <b className="text-slate-700">{tl(t.theory, t.lab)}</b></span>
                  <span className="text-slate-400">sections {t.sectionIds.map(letter).join(', ')}</span>
                  <span className="ml-auto flex items-center gap-3">
                    <button disabled={busy} onClick={() => setChanging(changing === t.facultyId ? null : t.facultyId)} className="text-[#16367a] font-600 hover:underline disabled:opacity-40">{changing === t.facultyId ? 'Cancel' : 'Change teacher'}</button>
                    <button disabled={busy} onClick={() => remove(t.facultyId)} className="text-rose-600 font-600 hover:underline disabled:opacity-40">Remove</button>
                  </span>
                </div>
                {changing === t.facultyId && (
                  <div className="px-4 pb-3 bg-blue-50/30">
                    <p className="text-[11px] text-slate-500 py-2">Move {t.facultyName}'s {t.sectionIds.length} section{t.sectionIds.length === 1 ? '' : 's'} of {sub.code} ({t.theory + t.lab} periods) to:</p>
                    <TeacherPicker teachers={board.teachers} subjectId={sub.subjectId} semester={semester} exclude={new Set([t.facultyId])} maxHeight={300}
                      action={c => (
                        <>
                          <span className={`text-[10.5px] w-24 text-right ${c.load + t.theory + t.lab > c.max ? 'text-amber-700 font-700' : 'text-slate-500'}`}>{c.load} → <b>{c.load + t.theory + t.lab}</b>/{c.max}</span>
                          <button disabled={busy} onClick={() => move(t.facultyId, c.facultyId, c.name)} className="px-3 py-1.5 rounded-md bg-[#0F4C81] text-white text-xs font-700 hover:bg-[#0a3860] disabled:opacity-40">Move here</button>
                        </>
                      )} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* candidates */}
      {remaining > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-800 uppercase tracking-wider text-slate-400 px-1">Fill the remaining {remaining} section{remaining === 1 ? '' : 's'}{sub.interested.length === 0 ? ' · nobody chose this subject, pick any teacher' : ''}</p>
          <TeacherPicker teachers={board.teachers} subjectId={sub.subjectId} semester={semester} action={assignControl} />
        </div>
      ) : (
        <p className="text-xs font-600 text-[#16367a] bg-[#2f6fc4]/6 border border-[#2f6fc4]/15 rounded-xl px-4 py-3">✓ Every section has a teacher.</p>
      )}
    </div>
  )
}
