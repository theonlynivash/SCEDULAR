import { useEffect, useState } from 'react'
import { BellRing, Check, Plus, Trash2 } from 'lucide-react'
import { api, type ReminderItem } from '../api'

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
const when = (date: string, today: string) => {
  const d = dayDiff(today, date)
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 0 ? `${-d} day${d === -1 ? '' : 's'} ago` : d < 14 ? `in ${d} days` : `in ${Math.round(d / 7)} weeks`
}
const chip = (date: string) => new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const field = 'rounded-xl bg-white/80 ring-1 ring-slate-300 px-3 py-1.5 text-[12.5px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--c-500)]'

/** The reminders, soonest first (today's on top, then later dates), with a small form to add one. */
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
  // choosing "add a reminder on this day" on the calendar opens the form with that date
  useEffect(() => { if (openFor) { setDate(openFor.date); setOpen(true) } }, [openFor])

  const upcoming = items.filter(r => r.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.id - b.id)
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn(); onChanged() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
  const save = () => act(async () => {
    if (!title.trim()) throw new Error('Give the reminder a title.')
    await api.reminders.create({ date, time: time || null, title: title.trim(), note: note.trim(), audience: isHod && everyone ? 'all' : 'me' })
    setTitle(''); setNote(''); setTime(''); setEveryone(false); setOpen(false)
  })

  return (
    <div className="glass-white tone-sage p-4">
      <div className="flex items-center gap-2">
        <span className="gw-icon"><BellRing size={14} /></span>
        <p className="gw-title">Reminders</p>
        <span className="text-[11px] text-slate-500">soonest first</span>
        <button onClick={() => setOpen(o => !o)} className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-700 text-white bg-[color:var(--c-600)] hover:brightness-110"><Plus size={13} /> {open ? 'Close' : 'Add'}</button>
      </div>

      {open && (
        <div className="mt-3 rounded-xl bg-white/70 ring-1 ring-white p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} className={field} aria-label="Date" />
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className={field} aria-label="Time (optional)" />
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="What to remember, e.g. Faculty meeting" className={`${field} flex-1 min-w-[12rem]`} onKeyDown={e => { if (e.key === 'Enter') save() }} />
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Note (optional)" className={`${field} w-full`} />
          <div className="flex items-center gap-3 flex-wrap">
            {isHod && <label className="flex items-center gap-1.5 text-[12px] text-slate-600"><input type="checkbox" checked={everyone} onChange={e => setEveryone(e.target.checked)} /> Show to all teachers</label>}
            {err && <span className="text-[12px] font-600 text-rose-700">{err}</span>}
            <button disabled={busy} onClick={save} className="ml-auto px-4 py-1.5 rounded-full text-[12px] font-700 text-white bg-[color:var(--c-600)] disabled:opacity-50">Save reminder</button>
          </div>
        </div>
      )}

      {upcoming.length === 0 ? (
        <p className="text-[12.5px] text-slate-500 mt-3">Nothing coming up. Add a date to be reminded, for example the last day to submit results.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {upcoming.slice(0, 8).map(r => (
            <li key={r.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-white/80 ${r.date === today ? 'bg-[color:var(--accent)]/25' : 'bg-white/60'}`}>
              <span className="w-12 flex-shrink-0 text-center leading-tight"><span className="block text-[15px] font-800 text-[color:var(--c-700)]">{chip(r.date).split(' ')[0]}</span><span className="block text-[10px] font-700 uppercase tracking-wide text-slate-500">{chip(r.date).split(' ')[1]}</span></span>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-600 text-slate-800 truncate ${r.done ? 'line-through opacity-60' : ''}`}>{r.title}{r.audience === 'all' && <span className="ml-2 px-1.5 rounded bg-[color:var(--c-500)]/15 text-[color:var(--c-700)] text-[10px] font-700 align-middle">for everyone</span>}</p>
                <p className="text-[11.5px] text-slate-500 truncate">{when(r.date, today)}{r.time ? ` · ${r.time}` : ''}{r.note ? ` · ${r.note}` : ''}</p>
              </div>
              {r.mine && <button disabled={busy} onClick={() => act(() => api.reminders.update(r.id, { done: !r.done }))} title={r.done ? 'Mark as not done' : 'Mark as done'} className={`w-7 h-7 grid place-items-center rounded-full ring-1 transition ${r.done ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-white/70 text-slate-400 ring-slate-300 hover:text-emerald-600'}`}><Check size={14} /></button>}
              {(r.mine || isHod && r.audience === 'all') && <button disabled={busy} onClick={() => act(() => api.reminders.remove(r.id))} title="Delete" className="w-7 h-7 grid place-items-center rounded-full text-slate-400 hover:text-rose-600 hover:bg-white/70"><Trash2 size={14} /></button>}
            </li>
          ))}
          {upcoming.length > 8 && <li className="text-[11.5px] text-slate-500 px-1">+{upcoming.length - 8} more later</li>}
        </ul>
      )}
    </div>
  )
}
