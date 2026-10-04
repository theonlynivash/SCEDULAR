import { useCallback, useEffect, useState } from 'react'
import { Eraser } from 'lucide-react'
import { api } from '../api'

type Kind = 'preferences' | 'allocation'

const COPY: Record<Kind, { title: string; what: string; keeps: string; button: string }> = {
  preferences: {
    title: 'Erase submitted preferences',
    what: 'Removes every subject choice teachers have saved or submitted, so the next round starts clean.',
    keeps: 'Kept: teachers, logins, sections, syllabus, assignments and timetables.',
    button: 'Erase preferences',
  },
  allocation: {
    title: 'Erase allocation',
    what: 'Removes who teaches which section, the workload allocations, and the timetables generated from them.',
    keeps: 'Kept: teachers, logins, sections, syllabus and all teacher preferences.',
    button: 'Erase allocation',
  },
}

/** Settings -> Dataset: the only two erase actions. Teachers and the syllabus can never be erased in bulk. */
export default function SetupDatasetTab({ say }: { say: (ok: boolean, text: string) => void }) {
  const [counts, setCounts] = useState<{ preferences: number; teachingAssignments: number; workloadAllocations: number; generatedRuns: number } | null>(null)
  const [open, setOpen] = useState<Kind | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const input = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-rose-400'

  const load = useCallback(() => { api.erase.summary().then(setCounts).catch(() => setCounts(null)) }, [])
  useEffect(() => { load() }, [load])

  async function run(kind: Kind) {
    setBusy(true)
    try {
      if (kind === 'preferences') {
        const r = await api.erase.preferences(password)
        say(true, `Erased ${r.erasedPreferences} preference${r.erasedPreferences === 1 ? '' : 's'}. Teachers can choose again.`)
      } else {
        const r = await api.erase.allocation(password)
        say(true, `Allocation erased: ${r.erased.teachingAssignments} assignments and ${r.erased.generatedRuns} generated timetable run${r.erased.generatedRuns === 1 ? '' : 's'} removed. Preferences are kept.`)
      }
      setOpen(null); setPassword(''); load()
    } catch (e: any) { say(false, e?.message || 'Could not erase.') }
    finally { setBusy(false) }
  }

  const amount = (k: Kind) => counts ? (k === 'preferences' ? `${counts.preferences} preference${counts.preferences === 1 ? '' : 's'}` : `${counts.teachingAssignments} assignments · ${counts.generatedRuns} timetable run${counts.generatedRuns === 1 ? '' : 's'}`) : ''

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white/80 border border-slate-200 rounded-2xl p-4">
        <h3 className="text-sm font-700 text-slate-800">Your data stays</h3>
        <p className="text-xs text-slate-500 mt-1">Teachers, their logins and the syllabus are never erased in bulk. Change them one at a time under Teachers and Syllabus &amp; sections. Below you can only clear this round's choices or this round's allocation.</p>
      </div>

      {(['preferences', 'allocation'] as Kind[]).map(kind => (
        <div key={kind} className="bg-white/80 border border-rose-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-rose-50 text-rose-600 shrink-0"><Eraser className="w-4 h-4" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-700 text-rose-700">{COPY[kind].title}</h3>
              <p className="text-xs text-slate-600 mt-1">{COPY[kind].what}</p>
              <p className="text-xs text-emerald-700 mt-1">{COPY[kind].keeps}</p>
              {counts && <p className="text-[11px] text-slate-400 mt-1">Right now: {amount(kind)}</p>}
              {open !== kind ? (
                <button onClick={() => { setOpen(kind); setPassword('') }} className="mt-3 px-4 py-1.5 rounded-full border border-rose-300 text-rose-700 text-xs font-700 hover:bg-rose-50">{COPY[kind].button}…</button>
              ) : (
                <div className="mt-3 grid gap-2 max-w-sm">
                  <input type="password" autoFocus placeholder="Your HOD password to confirm" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && password && !busy && run(kind)} className={input} />
                  <div className="flex gap-2">
                    <button disabled={busy || !password} onClick={() => run(kind)} className="px-4 py-1.5 rounded-full bg-rose-600 text-white text-xs font-700 disabled:opacity-40">{busy ? 'Erasing…' : `Yes, ${COPY[kind].button.toLowerCase()}`}</button>
                    <button onClick={() => setOpen(null)} className="px-4 py-1.5 rounded-full border border-slate-200 text-xs font-600 text-slate-600">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
