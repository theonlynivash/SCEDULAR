import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type AssignBoard } from '../api'

type Pref = {
  id: number; facultyId: string; facultyName: string; allocationExperience: number | null
  subjectId: string; subjectCode: string; subjectName: string; academicYear: string; preferenceRank: number
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'
}
type View = 'subject' | 'teacher'
type Show = 'all' | 'pending' | 'approved'

const tl = (t: number, l: number) => (l > 0 ? `${t}T + ${l}L` : `${t}T`)

function StatusChip({ status }: { status: Pref['status'] }) {
  const approved = status === 'APPROVED'
  return (
    <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full border whitespace-nowrap ${approved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
      {approved ? 'Approved' : 'Not approved yet'}
    </span>
  )
}

/**
 * Teachers' subject choices, grouped for the HOD. Everything is the HOD's call:
 * Approve it, Change it to another subject, or Remove it. Nothing is sent back to the teacher.
 */
export default function HodPreferencesTab({ semester, board, say, onChanged }: {
  semester: string
  board: AssignBoard | null
  say: (ok: boolean, text: string) => void
  onChanged: () => void
}) {
  const [prefs, setPrefs] = useState<Pref[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<View>('subject')
  const [show, setShow] = useState<Show>('all')
  const [query, setQuery] = useState('')
  const [changing, setChanging] = useState<{ id: number; subjectId: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.facultyAllocation.getHodPreferences(semester)
      setPrefs((r.preferences as Pref[]).filter(p => p.status !== 'DRAFT'))
    } catch (e: any) { say(false, e?.message || 'Could not load preferences.') }
    finally { setLoading(false) }
  }, [semester, say])
  useEffect(() => { load() }, [load])

  const teaching = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of board?.subjects ?? []) for (const t of s.teachers) m.set(`${t.facultyId}:${s.subjectId}`, t.sectionIds.length)
    return m
  }, [board])
  const subjectInfo = useMemo(() => new Map((board?.subjects ?? []).map(s => [s.subjectId, s])), [board])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return prefs.filter(p => {
      if (show === 'pending' && p.status === 'APPROVED') return false
      if (show === 'approved' && p.status !== 'APPROVED') return false
      return !q || p.facultyName.toLowerCase().includes(q) || p.subjectName.toLowerCase().includes(q) || p.subjectCode.toLowerCase().includes(q)
    })
  }, [prefs, show, query])

  const pendingCount = prefs.filter(p => p.status !== 'APPROVED').length

  async function run(fn: () => Promise<unknown>, okText?: string) {
    setBusy(true)
    try { await fn(); if (okText) say(true, okText); await load(); onChanged() }
    catch (e: any) { say(false, e?.message || 'Action failed.') }
    finally { setBusy(false) }
  }
  const approve = (p: Pref) => run(() => api.facultyAllocation.reviewPreference(p.id, 'APPROVED'))
  const remove = (p: Pref) => {
    const n = teaching.get(`${p.facultyId}:${p.subjectId}`) ?? 0
    const extra = n > 0 ? `\n\n${p.facultyName} still teaches ${n} section(s) of it; those stay until you unassign them in the Assign tab.` : ''
    if (window.confirm(`Remove ${p.subjectCode} from ${p.facultyName}'s choices?${extra}`)) run(() => api.facultyAllocation.deletePreference(p.id), 'Removed.')
  }
  const applyChange = () => {
    if (!changing) return
    const c = changing
    setChanging(null)
    run(() => api.facultyAllocation.changePreferenceSubject(c.id, c.subjectId), 'Subject changed.')
  }
  const approveAll = () => {
    const pending = prefs.filter(p => p.status !== 'APPROVED')
    if (pending.length && window.confirm(`Approve ${pending.length} choice(s) that are not approved yet?`)) {
      run(async () => { for (const p of pending) await api.facultyAllocation.reviewPreference(p.id, 'APPROVED') }, `Approved ${pending.length}.`)
    }
  }

  const renderRow = (p: Pref, showSubject: boolean) => {
    const n = teaching.get(`${p.facultyId}:${p.subjectId}`) ?? 0
    const isChanging = changing?.id === p.id
    return (
      <div key={p.id} className="px-4 py-2 flex items-center gap-3 text-xs hover:bg-slate-50/60">
        <div className="min-w-0 flex-1">
          {showSubject ? (
            <p className="font-600 text-slate-800 truncate"><span className="font-mono text-[10px] text-[color:var(--c-600)] mr-1.5">{p.subjectCode}</span>{p.subjectName}</p>
          ) : (
            <p className="font-600 text-slate-800 truncate">{p.facultyName} <span className="font-mono text-[10px] text-slate-400">{p.facultyId}</span></p>
          )}
          <p className="text-[10px] text-slate-400">
            {showSubject ? `choice #${p.preferenceRank}` : `choice #${p.preferenceRank}`}
            {p.allocationExperience != null && !showSubject ? ` · ${p.allocationExperience} yrs` : ''}
            {n > 0 && <span className="text-emerald-700 font-600"> · teaching {n} section{n === 1 ? '' : 's'}</span>}
          </p>
        </div>
        {isChanging ? (
          <div className="flex items-center gap-1.5">
            <select value={changing!.subjectId} onChange={e => setChanging({ id: p.id, subjectId: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1 max-w-[230px]">
              {(board?.subjects ?? []).map(s => <option key={s.subjectId} value={s.subjectId}>{s.code} · {s.name}</option>)}
            </select>
            <button disabled={busy || changing!.subjectId === p.subjectId} onClick={applyChange} className="px-2.5 py-1 rounded-md bg-[color:var(--c-600)] text-white font-700 disabled:opacity-40">Save</button>
            <button onClick={() => setChanging(null)} className="text-slate-500 hover:underline">Cancel</button>
          </div>
        ) : (
          <>
            <StatusChip status={p.status} />
            <div className="flex gap-1">
              {p.status !== 'APPROVED' && <button disabled={busy} onClick={() => approve(p)} className="px-2 py-1 rounded-md bg-emerald-600 text-white font-700 hover:bg-emerald-700 disabled:opacity-40">Approve</button>}
              <button disabled={busy} onClick={() => setChanging({ id: p.id, subjectId: p.subjectId })} className="px-2 py-1 rounded-md border border-slate-200 text-slate-700 font-600 hover:bg-slate-100 disabled:opacity-40">Change</button>
              <button disabled={busy} onClick={() => remove(p)} className="px-2 py-1 rounded-md border border-rose-200 text-rose-700 font-600 hover:bg-rose-50 disabled:opacity-40">Remove</button>
            </div>
          </>
        )}
      </div>
    )
  }

  // grouping
  const byYear = useMemo(() => {
    const years = new Map<string, Map<string, Pref[]>>()
    for (const p of visible) {
      const y = years.get(p.academicYear) ?? new Map<string, Pref[]>()
      y.set(p.subjectId, [...(y.get(p.subjectId) ?? []), p])
      years.set(p.academicYear, y)
    }
    return [...years.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [visible])
  const byTeacher = useMemo(() => {
    const m = new Map<string, Pref[]>()
    for (const p of visible) m.set(p.facultyId, [...(m.get(p.facultyId) ?? []), p])
    return [...m.values()].map(l => l.sort((a, b) => a.preferenceRank - b.preferenceRank)).sort((a, b) => a[0].facultyName.localeCompare(b[0].facultyName))
  }, [visible])

  const seg = (on: boolean) => `px-3 py-1.5 text-xs font-700 ${on ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex border border-slate-200 rounded-lg overflow-hidden">
          <button className={seg(view === 'subject')} onClick={() => setView('subject')}>By subject</button>
          <button className={seg(view === 'teacher')} onClick={() => setView('teacher')}>By teacher</button>
        </div>
        <div className="flex border border-slate-200 rounded-lg overflow-hidden">
          <button className={seg(show === 'all')} onClick={() => setShow('all')}>All {prefs.length}</button>
          <button className={seg(show === 'pending')} onClick={() => setShow('pending')}>Not approved {pendingCount}</button>
          <button className={seg(show === 'approved')} onClick={() => setShow('approved')}>Approved {prefs.length - pendingCount}</button>
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search teacher or subject…" className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:border-[color:var(--c-600)]" />
        {pendingCount > 0 && <button disabled={busy} onClick={approveAll} className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-700 disabled:opacity-40">Approve remaining ({pendingCount})</button>}
      </div>

      {loading && prefs.length === 0 && <p className="text-sm text-slate-500 text-center py-10">Loading…</p>}
      {!loading && visible.length === 0 && <p className="text-sm text-slate-500 text-center py-10">No choices to show for Semester {semester}.</p>}

      {view === 'subject' && byYear.map(([year, subs]) => (
        <section key={year} className="space-y-2">
          <h2 className="text-[11px] font-800 uppercase tracking-wider text-slate-500 px-1">{year} · {[...subs.values()].reduce((n, l) => n + l.length, 0)} choices</h2>
          {[...subs.entries()].sort(([, a], [, b]) => a[0].subjectCode.localeCompare(b[0].subjectCode)).map(([sid, list]) => {
            const info = subjectInfo.get(sid)
            return (
              <div key={sid} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-[color:var(--c-600)] font-700">{list[0].subjectCode}</span>
                  <span className="text-sm font-600 text-slate-800">{list[0].subjectName}</span>
                  <span className="ml-auto flex gap-1.5 text-[10px] font-600 text-slate-600">
                    {info && <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200">{tl(info.perSection.theory, info.perSection.lab)} / section</span>}
                    <span title="Teachers who chose it / teachers this subject needs (about one per few sections)" className={`px-2 py-0.5 rounded-full border ${info?.teachersWanted && list.length > info.teachersWanted ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200'}`}>{list.length}{info?.teachersWanted ? ` of ${info.teachersWanted}` : ''} teacher{(info?.teachersWanted ?? list.length) === 1 ? '' : 's'}</span>
                    {info && <span className={`px-2 py-0.5 rounded-full border ${info.assignedCount === info.sectionCount ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>{info.assignedCount}/{info.sectionCount} sections staffed</span>}
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {list.sort((a, b) => a.facultyName.localeCompare(b.facultyName)).map(p => renderRow(p, false))}
                </div>
              </div>
            )
          })}
        </section>
      ))}

      {view === 'teacher' && (
        <div className="grid gap-2 md:grid-cols-2 items-start">
          {byTeacher.map(list => (
            <div key={list[0].facultyId} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <span className="text-sm font-600 text-slate-800">{list[0].facultyName}</span>
                <span className="font-mono text-[10px] text-slate-400">{list[0].facultyId}</span>
                <span className="ml-auto text-[10px] text-slate-500">{list[0].allocationExperience != null ? `${list[0].allocationExperience} yrs` : 'experience not set'}</span>
              </div>
              <div className="divide-y divide-slate-50">{list.map(p => renderRow(p, true))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
