import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { api, type FacultyResultRow, type ResultSummary, type Subject } from '../api'

const SEMS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const input = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:border-[#0F4C81] focus:ring-2 focus:ring-[#0F4C81]/15'
const label = 'block text-[11px] font-600 uppercase tracking-wider text-slate-500 mb-1'

/** The last few academic years, newest first: ["2025-26", "2024-25", …]. */
function academicYears(): string[] {
  const now = new Date(), start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1
  return Array.from({ length: 7 }, (_, i) => `${start - 1 - i}-${String(start - i).slice(2)}`)
}

/**
 * Teacher's record of the classes they took in past semesters: pick the subject, enter the pass percentage
 * their class achieved, and see the average and a semester-wise breakdown.
 */
export default function ProfileResults() {
  const years = useMemo(academicYears, [])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [rows, setRows] = useState<FacultyResultRow[]>([])
  const [summary, setSummary] = useState<ResultSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [year, setYear] = useState(years[0])
  const [sem, setSem] = useState('IV')
  const [subjectId, setSubjectId] = useState('')        // '' = not chosen yet, '__other' = typed name
  const [otherName, setOtherName] = useState('')
  const [pass, setPass] = useState('')
  const [appeared, setAppeared] = useState('')
  const [sections, setSections] = useState('')

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api.results.mine(), api.subjects.list()])
      setRows(r.results); setSummary(r.summary); setSubjects(s)
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not load your results.' }) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const options = useMemo(() => subjects.filter(s => s.semester === sem).sort((a, b) => a.code.localeCompare(b.code)), [subjects, sem])
  useEffect(() => { setSubjectId('') }, [sem])

  const pct = Number(pass)
  const valid = (subjectId && (subjectId !== '__other' || otherName.trim().length >= 2)) && pass !== '' && pct >= 0 && pct <= 100

  async function add() {
    setBusy(true); setMsg(null)
    try {
      await api.results.add({
        academicYear: year, semester: sem,
        ...(subjectId === '__other' ? { subjectName: otherName.trim() } : { subjectId }),
        passPercent: pct,
        studentsAppeared: appeared ? Number(appeared) : null,
        sectionsHandled: sections ? Number(sections) : null,
      })
      setSubjectId(''); setOtherName(''); setPass(''); setAppeared(''); setSections('')
      setMsg({ ok: true, text: 'Result saved.' })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save.' }) }
    finally { setBusy(false) }
  }

  async function remove(r: FacultyResultRow) {
    if (!window.confirm(`Delete your result for ${r.subjectName} (${r.academicYear}, Sem ${r.semester})?`)) return
    try { await api.results.remove(r.id); await load() } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not delete.' }) }
  }

  const avg = summary?.average
  const tone = (p: number) => (p >= 85 ? 'bg-[#2f6fc4]' : p >= 70 ? 'bg-[#2f6fc4]/70' : 'bg-[#f3c326]')

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-1">
        <div>
          <h2 className="font-700 text-lg text-slate-900">Class results</h2>
          <p className="text-xs text-slate-500 mt-0.5">The pass percentage of the classes you took in past semesters.</p>
        </div>
        {avg != null && (
          <div className="text-right">
            <p className="text-[10.5px] uppercase tracking-[0.12em] text-slate-400">Your average pass</p>
            <p className="font-display text-[30px] font-600 text-[#16367a] leading-none">{avg}<span className="text-lg">%</span></p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] mt-5">
        {/* enter a result */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label><span className={label}>Academic year</span>
              <select className={input} value={year} onChange={e => setYear(e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
            <label><span className={label}>Semester</span>
              <select className={input} value={sem} onChange={e => setSem(e.target.value)}>{SEMS.map(s => <option key={s} value={s}>Semester {s}</option>)}</select></label>
          </div>
          <label className="block"><span className={label}>Subject you took</span>
            <select className={input} value={subjectId} onChange={e => setSubjectId(e.target.value)}>
              <option value="">Choose…</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
              <option value="__other">Another subject (type its name)</option>
            </select></label>
          {subjectId === '__other' && <input className={input} placeholder="Subject name" value={otherName} onChange={e => setOtherName(e.target.value)} />}
          <label className="block"><span className={label}>Pass percentage</span>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={100} step={0.5} value={pass === '' ? 0 : pct} onChange={e => setPass(e.target.value)} className="flex-1 accent-[#2f6fc4]" />
              <div className="relative w-24"><input type="number" min={0} max={100} step={0.1} className={`${input} pr-7 text-right`} value={pass} onChange={e => setPass(e.target.value)} placeholder="–" /><span className="absolute right-3 top-2 text-slate-400 text-[13px]">%</span></div>
            </div></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className={label}>Students appeared (optional)</span><input type="number" min={1} max={500} className={input} value={appeared} onChange={e => setAppeared(e.target.value)} /></label>
            <label><span className={label}>Sections (optional)</span><input type="number" min={1} max={26} className={input} value={sections} onChange={e => setSections(e.target.value)} /></label>
          </div>
          <div className="flex items-center gap-3">
            <button disabled={busy || !valid} onClick={add} className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-500 text-white bg-gradient-to-br from-[#16367a] to-[#0a1d45] shadow-[0_4px_14px_rgba(10,29,69,0.25)] disabled:opacity-40"><Plus size={14} /> Save result</button>
            {msg && <span className={`text-[12.5px] ${msg.ok ? 'text-[#16367a]' : 'text-rose-600'}`}>{msg.text}</span>}
          </div>
        </div>

        {/* what you have entered */}
        <div className="min-w-0">
          {loading ? <p className="text-sm text-slate-400">Loading…</p> : rows.length === 0 ? (
            <div className="h-full min-h-[160px] grid place-items-center rounded-2xl bg-[#0e254f]/[0.03] text-center px-6">
              <p className="text-[13px] text-slate-500">No results yet. Add the subjects you took in earlier semesters and the pass percentage your classes achieved.</p>
            </div>
          ) : (
            <>
              {summary && summary.bySemester.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-600 uppercase tracking-wider text-slate-500 mb-2">Pass percentage by semester</p>
                  <div className="space-y-2">
                    {summary.bySemester.map(b => (
                      <div key={b.label} className="text-[12px]">
                        <div className="flex justify-between"><span className="text-slate-600">{b.label}</span><span className="font-600 text-slate-700">{b.average}%</span></div>
                        <div className="h-2 rounded-full bg-[#0e254f]/10 overflow-hidden"><div className={`h-full rounded-full ${tone(b.average)}`} style={{ width: `${b.average}%` }} /></div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11.5px] text-slate-500 mt-2">
                    {summary.count} subject{summary.count === 1 ? '' : 's'} · best {summary.best}% · lowest {summary.lowest}%
                    {summary.weightedAverage != null && <> · weighted by students <b className="text-slate-700">{summary.weightedAverage}%</b></>}
                  </p>
                </div>
              )}
              <div className="rounded-2xl ring-1 ring-slate-200 overflow-hidden">
                {rows.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-800 truncate">{r.subjectCode && <span className="font-mono text-[11px] text-[#2f6fc4] mr-1.5">{r.subjectCode}</span>}{r.subjectName}</p>
                      <p className="text-[11px] text-slate-400">{r.academicYear} · Sem {r.semester}{r.studentsAppeared ? ` · ${r.studentsAppeared} students` : ''}{r.sectionsHandled ? ` · ${r.sectionsHandled} section${r.sectionsHandled === 1 ? '' : 's'}` : ''}</p>
                    </div>
                    <span className="font-600 text-slate-800 w-14 text-right">{r.passPercent}%</span>
                    <button title="Delete" onClick={() => remove(r)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
