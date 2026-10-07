import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import type { Period } from '../api'

/**
 * A day laid out like the day view of a calendar: one row per period with its clock time, tea and lunch as thin rows, events as
 * blocks that span the periods they cover (a 3-period lab is one tall block), side by side when they happen at the same time,
 * and a line for the current time.
 */
export type DayEvent = {
  id: string
  start: number            // first period
  end: number              // last period
  kind: 'class' | 'cover' | 'covered' | 'uncovered'
  title: string
  sub: string
  extra?: string
  lab?: boolean
  onClick?: () => void
}

const ROW = 62       // height of one period
const BREAK = 26     // height of tea / lunch
const GUTTER = '3.7rem'

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const clock = (hhmm: string) => { const [h, m] = hhmm.split(':'); return `${Number(h)}:${m}` }
const istMinutes = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  return (Number(parts.find(p => p.type === 'hour')!.value) % 24) * 60 + Number(parts.find(p => p.type === 'minute')!.value)
}
const hhmm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`

/** events that overlap in time share the width: each gets a column among `cols` */
function arrange(evs: DayEvent[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>()
  const sorted = [...evs].sort((a, b) => a.start - b.start || b.end - a.end)
  let group: { id: string; col: number }[] = []
  let ends: number[] = []
  let groupEnd = -1
  const flush = () => { const cols = Math.max(1, ends.length); group.forEach(g => out.set(g.id, { col: g.col, cols })); group = []; ends = []; groupEnd = -1 }
  for (const e of sorted) {
    if (group.length && e.start > groupEnd) flush()
    let col = ends.findIndex(end => end < e.start)
    if (col < 0) { col = ends.length; ends.push(e.end) } else ends[col] = e.end
    group.push({ id: e.id, col })
    groupEnd = Math.max(groupEnd, e.end)
  }
  flush()
  return out
}

const OPEN_KEY = 'scedular-day-open'

export default function DayTimeline({ title, caption, periods, events, onOpen, openLabel, onDownload }: {
  title: string; caption?: string; periods: Period[]; events: DayEvent[]; onOpen?: () => void; openLabel?: string
  /** a PDF of today's substitutions (HOD) */
  onDownload?: () => void
}) {
  const [now, setNow] = useState(istMinutes())
  useEffect(() => { const t = setInterval(() => setNow(istMinutes()), 30_000); return () => clearInterval(t) }, [])
  // a slim row by default; the full day opens as a dropdown (and stays as the person left it)
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } })
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem(OPEN_KEY, n ? '1' : '0') } catch { /* private window */ } return n })

  const { rows, total } = useMemo(() => {
    const rows: { kind: 'period' | 'break'; top: number; h: number; p?: Period; label?: string; from: number; to: number }[] = []
    let top = 0
    periods.forEach((p, i) => {
      if (i > 0) {
        const a = toMin(periods[i - 1].end), b = toMin(p.start)
        if (b > a) { rows.push({ kind: 'break', top, h: BREAK, label: b - a <= 20 ? 'Tea' : 'Lunch', from: a, to: b }); top += BREAK }
      }
      rows.push({ kind: 'period', top, h: ROW, p, from: toMin(p.start), to: toMin(p.end) })
      top += ROW
    })
    return { rows, total: top }
  }, [periods])

  const rowOf = (periodIndex: number) => rows.find(r => r.kind === 'period' && r.p!.index === periodIndex)
  const layout = useMemo(() => arrange(events), [events])
  const nowY = (() => {
    for (const r of rows) if (now >= r.from && now < r.to) return r.top + ((now - r.from) / (r.to - r.from)) * r.h
    return null
  })()
  const placed = events.filter(e => rowOf(e.start) && rowOf(e.end))

  // what the slim row says: a class that needs a substitute, what is on now, or what is next
  const preview = (() => {
    const times = placed.map(e => ({ e, from: rowOf(e.start)!.from, to: rowOf(e.end)!.to }))
    const unc = placed.filter(e => e.kind === 'uncovered')
    if (unc.length) return { tone: 'warn' as const, label: 'Action', text: `${unc.length} class${unc.length === 1 ? '' : 'es'} need${unc.length === 1 ? 's' : ''} a substitute` }
    const cur = times.find(x => now >= x.from && now < x.to)
    if (cur) return { tone: 'now' as const, label: 'Now', text: `${cur.e.title} · ${cur.e.sub}` }
    const nxt = times.filter(x => x.from > now).sort((a, b) => a.from - b.from)[0]
    if (nxt) return { tone: 'next' as const, label: `Next ${hhmm(nxt.from)}`, text: `${nxt.e.title} · ${nxt.e.sub}` }
    return { tone: 'done' as const, label: '', text: 'Done for today' }
  })()

  return (
    <section className="lg-panel lg-clip">
      <div className="flex items-center">
        <button onClick={toggle} aria-expanded={open} className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-5 sm:pl-6 pr-3 py-4 text-left">
          <h2 className="font-display text-[19px] font-700 tracking-tight text-slate-900">{title}</h2>
          {caption && <span className="text-[13px] text-slate-600">{caption}</span>}
          <span className="order-last sm:order-none sm:ml-auto w-full sm:w-auto min-w-0 max-w-full flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 min-w-0 max-w-full rounded-full px-3 h-8 text-[13px] ${preview.tone === 'warn' ? 'bg-amber-400/30 text-amber-950 shadow-[inset_0_0_0_1px_rgba(217,119,6,0.35)]' : preview.tone === 'now' ? 'bg-[color:var(--c-600)]/[0.14] text-slate-900 shadow-[inset_0_0_0_1px_rgba(var(--ink-rgb),0.25)]' : 'bg-white/60 text-slate-700 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9)]'}`}>
              {preview.label && <b className={`shrink-0 text-[11px] font-700 uppercase tracking-wider ${preview.tone === 'warn' ? 'text-rose-700' : preview.tone === 'now' ? 'text-[color:var(--c-700)]' : 'text-slate-500'}`}>{preview.label}</b>}
              <span className="truncate font-500">{preview.text}</span>
            </span>
          </span>
          <ChevronDown size={18} className={`ml-auto sm:ml-0 shrink-0 text-slate-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
        {onDownload && <button onClick={onDownload} title="Download today's substitution sheet (PDF)" aria-label="Download today's substitution sheet (PDF)" className="lg-icon-btn !w-9 !h-9 mr-3 shrink-0"><Download size={17} /></button>}
      </div>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-5 sm:px-6 pb-5">
            {onOpen && <div className="flex justify-end -mt-1 mb-1"><button onClick={onOpen} className="inline-flex items-center gap-0.5 text-[13px] font-600 text-[color:var(--c-600)] hover:underline">{openLabel ?? 'Timetable'} <ChevronRight size={15} /></button></div>}
            <div className="relative" style={{ height: total + 1 }}>
              {rows.map((r, i) => (
                <div key={i} className="absolute inset-x-0" style={{ top: r.top, height: r.h }}>
                  <div className={`absolute inset-x-0 top-0 border-t ${r.kind === 'break' ? 'border-dashed border-slate-900/[0.10]' : 'border-slate-900/[0.09]'}`} />
                  {r.kind === 'period' ? (
                    <div className="absolute left-0 top-[7px] leading-tight" style={{ width: GUTTER }}>
                      <p className="text-[12.5px] font-600 tabular-nums text-slate-700">{clock(r.p!.start)}</p>
                      <p className="text-[11px] font-500 text-slate-500">P{r.p!.index}</p>
                    </div>
                  ) : (
                    <p className="absolute left-0 top-1/2 -translate-y-1/2 text-[10.5px] font-600 uppercase tracking-[0.12em] text-slate-400" style={{ width: GUTTER }}>{r.label}</p>
                  )}
                </div>
              ))}
              <div className="absolute inset-x-0 bottom-0 border-t border-slate-900/[0.09]" />

              <div className="absolute inset-y-0 right-0" style={{ left: GUTTER }}>
                {placed.map(e => {
                  const a = rowOf(e.start)!, b = rowOf(e.end)!
                  const { col, cols } = layout.get(e.id) ?? { col: 0, cols: 1 }
                  const tall = b.top + b.h - a.top > ROW * 1.5
                  const Tag = e.onClick ? 'button' : 'div'
                  return (
                    <Tag key={e.id} onClick={e.onClick} title={`${e.title} · ${e.sub}${e.extra ? ' · ' + e.extra : ''}`}
                      className={`ev ev-${e.kind} ${e.onClick ? 'cursor-pointer' : ''}`}
                      style={{ top: a.top + 3, height: b.top + b.h - a.top - 6, left: `calc(${(col / cols) * 100}% + 3px)`, width: `calc(${100 / cols}% - 6px)` }}>
                      <p className="ev-t">{e.title}</p>
                      <p className="ev-s">{e.sub}{e.lab ? ' · Lab' : ''}</p>
                      {e.extra && (tall || cols === 1) && <p className="ev-x">{e.extra}</p>}
                    </Tag>
                  )
                })}
              </div>

              {nowY !== null && (
                <div className="absolute inset-x-0 pointer-events-none z-10" style={{ top: nowY }}>
                  <span className="absolute left-0 -top-[10px] px-1.5 h-5 grid place-items-center rounded-md bg-[color:var(--c-600)] text-[10.5px] font-700 tabular-nums text-white shadow-sm">{hhmm(now)}</span>
                  <span className="absolute -top-[5px] w-2.5 h-2.5 rounded-full bg-[color:var(--c-600)] ring-2 ring-white" style={{ left: `calc(${GUTTER} - 5px)` }} />
                  <div className="absolute right-0 border-t-2 border-[color:var(--c-600)]" style={{ left: GUTTER }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
