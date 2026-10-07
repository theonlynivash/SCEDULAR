import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarSubstitution, LeaveDuty } from '../api'
import { shortName } from '../utils/names'

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const pad = (n: number) => String(n).padStart(2, '0')

/** "P3" or "P1–2" */
export const periodText = (s: { startPeriod: number; endPeriod: number }) => (s.startPeriod === s.endPeriod ? `P${s.startPeriod}` : `P${s.startPeriod}–${s.endPeriod}`)
/** kept under its old name: a name without the title */
export const bareName = shortName

/** Neighbouring periods of the same class taken by the same person become one line: P1 + P2 -> P1–2 */
export function mergeSubs(list: CalendarSubstitution[]): CalendarSubstitution[] {
  const byClass = [...list].sort((a, b) => a.sectionId.localeCompare(b.sectionId, undefined, { numeric: true }) || a.subject.localeCompare(b.subject) || a.startPeriod - b.startPeriod)
  const out: CalendarSubstitution[] = []
  for (const s of byClass) {
    const prev = out[out.length - 1]
    if (prev && prev.sectionId === s.sectionId && prev.subject === s.subject && prev.blockType === s.blockType && prev.originalId === s.originalId && prev.substituteId === s.substituteId && s.startPeriod <= prev.endPeriod + 1) {
      prev.endPeriod = Math.max(prev.endPeriod, s.endPeriod)
      continue
    }
    out.push({ ...s })
  }
  return out.sort((a, b) => a.startPeriod - b.startPeriod || a.sectionId.localeCompare(b.sectionId, undefined, { numeric: true }))
}

/** one substitution as a two-line row: the period, the class, and who takes it for whom */
export function SubRow({ s, me, role, flush = false }: { s: CalendarSubstitution; me?: string; role: 'HOD' | 'FACULTY'; flush?: boolean }) {
  let who: string
  if (role === 'FACULTY' && me === s.substituteId) who = `You have a substitution class in place of ${shortName(s.originalName)}`
  else if (role === 'FACULTY' && me === s.originalId) who = `${shortName(s.substituteName)} takes this class for you`
  else who = `${shortName(s.substituteName)} in place of ${shortName(s.originalName)}`
  return (
    <div className={`lg-row ${flush ? '!px-0' : ''}`}>
      <span className="lg-lead">{periodText(s)}</span>
      <div className="lg-main">
        <p className="lg-t truncate">{s.sectionId} · {s.subject}{s.blockType === 'LAB' ? ' (lab)' : ''}</p>
        <p className="lg-s truncate">{who}</p>
      </div>
    </div>
  )
}

/** an upcoming duty of a teacher (a later day): the date leads instead of the period */
export function DutyRow({ d, flush = false }: { d: LeaveDuty; flush?: boolean }) {
  const day = new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className={`lg-row ${flush ? '!px-0' : ''}`}>
      <span className="lg-lead !min-w-[4.6rem]">{day}</span>
      <div className="lg-main">
        <p className="lg-t truncate">{d.sectionId} · {d.subject}{d.blockType === 'LAB' ? ' (lab)' : ''}</p>
        <p className="lg-s truncate">{periodText(d)} · You have a substitution class in place of {shortName(d.inPlaceOfName)}</p>
      </div>
    </div>
  )
}

/**
 * A month grid. A small dot marks a day that has something on it (leave, a substitution or a reminder); the list for the chosen
 * day is shown next to or under it by the page. The chosen day is a filled circle, today is written in the accent colour.
 */
export default function MonthCalendar({ month, onMonth, selected, onSelect, today, marks }: {
  month: string; onMonth: (m: string) => void; selected: string; onSelect: (d: string) => void; today: string
  /** date -> what is on that day: leave, substitutions, reminders (each shown as a coloured dot) */
  marks: Record<string, { leave: number; sub: number; rem: number }>
}) {
  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5))]
  const first = new Date(Date.UTC(y, m - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7                       // weeks start on Monday
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const shift = (d: number) => { const t = new Date(Date.UTC(y, m - 1 + d, 1)); onMonth(`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`) }
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`)]
  while (cells.length % 7) cells.push(null)

  return (
    <div>
      <div className="flex items-center mb-3">
        <h3 className="font-display text-[17px] font-600 tracking-tight text-slate-900">
          {first.toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long' })} <span className="font-500 text-slate-500">{y}</span>
        </h3>
        <div className="ml-auto flex items-center gap-0.5">
          {month !== today.slice(0, 7) && <button onClick={() => { onMonth(today.slice(0, 7)); onSelect(today) }} className="mr-1 px-2.5 h-7 rounded-full text-[12px] font-600 text-[color:var(--c-600)] hover:bg-[color:var(--c-600)]/10">Today</button>}
          <button onClick={() => shift(-1)} aria-label="Previous month" className="lg-icon-btn"><ChevronLeft size={18} /></button>
          <button onClick={() => shift(1)} aria-label="Next month" className="lg-icon-btn"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEK.map((w, i) => <span key={i} className="pb-1.5 text-[11px] font-600 text-slate-400">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const sel = d === selected, isToday = d === today, weekend = i % 7 >= 5, mk = marks[d], n = mk ? mk.leave + mk.sub + mk.rem : 0
          return (
            <button key={d} onClick={() => onSelect(d)} aria-label={`${d}${n ? `, ${n} item${n === 1 ? '' : 's'}` : ''}`} aria-pressed={sel}
              className="relative mx-auto my-0.5 w-9 h-9 grid place-items-center rounded-full text-[14px] tabular-nums transition-colors">
              <span className={`absolute inset-0 rounded-full transition-colors ${sel ? 'bg-gradient-to-br from-[var(--c-500)] to-[var(--c-700)] shadow-[0_8px_16px_-6px_rgba(var(--shadow-rgb),0.85),inset_0_1px_0_rgba(255,255,255,0.5)]' : isToday ? 'shadow-[inset_0_0_0_1.5px_var(--c-500)]' : 'hover:bg-white/55'}`} />
              <span className={`relative ${sel ? 'font-700 text-white' : isToday ? 'font-700 text-[color:var(--c-600)]' : weekend ? 'font-500 text-slate-400' : 'font-500 text-slate-800'}`}>{Number(d.slice(8))}</span>
              {n > 0 && (
                <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 flex gap-[3px]">
                  {mk!.leave > 0 && <span className={`w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : 'bg-rose-500'}`} />}
                  {mk!.sub > 0 && <span className={`w-1.5 h-1.5 rounded-full ${sel ? 'bg-white/85' : 'bg-amber-500'}`} />}
                  {mk!.rem > 0 && <span className={`w-1.5 h-1.5 rounded-full ${sel ? 'bg-white/70' : 'bg-[color:var(--c-500)]'}`} />}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-2.5 flex items-center gap-4 text-[11.5px] text-slate-600">
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />Leave</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Substitution</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[color:var(--c-500)]" />Reminder</span>
      </div>
    </div>
  )
}
