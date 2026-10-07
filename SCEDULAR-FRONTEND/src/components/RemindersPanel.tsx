import { useEffect, useState } from 'react'
import { Check, Megaphone, Trash2 } from 'lucide-react'
import { api, type ReminderItem } from '../api'

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
const when = (date: string, today: string) => {
  const d = dayDiff(today, date)
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 14 ? `In ${d} days` : `In ${Math.round(d / 7)} weeks`
}
const field = 'h-10 rounded-xl bg-white/80 px-3 text-[13.5px] text-slate-800 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--c-500)]'

/** Reminders, soonest first (today's on top, then later dates). Like events in a calendar: a date, an optional time, a title, a note. */
export default function RemindersPanel({ items, today, isHod, openFor, onChanged }: {
  items: ReminderItem[]; today: string; isHod: boolean; openFor: { date: string; n: number } | null; onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [everyone, setEveryone] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // "+ Reminder" on a calendar day opens the form with that date
  useEffect(() => { if (openFor) { setDate(openFor.date); setOpen(true) } }, [openFor])

  const upcoming = items.filter(r => r.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.id - b.id)
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn(); onChanged() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
  const save = () => act(async () => {
    if (!title.trim()) throw new Error('Give the reminder a title.')
    await api.reminders.create({ date, time: time || null, title: title.trim(), note: note.trim(), audience: isHod && everyone ? 'all' : 'me' })
    setTitle(''); setNote(''); setTime(''); setEveryone(false); setOpen(false)
  })

  return (
    <section>
      <div className="lg-title">
        <h2>Reminders</h2>
        <span className="text-[12px] font-500 text-slate-400">soonest first</span>
        <button onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Add reminder'}</button>
      </div>
      <div className="lg-panel lg-clip">
        {open && (
          <div className="p-4 sm:p-5 space-y-3 border-b border-slate-900/[0.075]">
            <div className="grid gap-2.5 sm:grid-cols-[10.5rem_8rem_minmax(0,1fr)]">
              <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} className={field} aria-label="Date" />
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={field} aria-label="Time (optional)" />
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Title, e.g. Faculty meeting" className={field} onKeyDown={e => { if (e.key === 'Enter') save() }} />
            </div>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Note (optional)" className={`${field} w-full`} />
            <div className="flex items-center gap-3 flex-wrap">
              {isHod && <label className="flex items-center gap-2 text-[13px] text-slate-600"><input type="checkbox" checked={everyone} onChange={e => setEveryone(e.target.checked)} /> Show to all teachers</label>}
              {err && <span className="text-[12.5px] font-600 text-rose-700">{err}</span>}
              <button disabled={busy} onClick={save} className="lg-btn lg-btn-primary !h-10 ml-auto disabled:opacity-50">Save reminder</button>
            </div>
          </div>
        )}

        {upcoming.length === 0 ? (
          <div className="lg-row text-[13.5px] text-slate-500">Nothing coming up. Add a date to be reminded, for example the last day to submit results.</div>
        ) : upcoming.slice(0, 8).map(r => (
          <div key={r.id} className="lg-row group">
            <span className="lg-lead !min-w-[3.6rem] leading-tight">
              <span className="block text-[14px] font-700 text-slate-900">{new Date(r.date + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })}</span>
              <span className="block text-[11px] font-500 text-slate-400">{new Date(r.date + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short' })}</span>
            </span>
            <div className="lg-main">
              <p className={`lg-t truncate ${r.done ? 'line-through opacity-50' : ''}`}>{r.title}{r.audience === 'all' && <Megaphone size={12} className="inline ml-2 -mt-0.5 text-slate-400" aria-label="for everyone" />}</p>
              <p className="lg-s truncate"><span className={r.date === today ? 'font-600 text-[color:var(--c-600)]' : ''}>{when(r.date, today)}</span>{r.time ? ` · ${r.time}` : ''}{r.note ? ` · ${r.note}` : ''}{r.audience === 'all' ? ' · for everyone' : ''}</p>
            </div>
            {r.mine && <button disabled={busy} onClick={() => act(() => api.reminders.update(r.id, { done: !r.done }))} title={r.done ? 'Mark as not done' : 'Mark as done'} aria-label={r.done ? 'Mark as not done' : 'Mark as done'}
              className={`w-7 h-7 grid place-items-center rounded-full transition ${r.done ? 'bg-[color:var(--c-600)] text-white' : 'text-transparent shadow-[inset_0_0_0_1.5px_rgba(100,116,139,0.45)] hover:text-slate-400'}`}><Check size={14} /></button>}
            {(r.mine || (isHod && r.audience === 'all')) && <button disabled={busy} onClick={() => act(() => api.reminders.remove(r.id))} title="Delete" aria-label="Delete reminder" className="lg-icon-btn !w-7 !h-7 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"><Trash2 size={14} /></button>}
          </div>
        ))}
        {upcoming.length > 8 && <div className="lg-row text-[12.5px] text-slate-500">+{upcoming.length - 8} more later</div>}
      </div>
    </section>
  )
}
