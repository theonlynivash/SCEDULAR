import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, FlaskConical, Plus, Trash2 } from 'lucide-react'
import { api, type Lab, type Section, type SetupSubject } from '../api'
import { PillTabs } from './ui'

type Mapping = { labId: string; subjectId: string; sectionId: string | null }

/**
 * Lab rooms: the rooms themselves (add / remove) and, for every subject that has lab periods, which room(s) can host
 * it. A room set on a subject applies to all its sections; "per section" fixes a different room for one section.
 * The timetable can only place a lab block when its subject has a room.
 */
export default function SetupLabsTab({ say }: { say: (ok: boolean, text: string) => void }) {
  const [labs, setLabs] = useState<Lab[]>([])
  const [subjects, setSubjects] = useState<SetupSubject[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [maps, setMaps] = useState<Mapping[]>([])
  const [semester, setSemester] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCap, setNewCap] = useState('')

  const load = useCallback(async () => {
    try {
      const [l, s, sec, m] = await Promise.all([api.labs.list(), api.setup.listSubjects(), api.sections.list(), api.labs.subjectMappings()])
      setLabs(l); setSubjects(s); setSections(sec); setMaps(m); setLoaded(true)
    } catch (e: any) { say(false, e?.message || 'Could not load lab rooms.') }
  }, [say])
  useEffect(() => { load() }, [load])

  // only what will really be scheduled: a subject counts once it is offered to a running section, so semesters outside the
  // current cycle (or ones this department has no sections for) never show up here as "missing"
  const activeSections = useMemo(() => sections.filter(x => x.active !== false).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [sections])
  const sectionsOf = useCallback((s: SetupSubject) => activeSections.filter(x => x.semester === s.semester && s.sectionIds.includes(x.id)), [activeSections])
  const labSubjects = useMemo(() => subjects.filter(s => s.labPeriods > 0 && s.semester && sectionsOf(s).length > 0), [subjects, sectionsOf])
  const ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
  const semesters = useMemo(() => [...new Set(labSubjects.map(s => s.semester!))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)), [labSubjects]) // eslint-disable-line react-hooks/exhaustive-deps
  // a subject is only complete when EVERY section has a room: either one set for all sections, or one fixed for that section
  const missingFor = (s: SetupSubject) => {
    const mine = maps.filter(m => m.subjectId === s.id)
    if (mine.some(m => !m.sectionId)) return []
    return sectionsOf(s).filter(sec => !mine.some(m => m.sectionId === sec.id)).map(x => x.id)
  }
  const noRoom = labSubjects.filter(s => missingFor(s).length > 0)
  useEffect(() => { if (!semester || !semesters.includes(semester)) setSemester(semesters.find(sm => labSubjects.some(s => s.semester === sm && missingFor(s).length > 0)) ?? semesters[0] ?? '') }, [semesters]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = labSubjects.filter(s => s.semester === semester).sort((a, b) => a.code.localeCompare(b.code))

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    try { await fn(); await load(); if (ok) say(true, ok) } catch (e: any) { say(false, e?.message || 'Could not save.') } finally { setBusy(false) }
  }
  const toggleAll = (subjectId: string, labId: string, on: boolean) => act(() => (on ? api.labs.unmapSubject(labId, subjectId, null) : api.labs.mapSubject(labId, subjectId, null)))
  const setSectionRoom = (subjectId: string, sectionId: string, labId: string) => act(async () => {
    for (const m of maps.filter(x => x.subjectId === subjectId && x.sectionId === sectionId)) await api.labs.unmapSubject(m.labId, subjectId, sectionId)
    if (labId) await api.labs.mapSubject(labId, subjectId, sectionId)
  })
  // give each section that has no room one of the rooms this subject already uses (the least used first); with none yet, any room
  const fillMissing = (s: SetupSubject) => act(async () => {
    const missing = missingFor(s)
    const mine = maps.filter(m => m.subjectId === s.id && m.sectionId)
    const pool = [...new Set(mine.map(m => m.labId))]
    const rooms = pool.length ? pool : labs.map(l => l.id)
    if (rooms.length === 0) throw new Error('Add a lab room first.')
    const used = new Map(rooms.map(r => [r, mine.filter(m => m.labId === r).length]))
    for (const sec of missing) {
      const best = [...used.entries()].sort((a, b) => a[1] - b[1])[0][0]
      await api.labs.mapSubject(best, s.id, sec)
      used.set(best, (used.get(best) ?? 0) + 1)
    }
  }, 'Missing sections now have a room. Change any of them under "A different room for a section".')
  const addRoom = () => {
    const name = newName.trim(); if (!name) return
    const id = `LAB-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`.slice(0, 40)
    if (labs.some(l => l.id === id || l.name.toLowerCase() === name.toLowerCase())) { say(false, 'A room with that name already exists.'); return }
    act(() => api.labs.create({ id, name, capacity: newCap ? Number(newCap) : null }), `Room "${name}" added.`).then(() => { setNewName(''); setNewCap('') })
  }
  const removeRoom = (l: Lab) => {
    const used = new Set(maps.filter(m => m.labId === l.id).map(m => m.subjectId)).size
    if (window.confirm(`Remove ${l.name}?${used ? `\n\nIt is set as the room of ${used} subject${used === 1 ? '' : 's'}; those subjects lose it.` : ''}`)) act(() => api.labs.remove(l.id), 'Room removed.')
  }

  return (
    <div className="space-y-4">
      {/* rooms */}
      <div className="bg-white/80 border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <FlaskConical className="w-4 h-4 text-[color:var(--c-600)]" />
          <h3 className="text-sm font-700 text-slate-800">Lab rooms · {labs.length}</h3>
          <div className="ml-auto flex items-center gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New room, e.g. AI Lab 2" className="border border-slate-200 rounded-full px-3 py-1.5 text-xs w-48" />
            <input value={newCap} onChange={e => setNewCap(e.target.value.replace(/\D/g, ''))} placeholder="Capacity" className="border border-slate-200 rounded-full px-3 py-1.5 text-xs w-24" />
            <button disabled={busy || !newName.trim()} onClick={addRoom} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[color:var(--c-600)] text-white text-xs font-700 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Add room</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {labs.map(l => (
            <span key={l.id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-600 text-slate-700">
              {l.name}{l.capacity ? <span className="text-slate-400 font-500">· {l.capacity}</span> : null}
              <button title={`Remove ${l.name}`} onClick={() => removeRoom(l)} className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600"><Trash2 className="w-3 h-3" /></button>
            </span>
          ))}
          {labs.length === 0 && <p className="text-xs text-slate-400">No rooms yet. Add the first one above.</p>}
        </div>
      </div>

      {/* subjects */}
      {noRoom.length > 0 && <p className="text-xs font-600 text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">{noRoom.length} subject{noRoom.length === 1 ? '' : 's'} with lab periods {noRoom.length === 1 ? 'has' : 'have'} no room for some or all sections. The timetable cannot be generated until every section has one.</p>}
      {!loaded ? null : semesters.length === 0 ? <p className="text-sm text-slate-500 text-center py-8">No running section has a subject with lab periods.</p> : (
        <>
          <PillTabs value={semester} onChange={setSemester} tabs={semesters.map(sm => ({ id: sm, label: `Sem ${sm}${labSubjects.some(s => s.semester === sm && missingFor(s).length > 0) ? ' !' : ''}` }))} />
          <div className="bg-white/80 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
            {rows.map(s => {
              const mine = maps.filter(m => m.subjectId === s.id)
              const all = new Set(mine.filter(m => !m.sectionId).map(m => m.labId))
              const per = mine.filter(m => m.sectionId)
              const semSections = sectionsOf(s)
              const isOpen = open === s.id
              return (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 w-72">
                      <p className="text-xs font-600 text-slate-800"><span className="font-mono text-[11px] text-[color:var(--c-600)] font-700 mr-1.5">{s.code}</span>{s.name}</p>
                      <p className="text-[10.5px] text-slate-400">{s.theoryPeriods ? `${s.theoryPeriods}T + ` : ''}{s.labPeriods}L per section</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-[260px]">
                      {labs.map(l => {
                        const on = all.has(l.id)
                        return <button key={l.id} disabled={busy} onClick={() => toggleAll(s.id, l.id, on)} className={`px-2.5 py-1 rounded-md text-[11px] font-600 border transition ${on ? 'bg-[color:var(--c-600)] text-white border-[color:var(--c-600)]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>{l.name}</button>
                      })}
                    </div>
                    <div className="w-40 text-right">
                      {mine.length === 0 ? <span className="text-[11px] font-700 text-amber-700">No room set</span> : missingFor(s).length > 0 ? <span className="text-[11px] font-700 text-amber-700">{missingFor(s).length} section{missingFor(s).length === 1 ? '' : 's'} without a room</span> : <span className="text-[11px] font-600 text-emerald-700">{all.size ? `${all.size} room${all.size === 1 ? '' : 's'}` : ''}{per.length ? `${all.size ? ' · ' : ''}${per.length} per section` : ''}</span>}
                    </div>
                  </div>
                  {missingFor(s).length > 0 && (
                    <p className="mt-1.5 text-[11.5px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2 flex-wrap">
                      No room for section{missingFor(s).length === 1 ? '' : 's'} {missingFor(s).map(x => x.replace(/^Y\d(S\d)?-/, '')).join(', ')}.
                      <button disabled={busy} onClick={() => fillMissing(s)} className="ml-auto px-2.5 py-1 rounded-full bg-[color:var(--c-600)] text-white text-[11px] font-700 disabled:opacity-40">Fill with a room automatically</button>
                    </p>
                  )}
                  {semSections.length > 0 && (
                    <button onClick={() => setOpen(isOpen ? null : s.id)} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-700 text-[color:var(--c-700)] hover:underline"><ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} /> A different room for a section</button>
                  )}
                  {isOpen && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {semSections.map(sec => {
                        const cur = per.find(m => m.sectionId === sec.id)?.labId ?? ''
                        return (
                          <label key={sec.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                            <span className="w-10 font-700 text-slate-700">{sec.id.replace(/^Y\d(S\d)?-/, '')}</span>
                            <select disabled={busy} value={cur} onChange={e => setSectionRoom(s.id, sec.id, e.target.value)} className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-[11px] bg-white">
                              <option value="">Same as above</option>
                              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
