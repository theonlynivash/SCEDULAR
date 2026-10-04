import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Page } from '../types'
import { api } from '../api'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'

/* ──────────────────────────── content ──────────────────────────── */

const ACCENTS = ['#2f7f74', '#8c6a1f', '#9a4a2f', '#5a6f3c', '#1f5851', '#7a4a62', '#b0623a', '#456a8a']
const STEPS = [
  { label: 'Set up', phrase: 'The HOD builds sections, syllabus and teachers.' },
  { label: 'Log in', phrase: 'Every teacher gets a personal login.' },
  { label: 'Choose', phrase: 'Teachers pick subjects that match their experience.' },
  { label: 'Assign', phrase: 'The HOD approves and fills each section from templates.' },
  { label: 'Solve', phrase: 'The solver places every period without a clash.' },
  { label: 'Verify', phrase: 'A second checker replays every rule on the result.' },
  { label: 'Print', phrase: 'Class timetables export as PDFs, section by section.' },
  { label: 'Review', phrase: 'Reports track workload, needs and teacher results.' },
]

const RULES = [
  { t: 'One place at a time', d: 'A teacher is never in two classes in the same period.' },
  { t: 'One class per lab', d: 'A lab room serves a single section at once.' },
  { t: 'One subject per slot', d: 'A section never has two classes in a period.' },
  { t: 'Labs stay whole', d: 'Lab blocks run in consecutive periods.' },
  { t: 'No daily flooding', d: 'A subject is capped per day for each section.' },
  { t: 'Leave is respected', d: 'Marked unavailability is never scheduled over.' },
]

const ROLES = {
  HOD: ['Builds sections, syllabus and teachers', 'Approves what teachers choose', 'Assigns teachers using workload templates', 'Generates, prints and mails'],
  Teacher: ['Signs in with a personal ID', 'Picks preferred subjects', 'Records past pass percentages', 'Sees a personal timetable'],
} as const

/* ──────────────────────────── helpers ──────────────────────────── */

function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`ab-reveal ${seen ? 'ab-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (t: number) => { const p = Math.min(1, (t - t0) / 1100); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick) }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [to])
  return <span ref={ref}>{n}</span>
}

/* ──────────────────────── pinned horizontal workflow ──────────────────────── */

function Workflow() {
  const wrap = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0)            // 0..1 progress through the pinned section
  const [viewH, setViewH] = useState(520)
  const parentRef = useRef<HTMLElement | null>(null)
  const N = STEPS.length

  const measure = useCallback(() => {
    const el = wrap.current, parent = parentRef.current
    if (!el || !parent) return
    const total = el.offsetHeight - parent.clientHeight
    const scrolled = parent.getBoundingClientRect().top - el.getBoundingClientRect().top
    setP(Math.max(0, Math.min(1, total > 0 ? scrolled / total : 0)))
  }, [])

  useLayoutEffect(() => {
    const parent = scrollParentOf(wrap.current)
    parentRef.current = parent
    if (!parent) return
    const resize = () => { setViewH(Math.max(380, parent.clientHeight)); measure() }
    resize()
    parent.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', resize)
    return () => { parent.removeEventListener('scroll', measure); window.removeEventListener('resize', resize) }
  }, [measure])

  const pos = p * (N - 1)
  const active = Math.round(pos)

  const jump = (i: number) => {
    const el = wrap.current, parent = parentRef.current
    if (!el || !parent) return
    const total = el.offsetHeight - parent.clientHeight
    const top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop + (i / (N - 1)) * total
    parent.scrollTo({ top: Math.round(top) + (i === 0 ? 1 : 0), behavior: 'smooth' })
  }

  // arrow keys step through while the section is on screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (p <= 0 || p >= 1) return
      if (e.key === 'ArrowRight') { e.preventDefault(); jump(Math.min(N - 1, active + 1)) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); jump(Math.max(0, active - 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const filled = Math.round(p * 40)
  const accent = ACCENTS[Math.min(N - 1, active)]

  return (
    <section ref={wrap} style={{ height: `${viewH * (N + 1.4)}px` }} className="relative">
      <div className="sticky top-0 overflow-hidden" style={{ height: viewH, ['--accent' as any]: accent }}>
        <div className="absolute inset-0 transition-[background] duration-700" style={{ background: `radial-gradient(55% 65% at 72% 62%, color-mix(in srgb, ${accent} 20%, transparent), transparent 70%), radial-gradient(40% 50% at 8% 20%, color-mix(in srgb, ${accent} 10%, transparent), transparent 70%)` }} aria-hidden />
        {/* timetable that fills in as you move through the steps */}
        <div className="absolute right-[4%] bottom-[12%] hidden md:grid gap-1.5 opacity-90" style={{ gridTemplateColumns: 'repeat(8, 2.6rem)', gridTemplateRows: 'repeat(5, 1.9rem)' }} aria-hidden>
          {Array.from({ length: 40 }, (_, i) => {
            const col = i % 8, row = Math.floor(i / 8)
            const order = col * 5 + row
            return <span key={i} className="rounded-md border transition-all duration-500" style={{ borderColor: order < filled ? `color-mix(in srgb, ${accent} 40%, transparent)` : 'rgba(23,64,61,.14)', background: order < filled ? `color-mix(in srgb, ${accent} 28%, transparent)` : 'rgba(255,255,255,.35)', transform: order < filled ? 'none' : 'scale(.94)' }} />
          })}
        </div>

        <div className="absolute left-0 top-6 right-0 px-6 md:px-10 flex items-baseline gap-3">
          <span className="text-[11px] font-600 uppercase tracking-[0.2em] text-slate-500">How it works</span>
          <span className="ml-auto text-[11px] text-slate-400 hidden sm:inline">Scroll, or use ← →</span>
        </div>

        {/* horizontally sliding track */}
        <div className="absolute inset-0 flex items-center" style={{ width: `${N * 100}%`, transform: `translate3d(${-(pos * 100) / N}%,0,0)`, transition: 'transform .35s cubic-bezier(.2,.7,.2,1)', willChange: 'transform' }}>
          {STEPS.map((s, i) => {
            const d = Math.abs(i - pos)
            return (
              <div key={s.label} className="px-6 md:px-16" style={{ width: `${100 / N}%`, opacity: Math.max(0.12, 1 - d * 0.75), transform: `translateY(${Math.min(d, 1) * 10}px)`, transition: 'opacity .35s, transform .35s' }}>
                <div className="max-w-2xl">
                  <p className="font-display text-[5.5rem] md:text-[8rem] leading-none font-300 select-none" style={{ color: `color-mix(in srgb, ${ACCENTS[i]} 22%, transparent)` }}>{String(i + 1).padStart(2, '0')}</p>
                  <p className="mt-1 text-[11px] font-700 uppercase tracking-[0.22em]" style={{ color: ACCENTS[i] }}>{s.label}</p>
                  <p className="mt-2 font-editorial text-[1.9rem] md:text-[2.7rem] leading-[1.15] tracking-tight text-slate-900">{s.phrase}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* progress rail */}
        <div className="absolute left-0 right-0 bottom-6 pl-6 md:pl-10 pr-6 md:pr-44">
          <div className="flex items-center gap-1.5">
            <button onClick={() => jump(Math.max(0, active - 1))} disabled={active === 0} aria-label="Previous step" className="p-1.5 rounded-full text-slate-500 hover:bg-slate-900/5 disabled:opacity-30"><ArrowLeft size={15} /></button>
            <div className="flex-1 flex items-center">
              {STEPS.map((s, i) => (
                <button key={s.label} onClick={() => jump(i)} className="group flex-1 flex flex-col items-start gap-1.5 text-left" aria-label={`Go to ${s.label}`}>
                  <span className="relative block h-[3px] w-full rounded-full bg-slate-900/10 overflow-hidden">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ background: ACCENTS[i], width: `${Math.max(0, Math.min(1, pos - i + 1)) * 100}%`, transition: 'width .35s' }} />
                  </span>
                  <span className={`text-[10.5px] tracking-wide transition-colors ${i === active ? 'text-slate-900 font-700' : 'text-slate-400 group-hover:text-slate-600'} hidden sm:block pr-2`}>{s.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => jump(Math.min(N - 1, active + 1))} disabled={active === N - 1} aria-label="Next step" className="p-1.5 rounded-full text-slate-500 hover:bg-slate-900/5 disabled:opacity-30"><ArrowRight size={15} /></button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ──────────────────────── horizontal rule cards ──────────────────────── */

function Rules() {
  const row = useRef<HTMLDivElement>(null)
  const by = (dir: number) => row.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })
  return (
    <section className="py-16">
      <Reveal>
        <div className="flex items-end gap-3 mb-5 px-1">
          <div>
            <p className="text-[11px] font-600 uppercase tracking-[0.2em] text-slate-500">Guarantees</p>
            <h2 className="font-editorial text-3xl md:text-4xl tracking-tight text-slate-900 mt-1">Rules it never breaks</h2>
          </div>
          <div className="ml-auto flex gap-1.5">
            <button onClick={() => by(-1)} aria-label="Scroll left" className="p-2 rounded-full border border-slate-300/70 text-slate-600 hover:bg-white/70"><ArrowLeft size={14} /></button>
            <button onClick={() => by(1)} aria-label="Scroll right" className="p-2 rounded-full border border-slate-300/70 text-slate-600 hover:bg-white/70"><ArrowRight size={14} /></button>
          </div>
        </div>
      </Reveal>
      <div ref={row} className="ab-hscroll flex gap-3.5 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory">
        {RULES.map((r, i) => (
          <article key={r.t} className="snap-start shrink-0 w-[250px] rounded-2xl border border-slate-300/60 bg-white/55 p-5 transition-all duration-300 hover:-translate-y-1 hover:bg-white/85 hover:shadow-[0_10px_30px_-14px_rgba(23,64,61,.35)]">
            <span className="block h-1 w-9 rounded-full" style={{ background: ACCENTS[i % ACCENTS.length] }} />
            <p className="mt-4 text-[11px] font-700 tracking-widest" style={{ color: ACCENTS[i % ACCENTS.length] }}>{String(i + 1).padStart(2, '0')}</p>
            <h3 className="mt-3 font-display font-700 text-[1.05rem] text-slate-900">{r.t}</h3>
            <p className="mt-1.5 text-[13px] leading-snug text-slate-500">{r.d}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ──────────────────────── who does what ──────────────────────── */

function Roles() {
  const [who, setWho] = useState<keyof typeof ROLES>('HOD')
  return (
    <section className="py-16">
      <Reveal>
        <p className="text-[11px] font-600 uppercase tracking-[0.2em] text-slate-500">Roles</p>
        <h2 className="font-editorial text-3xl md:text-4xl tracking-tight text-slate-900 mt-1">Who does what</h2>
        <div className="inline-flex mt-5 p-1 rounded-full bg-slate-900/[0.06]">
          {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map(k => (
            <button key={k} onClick={() => setWho(k)} className={`px-5 py-1.5 rounded-full text-[13px] font-600 transition-all ${who === k ? 'bg-white text-[#17403d] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{k}</button>
          ))}
        </div>
      </Reveal>
      <ul key={who} className="mt-6 grid sm:grid-cols-2 gap-3">
        {ROLES[who].map((line, i) => (
          <li key={line} className="ab-pop rounded-2xl border border-slate-300/60 bg-white/55 px-5 py-4 flex items-start gap-3" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="mt-0.5 text-[11px] font-700 tracking-widest" style={{ color: ACCENTS[(i + (who === 'HOD' ? 0 : 3)) % ACCENTS.length] }}>{String(i + 1).padStart(2, '0')}</span>
            <span className="text-[14px] text-slate-800">{line}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ──────────────────────── scroll-driven text band ──────────────────────── */

function Band({ words, reverse = false }: { words: string[]; reverse?: boolean }) {
  const line = [...words, ...words, ...words].join('   ·   ')
  return (
    <div className="overflow-hidden py-6 select-none" aria-hidden>
      <div className="whitespace-nowrap font-editorial text-[3.6rem] md:text-[5.5rem] leading-none tracking-tight" style={{ transform: reverse ? 'translateX(calc(var(--sy,0) * 0.28px - 1500px))' : 'translateX(calc(var(--sy,0) * -0.28px))', color: 'transparent', WebkitTextStroke: '1px rgba(23,64,61,.28)' }}>
        {line}   ·   {line}
      </div>
    </div>
  )
}

/* ──────────────────────── legacy & developers ──────────────────────── */

const PEOPLE = [
  { name: 'Srinivash Karthikeyan', role: 'Lead System Architect & Developer', sub: 'B.Tech AI & DS (2nd Year)', email: 'theonlynivash@gmail.com', initials: 'SK', badge: 'Lead Developer', color: '#3a8a80' },
  { name: 'Prof. Suganya Devi J', role: 'Faculty Advisor & Academic Domain Expert', sub: 'M.Tech, Panimalar Engineering College', email: 'suganyadevipec@gmail.com', initials: 'SD', badge: 'Faculty Collaborator', color: '#8c6a1f' },
]

function Legacy() {
  return (
    <section className="py-20">
      <Reveal>
        <p className="text-[11px] font-600 uppercase tracking-[0.2em] text-slate-500">Legacy</p>
        <h2 className="font-editorial text-3xl md:text-5xl tracking-tight text-slate-900 mt-1">Built for Panimalar,<br />by KERNUL TECH</h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">Engineered for the Department of Artificial Intelligence &amp; Data Science, Panimalar Engineering College, Chennai, so that every coming semester starts from a working timetable instead of a blank sheet.</p>
      </Reveal>
      <div className="mt-9 grid md:grid-cols-2 gap-4">
        {PEOPLE.map((m, i) => (
          <Reveal key={m.name} delay={i * 120}>
            <article className="group relative overflow-hidden rounded-3xl border border-slate-300/60 bg-white/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:bg-white/90 hover:shadow-[0_18px_40px_-20px_rgba(23,64,61,.4)]">
              <span className="absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-[.12] transition-transform duration-500 group-hover:scale-125" style={{ background: m.color }} />
              <div className="relative flex items-start gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[15px] font-700 text-white" style={{ background: m.color }}>{m.initials}</span>
                <div className="min-w-0">
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-700 uppercase tracking-wider" style={{ background: `color-mix(in srgb, ${m.color} 14%, transparent)`, color: m.color }}>{m.badge}</span>
                  <h3 className="mt-2 font-display text-[1.15rem] font-700 text-slate-900">{m.name}</h3>
                  <p className="text-[13px] text-slate-600">{m.role}</p>
                  <p className="text-[12px] text-slate-400">{m.sub}</p>
                  <a href={`mailto:${m.email}`} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-600 hover:underline" style={{ color: m.color }}>{m.email}<ArrowUpRight size={13} /></a>
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ──────────────────────────── page ──────────────────────────── */

export default function About({ navigate }: { navigate: (p: Page) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [bgH, setBgH] = useState(700)
  // publish the scroll position as CSS variables so the backdrop, bands and progress bar move with it without re-rendering
  useLayoutEffect(() => {
    const el = root.current
    const parent = scrollParentOf(el)
    if (!el || !parent) return
    const upd = () => {
      el.style.setProperty('--sy', String(parent.scrollTop))
      el.style.setProperty('--sp', String(parent.scrollTop / Math.max(1, parent.scrollHeight - parent.clientHeight)))
      setBgH(parent.clientHeight)
    }
    upd()
    parent.addEventListener('scroll', upd, { passive: true })
    window.addEventListener('resize', upd)
    return () => { parent.removeEventListener('scroll', upd); window.removeEventListener('resize', upd) }
  }, [])
  const [stats, setStats] = useState<{ label: string; n: number }[] | null>(null)
  useEffect(() => {
    api.setup.overview().then(o => setStats([
      { label: 'Teachers', n: o.teachers.total },
      { label: 'Sections', n: o.semesters.reduce((a, s) => a + s.sections, 0) },
      { label: 'Subjects', n: o.semesters.reduce((a, s) => a + s.subjects, 0) },
      { label: 'Labs', n: o.labs },
    ])).catch(() => setStats(null))
  }, [])

  return (
    <div ref={root} className="relative -m-5 px-5 md:px-10 pt-5 min-h-full">
      <style>{CSS}</style>
      <div className="sticky top-0 z-30 -mx-5 md:-mx-10 h-[3px] -mt-5 mb-[2px]"><div className="h-full origin-left" style={{ transform: 'scaleX(var(--sp,0))', background: 'linear-gradient(90deg,#3a8a80,#0f766e,#8c6a1f,#c2410c,#9a4a62)' }} /></div>
      {/* backdrop: stays in view while scrolling; coloured shapes drift and shift at different speeds */}
      <div className="sticky top-0 h-0 z-0 pointer-events-none" aria-hidden>
        <div className="ab-bg" style={{ height: bgH }}>
          <div className="ab-grid" />
          {[
            ['6%', '12%', 190, 0, '#3a8a80', 0.10, 0.06],
            ['70%', '8%', 240, -6, '#0f766e', 0.09, 0.11],
            ['52%', '56%', 160, -11, '#8c6a1f', 0.10, 0.04],
            ['12%', '68%', 220, -3, '#7a5c80', 0.08, 0.09],
            ['84%', '74%', 170, -8, '#c2410c', 0.07, 0.05],
          ].map(([l, t, w, delay, c, op, sp], i) => (
            <span key={i} className="ab-blob" style={{ left: l as string, top: t as string, width: w as number, height: w as number, background: c as string, opacity: op as number, animationDelay: `${delay}s`, animationDuration: `${26 + i * 6}s`, translate: `0 calc(var(--sy,0) * -${sp}px)` }} />
          ))}
          {[['10%', '30%', 150], ['66%', '24%', 210], ['40%', '80%', 120], ['88%', '52%', 130]].map(([l, t, w], i) => (
            <span key={i} className="ab-block" style={{ left: l as string, top: t as string, width: w as number, animationDelay: `${-4 - i * 5}s`, animationDuration: `${24 + i * 5}s`, translate: `0 calc(var(--sy,0) * -${0.03 + i * 0.03}px)` }} />
          ))}
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* hero */}
        <header className="min-h-[68vh] flex flex-col justify-center py-16">
          <Reveal>
            <p className="text-[11px] font-600 uppercase tracking-[0.24em] text-slate-500">Panimalar Engineering College · AI &amp; Data Science</p>
            <h1 className="mt-4 font-editorial text-[3.2rem] md:text-[5.2rem] leading-[1.02] tracking-tight text-[#17403d]">SCEDULAR</h1>
            <p className="mt-5 max-w-xl text-[1.15rem] md:text-[1.3rem] leading-snug text-slate-700">One department. Every teacher, subject and lab, scheduled without a clash.</p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-9 flex items-center gap-4">
              <button onClick={() => navigate('dashboard')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#17403d] text-white text-[13px] font-600 hover:bg-[#0f2f2d] transition">Open dashboard <ArrowUpRight size={15} /></button>
              <span className="text-[12px] text-slate-400">Scroll to see how it works ↓</span>
            </div>
          </Reveal>
          {stats && (
            <Reveal delay={200}>
              <dl className="mt-14 flex flex-wrap gap-x-12 gap-y-5">
                {stats.map(s => (
                  <div key={s.label}>
                    <dt className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{s.label}</dt>
                    <dd className="font-display text-[2.2rem] font-300 text-slate-900 leading-tight"><CountUp to={s.n} /></dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          )}
        </header>
      </div>

      <div className="relative -mx-5 md:-mx-10"><Band words={['Timetables', 'Workload', 'Labs', 'Results']} /></div>

      {/* pinned horizontal story */}
      <div className="relative -mx-5 md:-mx-10"><Workflow /></div>

      <div className="relative max-w-5xl mx-auto pb-24">
        <Rules />
        <div className="relative -mx-5 md:-mx-24"><Band words={['No clashes', 'Verified', 'Printable', 'Fair']} reverse /></div>
        <Roles />
        <Legacy />
        <Reveal>
          <footer className="mt-10 pt-6 border-t border-slate-300/60 flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
            <span>SCEDULAR · AI &amp; DS Timetable Suite</span>
            <button onClick={() => navigate('dashboard')} className="ml-auto text-[#17403d] font-600 hover:underline">Back to dashboard</button>
          </footer>
        </Reveal>
      </div>
    </div>
  )
}

const CSS = `
.ab-reveal{opacity:0;transform:translateY(18px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.ab-reveal.ab-in{opacity:1;transform:none}
.ab-pop{animation:ab-pop .5s cubic-bezier(.2,.7,.2,1) both}
@keyframes ab-pop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.ab-hscroll{scrollbar-width:none}.ab-hscroll::-webkit-scrollbar{display:none}
.ab-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.ab-grid{position:absolute;inset:-80px;background-image:linear-gradient(rgba(23,64,61,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(23,64,61,.07) 1px,transparent 1px);background-size:88px 64px;animation:ab-drift 60s linear infinite;mask-image:radial-gradient(ellipse at 50% 30%,#000 25%,transparent 75%);-webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 25%,transparent 75%)}
@keyframes ab-drift{to{transform:translate(88px,64px)}}
.ab-blob{position:absolute;border-radius:46% 54% 58% 42% / 48% 44% 56% 52%;filter:blur(38px);animation:ab-morph ease-in-out infinite alternate}
@keyframes ab-morph{0%{transform:translate(0,0) rotate(0) scale(1)}50%{transform:translate(40px,-30px) rotate(40deg) scale(1.12)}100%{transform:translate(-30px,34px) rotate(-30deg) scale(.94)}}
.ab-block{position:absolute;height:44px;border-radius:12px;background:rgba(23,64,61,.06);border:1px solid rgba(23,64,61,.09);animation:ab-float ease-in-out infinite alternate}
@keyframes ab-float{from{transform:translate(0,0)}to{transform:translate(36px,-28px)}}
@media (prefers-reduced-motion:reduce){.ab-grid,.ab-block,.ab-blob,.ab-pop{animation:none}.ab-reveal{opacity:1;transform:none;transition:none}}
`
