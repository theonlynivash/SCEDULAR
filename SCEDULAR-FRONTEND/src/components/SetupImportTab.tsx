import { useCallback, useEffect, useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { api, downloadFile, type DataCheck, type ImportKind } from '../api'
import ImportWizard, { ReadyPanel } from './ImportWizard'

const STEPS: { kind: ImportKind; n: number; title: string; text: string; count: (c: DataCheck) => string }[] = [
  { kind: 'sections', n: 1, title: 'Sections', text: 'The class sections (semester + letter) that need timetables. Import these first so subjects can be offered to them.', count: c => `${c.counts.sections} sections now` },
  { kind: 'syllabus', n: 2, title: 'Syllabus', text: 'Subjects with weekly theory / lab periods per section, lab rooms and short names. Each subject is offered to the sections you name.', count: c => `${c.counts.subjects} subjects now` },
  { kind: 'teachers', n: 3, title: 'Teachers', text: 'Teachers with experience, email and designation. They get logins; you can add to the list or replace it completely for another department.', count: c => `${c.counts.teachers} teachers now` },
]

/** Settings -> Import: build a whole department from Excel in three steps, then see exactly what is still missing. */
export default function SetupImportTab({ say }: { say: (ok: boolean, text: string) => void }) {
  const [check, setCheck] = useState<DataCheck | null>(null)
  const [open, setOpen] = useState<ImportKind | null>(null)
  const load = useCallback(() => { api.bulkImport.dataCheck().then(setCheck).catch(() => setCheck(null)) }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-white/80 border border-slate-200 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
        <FileSpreadsheet className="w-6 h-6 text-[#1f6a63]" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-700 text-slate-800">Set up a department from Excel</h3>
          <p className="text-[11px] text-slate-500">Download one workbook with three sheets, fill it, then import the three sheets in order. Anything missing or wrong is listed exactly and can be fixed on screen before it is saved.</p>
        </div>
        <button onClick={() => downloadFile('/setup/import/template/all', 'SCEDULAR-All-in-one-Template.xlsx').catch(e => say(false, e.message))} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1f6a63] text-white text-xs font-700"><Download className="w-3.5 h-3.5" /> All-in-one template</button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {STEPS.map(s => (
          <div key={s.kind} className="bg-white/80 border border-slate-200 rounded-2xl p-4 flex flex-col">
            <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-[#1f6a63] text-white text-xs font-800 grid place-items-center">{s.n}</span><h4 className="text-sm font-700 text-slate-800">{s.title}</h4></div>
            <p className="text-[11px] text-slate-500 mt-2 flex-1">{s.text}</p>
            <p className="text-[11px] text-slate-400 mt-2">{check ? s.count(check) : ''}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setOpen(s.kind)} className="flex-1 px-3 py-1.5 rounded-full bg-[#1f6a63] text-white text-xs font-700">Import {s.title.toLowerCase()}</button>
              <button title="Download this sheet's template" onClick={() => downloadFile(`/setup/import/template/${s.kind}`, 'template.xlsx').catch(e => say(false, e.message))} className="p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white/80 border border-slate-200 rounded-2xl p-4">
        <h3 className="text-sm font-700 text-slate-800 mb-2">Is everything ready?</h3>
        <ReadyPanel check={check} />
        <p className="text-[11px] text-slate-400 mt-2">Next: teachers sign in and choose subjects → Assign Teachers (approve, then assign) → Generate Timetable.</p>
      </div>

      {open && <ImportWizard kind={open} onClose={() => setOpen(null)} onDone={() => { load(); say(true, 'Import finished.') }} />}
    </div>
  )
}
