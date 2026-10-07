import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { api, downloadFile, type DataCheck, type ImportKind, type ImportMode } from '../api'
import ImportWizard, { ReadyPanel } from './ImportWizard'
import { PillTabs } from './ui'

const STEPS: { kind: ImportKind; title: string; count: (c: DataCheck) => string }[] = [
  { kind: 'sections', title: 'Sections', count: c => `${c.counts.sections} now` },
  { kind: 'syllabus', title: 'Syllabus', count: c => `${c.counts.subjects} subjects now` },
  { kind: 'teachers', title: 'Teachers', count: c => `${c.counts.teachers} now` },
]

/** Settings -> Import: one template on top, then two tabs. Add keeps what exists; Reset replaces it (password asked again). */
export default function SetupImportTab({ say }: { say: (ok: boolean, text: string) => void }) {
  const [check, setCheck] = useState<DataCheck | null>(null)
  const [mode, setMode] = useState<ImportMode>('add')
  const [open, setOpen] = useState<ImportKind | null>(null)
  const load = useCallback(() => { api.bulkImport.dataCheck().then(setCheck).catch(() => setCheck(null)) }, [])
  useEffect(() => { load() }, [load])
  const reset = mode === 'reset'

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-white/80 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-700 text-slate-800">Import from Excel</h3>
          <p className="text-[11px] text-slate-500">One workbook with three sheets: Sections, Syllabus, Teachers.</p>
        </div>
        <button onClick={() => downloadFile('/setup/import/template/all', 'SCEDULAR-All-in-one-Template.xlsx').catch(e => say(false, e.message))} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[color:var(--c-600)] text-white text-xs font-700"><Download className="w-3.5 h-3.5" /> Download template</button>
      </div>

      <PillTabs value={mode} onChange={setMode} tabs={[{ id: 'add' as ImportMode, label: 'Add' }, { id: 'reset' as ImportMode, label: 'Reset' }]} />

      <div className={`rounded-2xl border p-4 ${reset ? 'bg-rose-50/40 border-rose-200' : 'bg-white/80 border-slate-200'}`}>
        <p className={`text-xs font-600 ${reset ? 'text-rose-800' : 'text-slate-600'}`}>
          {reset ? 'Removes the current data of that type, then loads your file. Asks for your password.' : 'Keeps what you have and adds your file. A matching ID or code is updated.'}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.kind} className="rounded-xl bg-white border border-slate-200 p-3 flex flex-col">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[color:var(--c-600)] text-white text-[11px] font-800 grid place-items-center">{i + 1}</span>
                <h4 className="text-sm font-700 text-slate-800">{s.title}</h4>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 flex-1">{check ? s.count(check) : ' '}</p>
              <button onClick={() => setOpen(s.kind)} className={`mt-2 px-3 py-1.5 rounded-full text-xs font-700 ${reset ? 'border border-rose-300 text-rose-700 hover:bg-rose-50' : 'bg-[color:var(--c-600)] text-white'}`}>{reset ? `Reset ${s.title.toLowerCase()}` : `Add ${s.title.toLowerCase()}`}</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/80 border border-slate-200 rounded-2xl p-4">
        <h3 className="text-sm font-700 text-slate-800 mb-2">Is everything ready?</h3>
        <ReadyPanel check={check} />
      </div>

      {open && <ImportWizard key={`${mode}-${open}`} kind={open} mode={mode} onClose={() => setOpen(null)} onDone={() => { load(); say(true, reset ? 'Reset finished.' : 'Import finished.') }} />}
    </div>
  )
}
