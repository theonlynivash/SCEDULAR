import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Faculty, type Section } from '../api'

const YEAR_OF: Record<string, string> = { I: 'Year 1', II: 'Year 1', III: 'Year 2', IV: 'Year 2', V: 'Year 3', VI: 'Year 3', VII: 'Year 4', VIII: 'Year 4' }

/** Class in-charge of every section, for every year, in one place. Printed on each class timetable. */
export default function SetupInchargeTab({ say }: { say: (ok: boolean, text: string) => void }) {
  const [sections, setSections] = useState<Section[]>([])
  const [teachers, setTeachers] = useState<Faculty[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api.sections.list(), api.faculty.list()])
      setSections(s); setTeachers(f)
    } catch (e: any) { say(false, e?.message || 'Could not load sections.') }
    finally { setLoading(false) }
  }, [say])
  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const by = new Map<string, Section[]>()
    for (const s of [...sections].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
      const key = `${YEAR_OF[s.semester ?? ''] ?? s.year ?? 'Other'} · Sem ${s.semester ?? '—'}`
      by.set(key, [...(by.get(key) ?? []), s])
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [sections])

  async function change(sec: Section, facultyId: string) {
    setSaving(sec.id)
    try {
      await api.setup.setClassIncharge(sec.id, facultyId || null)
      setSections(cur => cur.map(x => (x.id === sec.id ? { ...x, classIncharge: facultyId || null } : x)))
      say(true, `Class in-charge of ${sec.id} saved.`)
    } catch (e: any) { say(false, e?.message || 'Could not save.') }
    finally { setSaving(null) }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>
  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-slate-500">Pick the class in-charge of each section. It is saved at once and printed on that section's timetable PDF.</p>
      {groups.length === 0 && <p className="text-sm text-slate-400">No sections yet. Add them under Syllabus &amp; sections.</p>}
      {groups.map(([label, secs]) => (
        <div key={label} className="bg-white/70 border border-slate-200 rounded-2xl p-4">
          <h3 className="text-sm font-700 text-slate-800 mb-3">{label}</h3>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {secs.map(sec => (
              <label key={sec.id} className="flex flex-col gap-1">
                <span className="text-[10.5px] font-700 uppercase tracking-wider text-slate-500">Section {sec.id.replace(/^Y\d(S\d)?-/, '')}</span>
                <select value={sec.classIncharge ?? ''} disabled={saving === sec.id} onChange={e => change(sec, e.target.value)}
                  className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-[color:var(--c-600)]">
                  <option value="">Not assigned</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
