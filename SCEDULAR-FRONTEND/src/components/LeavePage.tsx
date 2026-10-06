import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarOff, Check, ChevronDown, FileText, Handshake, Send, UserCheck, X } from 'lucide-react'
import { api, type Faculty, type LeaveCandidate, type LeaveDetail, type LeaveListItem, type LeaveSlotView, type LeaveSummary, type LeaveStatus } from '../api'
import type { Page } from '../types'
import { Btn, PillTabs } from './ui'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const fmtLong = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
const range = (a: string, b: string) => (a === b ? fmtLong(a) : `${fmtLong(a)} → ${fmtLong(b)}`)
const periods = (s: { startPeriod: number; endPeriod: number }) => (s.startPeriod === s.endPeriod ? `P${s.startPeriod}` : `P${s.startPeriod}–${s.endPeriod}`)
const bare = (n: string) => n.replace(/^(mrs|mr|ms|dr|prof)\.?\s*/i, '').trim()
const byNumeric = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

const STATUS: Record<LeaveStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Waiting for HOD', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Not approved', cls: 'bg-rose-100 text-rose-800' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-200 text-slate-600' },
}
const Badge = ({ s }: { s: LeaveStatus }) => <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-700 ${STATUS[s].cls}`}>{STATUS[s].label}</span>

const card = 'glass-main rounded-2xl p-4'
const input = 'rounded-xl bg-white/70 ring-1 ring-slate-300 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--c-500)]'

/** classes of one day, grouped by section, so each section's classes sit together */
function groupBySection<T extends { date: string; sectionId: string }>(slots: T[]) {
  const days = [...new Set(slots.map(s => s.date))].sort()
  return days.map(date => {
    const rows = slots.filter(s => s.date === date)
    return { date, sections: [...new Set(rows.map(r => r.sectionId))].sort(byNumeric).map(sectionId => ({ sectionId, rows: rows.filter(r => r.sectionId === sectionId) })) }
  })
}

/* ───────────────────────── tag shown next to a free teacher ───────────────────────── */
function Tags({ c }: { c: LeaveCandidate }) {
  return (
    <span className="flex flex-wrap gap-1">
      {c.proposed && <span className="px-1.5 rounded bg-[color:var(--c-500)]/15 text-[color:var(--c-700)] text-[10px] font-700">named in letter</span>}
      {c.staffOfSection && <span className="px-1.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-700">teaches this section</span>}
      {!c.staffOfSection && c.sameSubject && <span className="px-1.5 rounded bg-sky-100 text-sky-800 text-[10px] font-700">teaches this subject</span>}
      {c.covered.byMe > 0 && <span className="px-1.5 rounded bg-amber-100 text-amber-800 text-[10px] font-700">you covered {c.covered.byMe} period{c.covered.byMe === 1 ? '' : 's'} for them</span>}
      {c.covered.forMe > 0 && <span className="px-1.5 rounded bg-slate-200 text-slate-700 text-[10px] font-700">covered {c.covered.forMe} for you</span>}
    </span>
  )
}

/* ───────────────────────── request form (teacher; the HOD can record one for a teacher) ───────────────────────── */
function RequestForm({ asHod, onSent }: { asHod: boolean; onSent: () => void }) {
  const [teachers, setTeachers] = useState<Faculty[]>([])
  const [who, setWho] = useState('')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [reason, setReason] = useState('')
  const [letter, setLetter] = useState('')
  const [edited, setEdited] = useState(false)
  const [slots, setSlots] = useState<LeaveSlotView[] | null>(null)
  const [ready, setReady] = useState(true)
  const [asked, setAsked] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => { if (asHod) api.faculty.list().then(f => setTeachers(f.filter(x => x.role !== 'HOD'))).catch(() => {}) }, [asHod])
  useEffect(() => { if (to < from) setTo(from) }, [from, to])
  // dates or reason changed: the old list of classes no longer applies
  useEffect(() => { setSlots(null); setAsked({}) }, [from, to, who])
  useEffect(() => {
    if (edited || !slots) return
    const t = setTimeout(() => api.leave.letter(from, to, reason, asHod ? who : undefined).then(r => setLetter(r.letter)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [reason, from, to, slots, edited, asHod, who])

  const show = async () => {
    setErr(''); setDone('')
    if (asHod && !who) { setErr('Choose the teacher first.'); return }
    setBusy(true)
    try {
      const r = await api.leave.preview(from, to, asHod ? who : undefined)
      if (r.overlapsLeaveId) { setErr('There is already a leave request for some of these dates. Open "My leaves" to see it.'); setSlots(null); return }
      setSlots(r.slots); setReady(r.timetableReady); setLetter(r.letter); setEdited(false)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const toggle = (key: string, id: string) => setAsked(a => { const cur = a[key] ?? []; return { ...a, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] } })
  const send = async () => {
    setErr('')
    if (reason.trim().length < 3) { setErr('Write a short reason for the leave.'); return }
    setBusy(true)
    try {
      const r = await api.leave.create({ fromDate: from, toDate: to, reason: reason.trim(), letter: edited ? letter : undefined, proposed: asked, facultyId: asHod ? who : undefined })
      setDone(`Letter sent to the HOD (${r.classes} class${r.classes === 1 ? '' : 'es'} listed). You will see the decision here and in your messages.`)
      setSlots(null); setReason(''); setAsked({}); setEdited(false); onSent()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const groups = useMemo(() => groupBySection(slots ?? []), [slots])

  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <h2 className="font-display font-700 text-[15px] text-[color:var(--c-600)] flex items-center gap-2"><FileText size={16} /> {asHod ? 'Record a leave for a teacher' : 'Send a leave letter'}</h2>
        <div className="flex flex-wrap gap-3 items-end">
          {asHod && (
            <label className="text-[11px] font-700 text-slate-500 uppercase tracking-wide">Teacher
              <select value={who} onChange={e => setWho(e.target.value)} className={`${input} block mt-1 min-w-[14rem]`}>
                <option value="">Choose…</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-[11px] font-700 text-slate-500 uppercase tracking-wide">From
            <input type="date" min={today()} value={from} onChange={e => setFrom(e.target.value)} className={`${input} block mt-1`} />
          </label>
          <label className="text-[11px] font-700 text-slate-500 uppercase tracking-wide">To
            <input type="date" min={from} value={to} onChange={e => setTo(e.target.value)} className={`${input} block mt-1`} />
          </label>
          <label className="text-[11px] font-700 text-slate-500 uppercase tracking-wide flex-1 min-w-[14rem]">Reason
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="e.g. a family function, medical check-up" className={`${input} block mt-1 w-full`} />
          </label>
          <Btn onClick={show} disabled={busy}>{slots ? 'Refresh classes' : 'Show my classes'}</Btn>
        </div>
        {err && <p className="text-[12.5px] font-600 text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-lg px-3 py-2">{err}</p>}
        {done && <p className="text-[12.5px] font-600 text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-lg px-3 py-2">✓ {done}</p>}
      </div>

      {slots && (
        <>
          <div className={card}>
            <h3 className="font-700 text-[13.5px] text-slate-800">Your classes on these dates</h3>
            <p className="text-[12px] text-slate-500 mt-0.5">Under each class are the teachers who are completely free in that exact period. If a colleague has agreed to take a class, tick their name: the HOD sees it and can assign them directly. The HOD makes the final assignment.</p>
            {!ready && <p className="mt-2 text-[12.5px] text-amber-800">The timetable has not been generated yet, so no classes are listed. You can still send the letter.</p>}
            {ready && slots.length === 0 && <p className="mt-2 text-[12.5px] text-slate-600">You have no classes on these dates (a holiday or a day without classes). You can still send the letter.</p>}
          </div>
          {groups.map(g => (
            <div key={g.date} className={`${card} space-y-3`}>
              <p className="font-display font-700 text-[14px] text-[color:var(--c-600)]">{fmt(g.date)}</p>
              {g.sections.map(sec => (
                <div key={sec.sectionId} className="rounded-xl bg-white/50 ring-1 ring-white/70 p-3">
                  <p className="text-[12px] font-800 tracking-wide text-slate-700 mb-2">SECTION {sec.sectionId}</p>
                  <div className="space-y-3">
                    {sec.rows.map(s => (
                      <div key={s.key}>
                        <p className="text-[13px] font-600 text-slate-800">{periods(s)} · {s.subjectName}{s.blockType === 'LAB' ? ' (lab)' : ''}</p>
                        {s.candidates.length === 0 ? <p className="text-[12px] text-rose-700 mt-1">Nobody is free in this period; the HOD will arrange it.</p> : (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {s.candidates.slice(0, 40).map(c => {
                              const on = (asked[s.key] ?? []).includes(c.facultyId)
                              return (
                                <button key={c.facultyId} onClick={() => toggle(s.key, c.facultyId)} title={`${c.name} · ${c.weeklyLoad} periods a week`}
                                  className={`flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-[12px] font-600 ring-1 transition ${on ? 'bg-[color:var(--c-600)] text-white ring-[color:var(--c-600)]' : 'bg-white/70 text-slate-700 ring-slate-300 hover:ring-[color:var(--c-500)]'}`}>
                                  {on ? <Check size={12} /> : <span className="w-3" />}{bare(c.name)}
                                  {!on && c.staffOfSection && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="teaches this section" />}
                                  {!on && c.covered.byMe > 0 && <Handshake size={12} className="text-amber-600" />}
                                </button>
                              )
                            })}
                            {s.candidates.length > 40 && <span className="text-[11px] text-slate-500 self-center">+{s.candidates.length - 40} more are free</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className={`${card} space-y-2`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-700 text-[13.5px] text-slate-800">The letter that goes to the HOD</h3>
              {edited && <button className="text-[12px] font-600 text-[color:var(--c-600)] hover:underline" onClick={() => { setEdited(false) }}>Reset to the standard letter</button>}
            </div>
            <textarea value={letter} onChange={e => { setLetter(e.target.value); setEdited(true) }} rows={11} maxLength={3000} className={`${input} w-full font-[inherit] leading-relaxed`} />
            <p className="text-[11.5px] text-slate-500">The HOD receives this letter by email and as a message, with your classes and the colleagues you named.</p>
            <div className="flex justify-end"><Btn onClick={send} disabled={busy}><Send size={14} /> Send to HOD</Btn></div>
          </div>
        </>
      )}
    </div>
  )
}

/* ───────────────────────── a teacher's own requests ───────────────────────── */
function MyLeaves({ reload, tick }: { reload: () => void; tick: number }) {
  const [rows, setRows] = useState<LeaveListItem[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [detail, setDetail] = useState<LeaveDetail | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => api.leave.list().then(setRows).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load, tick])
  useEffect(() => { setDetail(null); if (open != null) api.leave.get(open).then(setDetail).catch(e => setErr(e.message)) }, [open, tick])
  const cancel = async (id: number) => {
    if (!window.confirm('Cancel this leave? Anyone assigned to take your classes will be told.')) return
    try { await api.leave.cancel(id); setOpen(null); load(); reload() } catch (e) { setErr((e as Error).message) }
  }
  if (!rows) return <p className="text-slate-500 text-sm">{err || 'Loading…'}</p>
  if (rows.length === 0) return <div className={`${card} text-center text-[13px] text-slate-500`}>You have not sent any leave letters yet.</div>
  return (
    <div className="space-y-3">
      {err && <p className="text-[12.5px] text-rose-700">{err}</p>}
      {rows.map(l => (
        <div key={l.id} className={card}>
          <button className="w-full text-left flex items-center gap-3 flex-wrap" onClick={() => setOpen(open === l.id ? null : l.id)}>
            <div className="flex-1 min-w-0">
              <p className="font-700 text-[14px] text-slate-800">{range(l.fromDate, l.toDate)}</p>
              <p className="text-[12.5px] text-slate-500 truncate">{l.reason}</p>
            </div>
            <span className="text-[12px] text-slate-600">{l.coverage.total ? `${l.coverage.covered} of ${l.coverage.total} classes covered` : 'no classes'}</span>
            <Badge s={l.status} />
            <ChevronDown size={16} className={`text-slate-400 transition ${open === l.id ? 'rotate-180' : ''}`} />
          </button>
          {open === l.id && detail && (
            <div className="mt-3 space-y-3 slide-down">
              {detail.hodNote && <p className="text-[12.5px] rounded-lg bg-white/60 px-3 py-2"><b>HOD's note:</b> {detail.hodNote}</p>}
              {groupBySection(detail.slots).map(g => (
                <div key={g.date}>
                  <p className="text-[12px] font-800 text-[color:var(--c-600)]">{fmt(g.date)}</p>
                  {g.sections.map(sec => sec.rows.map(s => (
                    <p key={s.key} className="text-[12.5px] text-slate-700 py-0.5">
                      <b>{sec.sectionId}</b> · {periods(s)} · {s.subjectName}{s.blockType === 'LAB' ? ' (lab)' : ''} →{' '}
                      {s.substitute ? <span className="font-700 text-emerald-700">{s.substitute.name}</span> : <span className="text-slate-500">{detail.status === 'REJECTED' || detail.status === 'CANCELLED' ? 'not needed' : 'waiting for the HOD to assign'}</span>}
                    </p>
                  )))}
                </div>
              ))}
              {(l.status === 'PENDING' || l.status === 'APPROVED') && l.toDate >= today() && (
                <div className="flex justify-end"><Btn variant="outline" onClick={() => cancel(l.id)}><X size={14} /> Cancel this leave</Btn></div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ───────────────────────── score, duties and who worked for whom ───────────────────────── */
function Score({ tick }: { tick: number }) {
  const [s, setS] = useState<LeaveSummary | null>(null)
  useEffect(() => { api.leave.summary().then(setS).catch(() => setS(null)) }, [tick])
  if (!s) return <p className="text-slate-500 text-sm">Loading…</p>
  const stat = (label: string, value: number | string, sub: string) => (
    <div className="glass-main rounded-2xl p-4"><p className="text-[10.5px] font-700 tracking-[0.12em] uppercase text-slate-500">{label}</p><p className="font-display font-800 text-[26px] text-[color:var(--c-600)] leading-tight">{value}</p><p className="text-[12px] text-slate-500">{sub}</p></div>
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {stat('Leave taken', s.leaves.days, `working day${s.leaves.days === 1 ? '' : 's'} · ${s.leaves.requests} approved request${s.leaves.requests === 1 ? '' : 's'}`)}
        {stat('Classes you covered', s.covering.periods, `period${s.covering.periods === 1 ? '' : 's'} taken for ${s.covering.forPeople.length} colleague${s.covering.forPeople.length === 1 ? '' : 's'}`)}
        {stat('Covered for you', s.coveredForMe.reduce((n, p) => n + p.periods, 0), `period${s.coveredForMe.reduce((n, p) => n + p.periods, 0) === 1 ? '' : 's'} taken by ${s.coveredForMe.length} colleague${s.coveredForMe.length === 1 ? '' : 's'}`)}
      </div>

      <div className={card}>
        <h3 className="font-700 text-[13.5px] text-slate-800 flex items-center gap-2"><UserCheck size={15} /> Your substitution classes coming up</h3>
        {s.upcomingDuties.length === 0 ? <p className="text-[12.5px] text-slate-500 mt-1">None right now.</p> : (
          <ul className="mt-2 space-y-1.5">
            {s.upcomingDuties.map(d => (
              <li key={d.id} className="text-[13px] text-slate-700 rounded-lg bg-white/60 px-3 py-2">
                <b>{fmt(d.date)}</b> · {periods(d)} · section <b>{d.sectionId}</b> · {d.subject}{d.blockType === 'LAB' ? ' (lab)' : ''} — <span className="text-[color:var(--c-700)] font-700">in place of {d.inPlaceOfName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={card}>
          <h3 className="font-700 text-[13.5px] text-slate-800 flex items-center gap-2"><Handshake size={15} /> You worked for</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">When you ask for leave, these colleagues are marked in the list so you can request them in return.</p>
          {s.covering.forPeople.length === 0 ? <p className="text-[12.5px] text-slate-500 mt-2">Nobody yet.</p> : (
            <ul className="mt-2 divide-y divide-slate-200/70">
              {s.covering.forPeople.map(p => <li key={p.facultyId} className="py-1.5 flex justify-between gap-2 text-[13px]"><span className="font-600 text-slate-800">{p.name}</span><span className="text-slate-500">{p.periods} period{p.periods === 1 ? '' : 's'} · {p.dates.map(fmt).join(', ')}</span></li>)}
            </ul>
          )}
        </div>
        <div className={card}>
          <h3 className="font-700 text-[13.5px] text-slate-800">Who covered for you</h3>
          {s.coveredForMe.length === 0 ? <p className="text-[12.5px] text-slate-500 mt-2">Nobody yet.</p> : (
            <ul className="mt-2 divide-y divide-slate-200/70">
              {s.coveredForMe.map(p => <li key={p.facultyId} className="py-1.5 flex justify-between gap-2 text-[13px]"><span className="font-600 text-slate-800">{p.name}</span><span className="text-slate-500">{p.periods} period{p.periods === 1 ? '' : 's'} · {p.dates.map(fmt).join(', ')}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── HOD: inbox with the assignment board ───────────────────────── */
function Inbox({ tick, bump }: { tick: number; bump: () => void }) {
  const [rows, setRows] = useState<LeaveListItem[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [d, setD] = useState<LeaveDetail | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [showLetter, setShowLetter] = useState(false)
  const [more, setMore] = useState<Record<string, boolean>>({})

  const loadList = useCallback(() => api.leave.list().then(r => { setRows(r); setSel(cur => cur ?? r[0]?.id ?? null) }).catch(e => setErr(e.message)), [])
  useEffect(() => { loadList() }, [loadList, tick])
  useEffect(() => { setD(null); setNote(''); if (sel != null) api.leave.get(sel).then(setD).catch(e => setErr(e.message)) }, [sel, tick])

  const act = async (fn: () => Promise<LeaveDetail>) => {
    setErr(''); setBusy(true)
    try { setD(await fn()); await loadList(); bump() } catch (e) { setErr((e as Error).message); if (sel != null) api.leave.get(sel).then(setD).catch(() => {}) } finally { setBusy(false) }
  }
  if (!rows) return <p className="text-slate-500 text-sm">{err || 'Loading…'}</p>
  if (rows.length === 0) return <div className={`${card} text-center text-[13px] text-slate-500`}>No leave letters yet. When a teacher sends one, it appears here (and in your messages and email).</div>

  const groups = d ? groupBySection(d.slots) : []
  const open = d && d.status !== 'REJECTED' && d.status !== 'CANCELLED'
  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_1fr] items-start">
      <div className="space-y-2">
        {rows.map(l => (
          <button key={l.id} onClick={() => setSel(l.id)} className={`w-full text-left rounded-2xl p-3 transition ${sel === l.id ? 'glass-main ring-2 ring-[color:var(--accent)]' : 'glass-main hover:-translate-y-0.5'}`}>
            <div className="flex items-center justify-between gap-2"><p className="font-700 text-[13px] text-slate-800 truncate">{l.facultyName}</p><Badge s={l.status} /></div>
            <p className="text-[12px] text-slate-600 mt-0.5">{range(l.fromDate, l.toDate)}</p>
            <p className="text-[11.5px] text-slate-500">{l.coverage.total ? `${l.coverage.covered} of ${l.coverage.total} classes covered` : 'no classes'}</p>
          </button>
        ))}
      </div>

      <div className="space-y-3 min-w-0">
        {!d ? <p className="text-slate-500 text-sm">Loading…</p> : (
          <>
            <div className={`${card} space-y-2`}>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display font-700 text-[16px] text-[color:var(--c-600)]">{d.facultyName}</p><Badge s={d.status} />
                <span className="text-[12.5px] text-slate-600">{range(d.fromDate, d.toDate)}</span>
                <span className="ml-auto text-[12px] font-700 text-slate-700">{d.coverage.covered} of {d.coverage.total} classes covered</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200/80 overflow-hidden"><div className="h-full rounded-full bg-[color:var(--c-500)] transition-all" style={{ width: `${d.coverage.total ? (100 * d.coverage.covered) / d.coverage.total : 100}%` }} /></div>
              <p className="text-[12.5px] text-slate-600"><b>Reason:</b> {d.reason}</p>
              <button onClick={() => setShowLetter(v => !v)} className="text-[12px] font-600 text-[color:var(--c-600)] hover:underline">{showLetter ? 'Hide the letter' : 'Read the letter'}</button>
              {showLetter && <pre className="whitespace-pre-wrap font-[inherit] text-[12.5px] leading-relaxed rounded-xl bg-white/60 p-3 text-slate-700">{d.letter}</pre>}
              {d.hodNote && <p className="text-[12.5px]"><b>Your note:</b> {d.hodNote}</p>}
            </div>
            {err && <p className="text-[12.5px] font-600 text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-lg px-3 py-2">{err}</p>}

            {d.slots.length === 0 && <div className={`${card} text-[13px] text-slate-600`}>{d.facultyName} has no classes on these dates, so there is nothing to assign.</div>}
            {groups.map(g => (
              <div key={g.date} className={`${card} space-y-3`}>
                <p className="font-display font-700 text-[14px] text-[color:var(--c-600)]">{fmt(g.date)}</p>
                {g.sections.map(sec => (
                  <div key={sec.sectionId} className="rounded-xl bg-white/50 ring-1 ring-white/70 p-3">
                    <p className="text-[12px] font-800 tracking-wide text-slate-700 mb-2">SECTION {sec.sectionId}</p>
                    <div className="space-y-3">
                      {sec.rows.map(s => {
                        const named = s.candidates.filter(c => c.proposed)
                        const staff = s.candidates.filter(c => !c.proposed && c.staffOfSection)
                        const rest = s.candidates.filter(c => !c.proposed && !c.staffOfSection)
                        const pick = (c: LeaveCandidate) => (
                          <button key={c.facultyId} disabled={busy || !open} onClick={() => act(() => api.leave.assign(d.id, s.key, c.facultyId))} title={`${c.name} · ${c.weeklyLoad} periods a week · ${c.substitutionsThatWeek} substitution periods that week`}
                            className="flex flex-col items-start rounded-xl px-2.5 py-1.5 text-left bg-white/70 ring-1 ring-slate-300 hover:ring-[color:var(--c-500)] hover:bg-white transition disabled:opacity-50">
                            <span className="text-[12.5px] font-700 text-slate-800">{bare(c.name)}</span><Tags c={c} />
                          </button>
                        )
                        const key = s.key
                        return (
                          <div key={key}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[13px] font-600 text-slate-800">{periods(s)} · {s.subjectName}{s.blockType === 'LAB' ? ' (lab)' : ''}</p>
                              {s.substitute && (
                                <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-700 pl-2.5 pr-1 py-0.5">
                                  <Check size={12} /> {bare(s.substitute.name)}
                                  {open && <button title="Remove" onClick={() => act(() => api.leave.unassign(d.id, s.key))} className="grid place-items-center w-5 h-5 rounded-full hover:bg-emerald-200"><X size={11} /></button>}
                                </span>
                              )}
                            </div>
                            {open && s.date >= today() && (
                              <div className="mt-1.5 space-y-1.5">
                                {s.candidates.length === 0 && <p className="text-[12px] text-rose-700">Nobody is free in this period.</p>}
                                {named.length > 0 && <div><p className="text-[10.5px] font-700 uppercase tracking-wide text-[color:var(--c-600)] mb-1">Named by {bare(d.facultyName)}</p><div className="flex flex-wrap gap-1.5">{named.map(pick)}</div></div>}
                                {staff.length > 0 && <div><p className="text-[10.5px] font-700 uppercase tracking-wide text-slate-500 mb-1">Free · teach this section</p><div className="flex flex-wrap gap-1.5">{staff.map(pick)}</div></div>}
                                {rest.length > 0 && (
                                  <div>
                                    <button onClick={() => setMore(m => ({ ...m, [key]: !m[key] }))} className="text-[11.5px] font-600 text-[color:var(--c-600)] hover:underline">{more[key] ? 'Hide' : 'Show'} other free teachers ({rest.length})</button>
                                    {more[key] && <div className="flex flex-wrap gap-1.5 mt-1">{rest.map(pick)}</div>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {(d.status === 'PENDING' || d.status === 'APPROVED') && (
              <div className={`${card} space-y-2`}>
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Note to the teacher (optional)" className={`${input} w-full`} />
                <div className="flex gap-2 justify-end flex-wrap">
                  <Btn variant="outline" disabled={busy} onClick={() => { if (window.confirm('Reject this leave? Any substitutes already assigned will be cancelled and told.')) act(() => api.leave.decide(d.id, 'REJECT', note || undefined)) }}><X size={14} /> Reject</Btn>
                  {d.status === 'PENDING' && <Btn disabled={busy} onClick={() => { if (d.coverage.covered < d.coverage.total && !window.confirm(`${d.coverage.total - d.coverage.covered} class(es) have no substitute yet. Approve the leave anyway?`)) return; act(() => api.leave.decide(d.id, 'APPROVE', note || undefined)) }}><Check size={14} /> Approve leave</Btn>}
                </div>
                <p className="text-[11.5px] text-slate-500">Assigning a substitute approves the leave automatically. The substitute sees the class on their dashboard and gets a message and an email.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Board({ tick }: { tick: number }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.leave.scoreboard>> | null>(null)
  useEffect(() => { api.leave.scoreboard().then(setRows).catch(() => setRows([])) }, [tick])
  if (!rows) return <p className="text-slate-500 text-sm">Loading…</p>
  if (rows.length === 0) return <div className={`${card} text-center text-[13px] text-slate-500`}>No approved leave or substitution yet.</div>
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-[13px]">
        <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="py-1.5">Teacher</th><th className="text-right">Leave days</th><th className="text-right">Periods missed</th><th className="text-right">Periods covered for others</th></tr></thead>
        <tbody className="divide-y divide-slate-200/70">
          {rows.map(r => <tr key={r.facultyId}><td className="py-1.5 font-600 text-slate-800">{r.name}</td><td className="text-right">{r.leaveDays}</td><td className="text-right">{r.periodsMissed}</td><td className="text-right font-700 text-[color:var(--c-700)]">{r.periodsCovered}</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

/* ───────────────────────── the page ───────────────────────── */
export default function LeavePage({ role }: { role: 'FACULTY' | 'HOD'; navigate?: (p: Page) => void }) {
  const hod = role === 'HOD'
  type Tab = 'inbox' | 'record' | 'board' | 'request' | 'mine' | 'score'
  const [tab, setTab] = useState<Tab>(hod ? 'inbox' : 'request')
  const [tick, setTick] = useState(0)
  const bump = () => setTick(t => t + 1)
  const tabs: { id: Tab; label: string }[] = hod
    ? [{ id: 'inbox', label: 'Leave requests' }, { id: 'record', label: 'Record a leave' }, { id: 'board', label: 'Leave & cover record' }, { id: 'mine', label: 'My leaves' }, { id: 'request', label: 'Request my leave' }, { id: 'score', label: 'My score' }]
    : [{ id: 'request', label: 'Request leave' }, { id: 'mine', label: 'My leaves' }, { id: 'score', label: 'Score & duties' }]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5 flex-wrap">
        <h1 className="font-display font-700 text-lg text-[color:var(--c-600)] flex items-center gap-2"><CalendarOff className="w-5 h-5" /> Leave &amp; substitution</h1>
        <PillTabs value={tab} onChange={setTab} tabs={tabs} />
      </div>
      {tab === 'inbox' && <Inbox tick={tick} bump={bump} />}
      {tab === 'record' && <RequestForm asHod onSent={() => { bump(); setTab('inbox') }} />}
      {tab === 'board' && <Board tick={tick} />}
      {tab === 'request' && <RequestForm asHod={false} onSent={bump} />}
      {tab === 'mine' && <MyLeaves reload={bump} tick={tick} />}
      {tab === 'score' && <Score tick={tick} />}
    </div>
  )
}
