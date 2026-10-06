import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarSubstitution, LeaveCalendar } from '../api'

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (n: number) => String(n).padStart(2, '0')
const periods = (s: { startPeriod: number; endPeriod: number }) => (s.startPeriod === s.endPeriod ? `P${s.startPeriod}` : `P${s.startPeriod}–${s.endPeriod}`)
export const bareName = (n: string) => n.replace(/^(mrs|mr|ms|dr|prof)\.?\s*/i, '').trim()

/** one substitution as a sentence, from the point of view of whoever is looking */
export function SubLine({ s, me, role }: { s: CalendarSubstitution; me?: string; role: 'HOD' | 'FACULTY' }) {
  const what = <>{periods(s)} · <b>{s.sectionId}</b> · {s.subject}{s.blockType === 'LAB' ? ' (lab)' : ''}</>
  if (role === 'FACULTY' && me === s.substituteId) return <>{what} — you take it in place of <b>{bareName(s.originalName)}</b></>
  if (role === 'FACULTY' && me === s.originalId) return <>{what} — <b>{bareName(s.substituteName)}</b> takes it for you</>
  return <>{what} — <b>{bareName(s.substituteName)}</b> in place of {bareName(s.originalName)}</>
}

/** A month grid: a rose dot on days with leave, an amber dot on days with a substitution. Click a day to choose it. */
export default function LeaveCalendarView({ data, month, onMonth, selected, onSelect }: {
  data: LeaveCalendar | null; month: string; onMonth: (m: string) => void; selected: string; onSelect: (d: string) => void
}) {
  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5))]
  const first = new Date(Date.UTC(y, m - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7                       // Monday first
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const today = data?.today ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const shift = (d: number) => { const t = new Date(Date.UTC(y, m - 1 + d, 1)); onMonth(`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`) }
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`)]
  while (cells.length % 7) cells.push(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => shift(-1)} aria-label="Previous month" className="w-7 h-7 grid place-items-center rounded-lg hover:bg-white/60 text-slate-600"><ChevronLeft size={16} /></button>
        <p className="font-display font-700 text-[13.5px] text-slate-800">{first.toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' })}</p>
        <button onClick={() => shift(1)} aria-label="Next month" className="w-7 h-7 grid place-items-center rounded-lg hover:bg-white/60 text-slate-600"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map(w => <span key={w} className="text-[10px] font-700 uppercase tracking-wide text-slate-400 pb-1">{w[0]}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const info = data?.days[d]
          const leaves = info?.leaves.length ?? 0, subs = info?.substitutions.length ?? 0
          const sel = d === selected, isToday = d === today
          const weekend = i % 7 >= 5
          return (
            <button key={d} onClick={() => onSelect(d)} title={`${leaves ? leaves + ' on leave' : ''}${leaves && subs ? ' · ' : ''}${subs ? subs + ' substitution' + (subs === 1 ? '' : 's') : ''}`}
              className={`relative h-9 rounded-lg text-[12px] font-600 transition ${sel ? 'bg-[color:var(--c-600)] text-white shadow' : isToday ? 'ring-2 ring-[color:var(--accent)] text-slate-900 bg-white/60' : weekend ? 'text-slate-400 hover:bg-white/50' : 'text-slate-700 hover:bg-white/60'}`}>
              {Number(d.slice(8))}
              {(leaves > 0 || subs > 0) && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {leaves > 0 && <span className={`w-1.5 h-1.5 rounded-full ${sel ? 'bg-rose-200' : 'bg-rose-500'}`} />}
                  {subs > 0 && <span className={`w-1.5 h-1.5 rounded-full ${sel ? 'bg-amber-200' : 'bg-amber-500'}`} />}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex gap-3 mt-2 text-[10.5px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> leave</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> substitution</span>
      </div>
    </div>
  )
}
