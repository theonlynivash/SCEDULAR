import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '../api'

/** Start over with an empty dataset (keeps the HOD login and the lab rooms). */
export default function SetupDatasetTab({ say }: { say: (ok: boolean, text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const input = 'w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-rose-400'

  async function erase() {
    setBusy(true)
    try { await api.setup.resetBlank(password, confirm); say(true, 'Dataset erased. Start by adding sections, then the syllabus, then teachers.'); setOpen(false); setPassword(''); setConfirm('') }
    catch (e: any) { say(false, e?.message || 'Could not erase.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-700 text-slate-800">Everything lives in the app</h3>
        <p className="text-xs text-slate-500 mt-1">Sections, the syllabus, teachers with their logins, choices, assignments and timetables are all stored in this database and edited from the screens. Nothing is read back from imported files after setup, so changes you make are never overwritten.</p>
      </div>
      <div className="bg-white border border-rose-200 rounded-xl p-4">
        <h3 className="text-sm font-700 text-rose-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Start a new dataset</h3>
        <p className="text-xs text-slate-500 mt-1">Erases all sections, subjects, teachers (except you), choices, assignments and timetables. Lab rooms and the period grid are kept. This cannot be undone.</p>
        {!open ? (
          <button onClick={() => setOpen(true)} className="mt-3 px-4 py-1.5 rounded-lg border border-rose-300 text-rose-700 text-xs font-700 hover:bg-rose-50">Erase and start fresh…</button>
        ) : (
          <div className="mt-3 grid gap-2 max-w-sm">
            <input type="password" placeholder="Your HOD password" value={password} onChange={e => setPassword(e.target.value)} className={input} />
            <input placeholder="Type ERASE to confirm" value={confirm} onChange={e => setConfirm(e.target.value)} className={input} />
            <div className="flex gap-2">
              <button disabled={busy || confirm !== 'ERASE' || !password} onClick={erase} className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-700 disabled:opacity-40">{busy ? 'Erasing…' : 'Erase everything'}</button>
              <button onClick={() => setOpen(false)} className="px-4 py-1.5 rounded-lg border border-slate-200 text-xs font-600 text-slate-600">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
