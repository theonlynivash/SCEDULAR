import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, X, FileSpreadsheet } from 'lucide-react'
import ImportWizard from './ImportWizard'
import { PillTabs } from './ui'
import { api, type Faculty, type Lab, type Section, type SetupSubject, type SetupSubjectInput } from '../api'

const CATEGORIES: [string, string][] = [
  ['CORE', 'Core'], ['BASIC_SCIENCE', 'Basic science'], ['ENGINEERING_SCIENCE', 'Engineering science'], ['HUMANITIES', 'Humanities'],
  ['PROFESSIONAL_ELECTIVE', 'Professional elective'], ['OPEN_ELECTIVE', 'Open elective'], ['MANDATORY', 'Mandatory'], ['ADDITIONAL', 'Additional'], ['LAB_ONLY', 'Lab only'], ['PROJECT', 'Project'],
]
const TYPE_LABEL = { THEORY: 'Theory', INTEGRATED: 'Theory + Lab', LAB: 'Lab', PROJECT: 'Project' } as const

type Draft = SetupSubjectInput & { id?: string }
const blank = (semester: string): Draft => ({ code: '', name: '', semester, deliveryType: 'THEORY', theoryPeriods: 4, labPeriods: 0, credits: 3, category: 'CORE', sectionIds: undefined, labIds: [], shortName: '', ltp: null, printAs: null })

const inputCls = 'w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#1f6a63] bg-white'
const labelCls = 'block text-[10px] font-700 uppercase tracking-wider text-slate-500 mb-1'

/** The syllabus for each running semester, plus the class sections that take it. */
export default function SetupSyllabusTab({ say, mode = 'syllabus', onOpenLabs }: { say: (ok: boolean, text: string) => void; mode?: 'sections' | 'syllabus'; onOpenLabs?: () => void }) {
  const [pairs, setPairs] = useState<Awaited<ReturnType<typeof api.setup.mergeCandidates>>>([])
  const [importing, setImporting] = useState<'sections' | 'syllabus' | null>(null)
  const [query, setQuery] = useState('')
  const [semesters, setSemesters] = useState<string[]>([])
  const [semester, setSemester] = useState('')
  const [subjects, setSubjects] = useState<SetupSubject[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [labs, setLabs] = useState<Lab[]>([])
  const [teachers, setTeachers] = useState<Faculty[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [addCount, setAddCount] = useState(1)

  const load = useCallback(async () => {
    try {
      const [ov, subs, secs, lbs, fac] = await Promise.all([api.setup.overview(), api.setup.listSubjects(), api.sections.list(), api.labs.list(), api.faculty.list()])
      const sems = ov.semesters.map(s => s.semester)
      setSemesters(sems)
      setSemester(cur => (cur && sems.includes(cur) ? cur : sems.find(s => ov.semesters.find(x => x.semester === s && x.sections > 0)) ?? sems.find(s => ov.semesters.find(x => x.semester === s && x.subjects > 0)) ?? sems[0] ?? ''))
      setSubjects(subs); setSections(secs); setLabs(lbs); setTeachers(fac)
      api.setup.mergeCandidates().then(setPairs).catch(() => setPairs([]))
    } catch (e: any) { say(false, e?.message || 'Could not load the syllabus.') }
    finally { setLoading(false) }
  }, [say])
  useEffect(() => { load() }, [load])

  const semSections = useMemo(() => sections.filter(s => s.semester === semester).sort((a, b) => a.id.localeCompare(b.id)), [sections, semester])
  const shownSubjects = (list: typeof subjects) => { const t = query.trim().toLowerCase(); return t ? list.filter(x => x.code.toLowerCase().includes(t) || x.name.toLowerCase().includes(t) || (x.shortName ?? '').toLowerCase().includes(t)) : list }
  const semSubjects = useMemo(() => subjects.filter(s => s.semester === semester).sort((a, b) => a.code.localeCompare(b.code)), [subjects, semester])

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try { await fn(); say(true, ok); await load() }
    catch (e: any) { say(false, e?.message || 'Action failed.') }
    finally { setBusy(false) }
  }

  const semPairs = pairs.filter(p => p.semester === semester)
  const mergeOne = async (p: (typeof pairs)[number]) => { await api.setup.mergeLab(p.theoryId, p.labId) }
  const mergeAll = (list: typeof pairs) => {
    if (!window.confirm(`Combine ${list.length} theory + lab pair${list.length === 1 ? '' : 's'} into single subjects?\n\nEach becomes one subject with theory AND lab periods (xT + yL). The teacher of a class takes both. Generated timetables are cleared and must be generated again.`)) return
    act(async () => { for (const p of list) await mergeOne(p) }, `Combined ${list.length} subject${list.length === 1 ? '' : 's'} into theory + lab.`)
  }
  const addSections = () => act(() => api.setup.createSections(semester, addCount), `Added ${addCount} section${addCount === 1 ? '' : 's'}; every subject of Sem ${semester} is offered to them.`)
  const removeSection = (s: Section) => {
    if (window.confirm(`Delete section ${s.name}? Its subject offerings and the teachers assigned to them are removed too.`)) act(() => api.setup.deleteSection(s.id), 'Section deleted.')
  }
  const removeSubject = (s: SetupSubject) => {
    const msg = `Delete ${s.code} · ${s.name}?\n\nThis removes it from ${s.sectionIds.length} section(s), ${s.staffed} teacher assignment(s) and any teacher choices for it.`
    if (window.confirm(msg)) act(() => api.setup.deleteSubject(s.id), 'Subject deleted.')
  }
  const edit = (s: SetupSubject) => setDraft({
    id: s.id, code: s.code, name: s.name, semester: s.semester!, deliveryType: s.deliveryType === 'PROJECT' ? 'THEORY' : s.deliveryType,
    theoryPeriods: s.theoryPeriods, labPeriods: s.labPeriods, credits: s.credits, category: s.category, sectionIds: s.sectionIds, labIds: s.labIds,
    shortName: s.shortName ?? '', ltp: s.ltp, printAs: s.printAs,
  })

  async function save() {
    if (!draft) return
    const { id, ...body } = draft
    const payload: SetupSubjectInput = { ...body, shortName: body.shortName?.trim() || null, code: body.code.trim(), name: body.name.trim(), sectionIds: body.sectionIds ?? semSections.filter(s => s.active !== false).map(s => s.id) }
    setBusy(true)
    try {
      if (id) await api.setup.updateSubject(id, payload); else await api.setup.createSubject(payload)
      say(true, id ? 'Subject updated.' : 'Subject added.')
      setDraft(null)
      await load()
    } catch (e: any) { say(false, e?.message || 'Could not save the subject.') }
    finally { setBusy(false) }
  }

  const setType = (t: 'THEORY' | 'INTEGRATED' | 'LAB') => setDraft(d => d && ({
    ...d, deliveryType: t,
    theoryPeriods: t === 'LAB' ? 0 : d.theoryPeriods || 4,
    labPeriods: t === 'THEORY' ? 0 : d.labPeriods || (t === 'LAB' ? 3 : 2),
  }))
  const toggle = (key: 'sectionIds' | 'labIds', id: string, all: string[]) => setDraft(d => {
    if (!d) return d
    const cur = d[key] ?? all
    return { ...d, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] }
  })

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
  if (!semesters.length) return <p className="text-sm text-slate-500 py-8 text-center">No semester is running in the current cycle.</p>

  const defaultSectionIds = semSections.filter(s => s.active !== false).map(s => s.id)

  return (
    <div className="space-y-4">
      <PillTabs value={semester} onChange={setSemester} tabs={semesters.map(sm => ({ id: sm, label: `Sem ${sm}` }))} />

      {mode === 'sections' && (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-700 text-slate-800">Sections · Sem {semester}</h3>
            <p className="text-[11px] text-slate-500">New classes are added here each semester. Every subject below is offered to a new section automatically.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setImporting('sections')} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#1f6a63]/40 text-[#1f6a63] text-xs font-700 hover:bg-blue-50"><FileSpreadsheet className="w-3.5 h-3.5" /> Import from Excel</button>
            <input type="number" min={1} max={26} value={addCount} onChange={e => setAddCount(Math.max(1, Math.min(26, Number(e.target.value) || 1)))} className={`${inputCls} !w-16 text-center`} />
            <button disabled={busy} onClick={addSections} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1f6a63] text-white text-xs font-700 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Add sections</button>
          </div>
        </div>
        {semSections.length > 0 && (
          <details className="mt-3">
            <summary className="text-[11.5px] font-600 text-[#3a8a80] cursor-pointer select-none">Class in-charge (printed on each timetable)</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {semSections.map(sec => (
                <label key={sec.id} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-8 font-600 text-slate-700">{sec.id.replace(/^Y\d(S\d)?-/, '')}</span>
                  <select value={sec.classIncharge ?? ''} disabled={busy} onChange={e => act(() => api.setup.setClassIncharge(sec.id, e.target.value || null), 'Class in-charge saved.')}
                    className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#1f6a63]">
                    <option value="">—</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {semSections.length === 0 && <p className="text-xs text-slate-400">No sections yet.</p>}
          {semSections.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-md bg-slate-50 border border-slate-200 text-xs font-600 text-slate-700">
              {s.id}
              <button title={`Delete ${s.name}`} onClick={() => removeSection(s)} className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      </div>
      )}

      {mode === 'syllabus' && semPairs.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/70 px-4 py-3">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-800 text-amber-900">{semPairs.length} course{semPairs.length === 1 ? ' is' : 's are'} listed twice: once for theory, once for the lab</p>
              <p className="text-[11px] text-amber-900/80 mt-0.5">A course like AIES is one subject with theory and lab periods (xT + yL), and the teacher of a class handles both. Combine them so one teacher takes theory and lab of the same class.</p>
            </div>
            <button disabled={busy} onClick={() => mergeAll(semPairs)} className="px-4 py-1.5 rounded-full bg-[#1f6a63] text-white text-xs font-700 disabled:opacity-40">Combine all {semPairs.length}</button>
          </div>
          <ul className="mt-2 space-y-1">
            {semPairs.map(p => (
              <li key={p.theoryId} className="flex items-center gap-2 text-[11.5px] bg-white/70 border border-amber-200 rounded-lg px-3 py-1.5">
                <span className="font-600 text-slate-800 truncate">{p.theoryName}</span>
                <span className="text-slate-500 shrink-0">{p.theoryPeriods}T</span><span className="text-slate-400">+</span>
                <span className="text-slate-500 truncate">{p.labName} · {p.labPeriods}L</span>
                <span className="ml-auto shrink-0 text-slate-400">→ one subject <b className="text-slate-700">{p.theoryPeriods}T + {p.labPeriods}L</b></span>
                <button disabled={busy} onClick={() => mergeAll([p])} className="shrink-0 px-2.5 py-1 rounded-md border border-amber-300 text-amber-900 font-700 hover:bg-amber-100 disabled:opacity-40">Combine</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'syllabus' && (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-700 text-slate-800">Syllabus · Sem {semester}</h3>
            <p className="text-[11px] text-slate-500">{semSubjects.length} subject{semSubjects.length === 1 ? '' : 's'} · {semSubjects.reduce((n, x) => n + x.theoryPeriods + x.labPeriods, 0)} periods per section per week. Weekly periods are per section; teachers choose from this list.</p>
          </div>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search code or name…" className="ml-auto border border-slate-200 rounded-full px-3 py-1.5 text-xs w-48 focus:outline-none focus:border-[#1f6a63]" />
          <button onClick={() => setImporting('syllabus')} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#1f6a63]/40 text-[#1f6a63] text-xs font-700 hover:bg-blue-50"><FileSpreadsheet className="w-3.5 h-3.5" /> Import from Excel</button>
          <button disabled={busy || semSections.length === 0} title={semSections.length === 0 ? 'Add sections first' : ''} onClick={() => setDraft(blank(semester))} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1f6a63] text-white text-xs font-700 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Add subject</button>
        </div>
        {semSubjects.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No subjects yet for Sem {semester}.</p>
        ) : (
          <table className="tbl text-xs">
            <thead><tr><th>Code</th><th>Subject</th><th>Type</th><th className="!text-center">Theory</th><th className="!text-center">Lab</th><th className="!text-center">Credits</th><th>Category</th><th>Lab rooms</th><th>Sections</th><th className="!text-center">Staffed</th><th /></tr></thead>
            <tbody>
              {shownSubjects(semSubjects).map(s => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="font-mono text-[11px] text-[#1f6a63] font-700">{s.code}</td>
                  <td className="font-600 text-slate-800">{s.name}{s.shortName && <span className="ml-1.5 text-[10px] font-700 text-slate-400">{s.shortName}</span>}</td>
                  <td className="text-slate-600">{TYPE_LABEL[s.deliveryType]}</td>
                  <td className="text-center">{s.theoryPeriods || '–'}</td>
                  <td className="text-center">{s.labPeriods || '–'}</td>
                  <td className="text-center">{s.credits || '–'}</td>
                  <td className="text-slate-500 text-[11px]">{(CATEGORIES.find(([v]) => v === s.category)?.[1]) ?? s.category}</td>
                  <td className="text-slate-500 text-[11px]">{s.labPeriods > 0 ? ((s.labRooms ?? []).length ? <span title={(s.labRooms ?? []).map(r => `${labs.find(l => l.id === r.labId)?.name ?? r.labId}${r.sectionId ? ` · ${r.sectionId}` : ' · any section'}`).join('\n')}>{[...new Set((s.labRooms ?? []).map(r => labs.find(l => l.id === r.labId)?.name ?? r.labId))].join(', ')}{(s.labRooms ?? []).some(r => r.sectionId) && <span className="text-slate-400"> · per section</span>}</span> : <button onClick={onOpenLabs} className="text-amber-700 font-700 underline decoration-dotted">set rooms →</button>) : '–'}</td>
                  <td className="text-slate-500">{s.sectionIds.length === defaultSectionIds.length ? `All ${s.sectionIds.length}` : s.sectionIds.map(x => x.replace(/^Y\d(S\d)?-/, '')).join(', ') || 'None'}</td>
                  <td className="text-center"><span className={s.staffed >= s.sectionIds.length && s.sectionIds.length > 0 ? 'text-emerald-700 font-700' : 'text-amber-700 font-700'}>{s.staffed}/{s.sectionIds.length}</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button title="Edit" onClick={() => edit(s)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                    <button title="Delete" disabled={busy} onClick={() => removeSubject(s)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* Add / edit modal */}
      {draft && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDraft(null)}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center">
              <h3 className="text-sm font-700 text-slate-800">{draft.id ? 'Edit subject' : 'Add subject'} · Sem {draft.semester}</h3>
              <button onClick={() => setDraft(null)} className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 grid grid-cols-6 gap-3">
              <div className="col-span-2"><label className={labelCls}>Code</label><input className={inputCls} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="23AD1701" /></div>
              <div className="col-span-4"><label className={labelCls}>Name</label><input className={inputCls} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Subject name" /></div>
              <div className="col-span-3">
                <label className={labelCls}>Type</label>
                <select className={inputCls} value={draft.deliveryType} onChange={e => setType(e.target.value as any)}>
                  <option value="THEORY">Theory only</option><option value="INTEGRATED">Theory + Lab (one teacher)</option><option value="LAB">Lab only</option>
                </select>
              </div>
              <div className="col-span-3">
                <label className={labelCls}>Category</label>
                <select className={inputCls} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
                  {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className={labelCls}>Theory periods / week</label><input type="number" min={0} max={12} disabled={draft.deliveryType === 'LAB'} className={inputCls} value={draft.theoryPeriods} onChange={e => setDraft({ ...draft, theoryPeriods: Number(e.target.value) })} /></div>
              <div className="col-span-2"><label className={labelCls}>Lab periods / week</label><input type="number" min={0} max={12} disabled={draft.deliveryType === 'THEORY'} className={inputCls} value={draft.labPeriods} onChange={e => setDraft({ ...draft, labPeriods: Number(e.target.value) })} /></div>
              <div className="col-span-2"><label className={labelCls}>Credits</label><input type="number" min={0} max={10} className={inputCls} value={draft.credits ?? 0} onChange={e => setDraft({ ...draft, credits: Number(e.target.value) })} /></div>

              <div className="col-span-6 grid grid-cols-6 gap-3 rounded-lg bg-slate-50/70 border border-slate-100 p-3">
                <p className="col-span-6 text-[10px] font-700 uppercase tracking-wider text-slate-500">Printed on the class timetable</p>
                <div className="col-span-2"><label className={labelCls}>Short name</label><input className={inputCls} value={draft.shortName ?? ''} onChange={e => setDraft({ ...draft, shortName: e.target.value })} placeholder="e.g. ARVR" maxLength={24} /></div>
                <div className="col-span-2"><label className={labelCls}>L · T · P</label>
                  <div className="flex gap-1">{[0, 1, 2].map(i => (
                    <input key={i} type="number" min={0} max={9} className={`${inputCls} text-center`} value={draft.ltp?.[i] ?? ''} placeholder="–"
                      onChange={e => { const cur: [number, number, number] = draft.ltp ?? [0, 0, 0]; const next = [...cur] as [number, number, number]; next[i] = Math.max(0, Math.min(9, Number(e.target.value) || 0)); setDraft({ ...draft, ltp: next }) }} />
                  ))}</div></div>
                <div className="col-span-2"><label className={labelCls}>Listed under</label>
                  <select className={inputCls} value={draft.printAs ?? ''} onChange={e => setDraft({ ...draft, printAs: (e.target.value || null) as any })}>
                    <option value="">Automatic</option><option value="THEORY">Subject handling theory</option><option value="PRACTICAL">Practicals</option>
                  </select></div>
              </div>

              <div className="col-span-6">
                <label className={labelCls}>Offered to sections</label>
                <div className="flex flex-wrap gap-1.5">
                  {semSections.map(s => {
                    const on = (draft.sectionIds ?? defaultSectionIds).includes(s.id)
                    return <button type="button" key={s.id} onClick={() => toggle('sectionIds', s.id, defaultSectionIds)} className={`px-2.5 py-1 rounded-md text-xs font-600 border ${on ? 'bg-[#1f6a63] text-white border-[#1f6a63]' : 'bg-white text-slate-500 border-slate-200'}`}>{s.id.replace(/^Y\d(S\d)?-/, '')}</button>
                  })}
                </div>
              </div>
              {draft.deliveryType !== 'THEORY' && (
                <div className="col-span-6">
                  <label className={labelCls}>Lab rooms that can host it</label>
                  <div className="flex flex-wrap gap-1.5">
                    {labs.map(l => {
                      const on = (draft.labIds ?? []).includes(l.id)
                      return <button type="button" key={l.id} onClick={() => toggle('labIds', l.id, [])} className={`px-2.5 py-1 rounded-md text-xs font-600 border ${on ? 'bg-[#1f6a63] text-white border-[#1f6a63]' : 'bg-white text-slate-500 border-slate-200'}`}>{l.id}</button>
                    })}
                  </div>
                  {(draft.labIds ?? []).length === 0 && !subjects.find(x => x.id === draft.id)?.labRooms?.length && <p className="text-[11px] text-amber-700 mt-1">Pick at least one room, or the timetable cannot place the lab.</p>}
                  {!!subjects.find(x => x.id === draft.id)?.labRooms?.some(r => r.sectionId) && <p className="text-[11px] text-slate-500 mt-1">Rooms fixed for single sections are kept as they are; the rooms picked above apply to the other sections.</p>}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className="px-4 py-1.5 rounded-lg border border-slate-200 text-xs font-600 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button disabled={busy || !draft.code.trim() || !draft.name.trim()} onClick={save} className="px-4 py-1.5 rounded-lg bg-[#1f6a63] text-white text-xs font-700 disabled:opacity-40">{busy ? 'Saving…' : 'Save subject'}</button>
            </div>
          </div>
        </div>
      )}
      {importing && <ImportWizard kind={importing} onClose={() => setImporting(null)} onDone={() => load()} />}
    </div>
  )
}
