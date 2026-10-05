import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Plus, Trash2, Upload, X } from 'lucide-react'
import { api, downloadFile, type CheckedRow, type DataCheck, type ImportCommit, type ImportKind, type ImportMode, type ImportPreview, type ImportSummary } from '../api'

const TITLE: Record<ImportKind, string> = { sections: 'Sections', syllabus: 'Syllabus', teachers: 'Teachers' }

/**
 * Import wizard: choose the Excel file -> every missing or wrong value is listed exactly and can be fixed on the spot
 * -> import. Nothing is saved until the last step.
 */
export default function ImportWizard({ kind, onClose, onDone }: { kind: ImportKind; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [rows, setRows] = useState<CheckedRow[]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [skipInvalid, setSkipInvalid] = useState(false)
  const [result, setResult] = useState<ImportCommit | null>(null)
  const [check, setCheck] = useState<DataCheck | null>(null)
  const [mode, setMode] = useState<ImportMode>('add')          // teachers only: add to the list, or replace all of it
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const cols = preview?.columns ?? []
  const replacing = kind === 'teachers' && mode === 'replace'

  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [busy, onClose])

  async function choose(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const p = await api.bulkImport.preview(kind, file, mode)
      setPreview(p); setRows(p.rows); setSummary(p.summary); setStep('review')
    } catch (e: any) { setError(e?.message || 'Could not read that file.') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  // every edit is re-checked on the server (one source of truth for the rules); only the problem lists are taken back
  const recheck = useCallback((next: CheckedRow[]) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const r = await api.bulkImport.validate(kind, next.map(x => ({ row: x.row, values: x.values })), mode)
        setRows(cur => cur.map(x => { const n = r.rows.find(y => y.row === x.row); return n ? { ...x, issues: n.issues, action: n.action, note: n.note } : x }))
        setSummary(r.summary)
      } catch { /* keep the previous list */ }
    }, 500)
  }, [kind, mode])

  const edit = (row: number, key: string, value: string) => {
    const next = rows.map(r => (r.row === row ? { ...r, values: { ...r.values, [key]: value } } : r))
    setRows(next); recheck(next)
  }
  const remove = (row: number) => { const next = rows.filter(r => r.row !== row); setRows(next); recheck(next) }
  const addRow = () => {
    const n = Math.max(1, ...rows.map(r => r.row)) + 1
    const next = [...rows, { row: n, values: Object.fromEntries(cols.map(c => [c.key, ''])), issues: [], action: 'create' as const }]
    setRows(next); recheck(next)
  }

  const problems = useMemo(() => rows.flatMap(r => r.issues.map(i => ({ ...i, row: r.row, label: cols.find(c => c.key === i.field)?.label ?? i.field }))), [rows, cols])
  const errorRows = rows.filter(r => r.issues.some(i => i.level === 'error')).length
  const shown = onlyProblems ? rows.filter(r => r.issues.length) : rows
  const toImport = skipInvalid ? rows.length - errorRows : rows.length

  async function commit() {
    setBusy(true); setError(null)
    try {
      const r = await api.bulkImport.commit(kind, rows.map(x => ({ row: x.row, values: x.values })), skipInvalid, replacing ? { mode, password, confirm: confirmText } : {})
      setResult(r); setStep('done'); onDone()
      api.bulkImport.dataCheck().then(setCheck).catch(() => {})
    } catch (e: any) { setError(e?.message || 'Import failed.') }
    finally { setBusy(false) }
  }

  const csv = () => {
    if (!result) return
    const body = ['Faculty ID,Name,Email,One-time password', ...result.logins.map(l => `${l.facultyId},"${l.name}",${l.email ?? ''},${l.password}`)].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' })); a.download = 'new-teacher-logins.csv'; a.click()
  }

  const cellCls = (r: CheckedRow, key: string) => {
    const lv = r.issues.filter(i => i.field === key).some(i => i.level === 'error') ? 'error' : r.issues.some(i => i.field === key) ? 'warning' : ''
    return `w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 ${lv === 'error' ? 'border-rose-400 bg-rose-50/60 focus:ring-rose-300' : lv === 'warning' ? 'border-amber-300 bg-amber-50/50 focus:ring-amber-200' : 'border-slate-200 focus:ring-[color:var(--c-600)]/30'}`
  }
  const focusCell = (row: number, key: string) => { const el = document.getElementById(`imp-${row}-${key}`) as HTMLElement | null; el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el?.focus(), 250) }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-[2px] flex items-center justify-center p-3" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0">
          <FileSpreadsheet className="w-5 h-5 text-[color:var(--c-600)]" />
          <div>
            <h2 className="text-sm font-800 text-slate-800">Import {TITLE[kind].toLowerCase()} from Excel</h2>
            <p className="text-[11px] text-slate-500">{step === 'upload' ? 'Download the template, fill it, then upload it.' : step === 'review' ? 'Fix anything marked in red (blocks the import) or amber (a warning), then import.' : 'Done.'}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="ml-auto p-1.5 rounded-full hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>

        {error && <p className="mx-5 mt-3 text-xs font-600 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">⚠ {error}</p>}

        {/* ── 1. upload ── */}
        {step === 'upload' && (
          <div className="p-6 grid gap-4 md:grid-cols-2 overflow-y-auto">
            {kind === 'teachers' && (
              <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
                {([['add', 'Add teachers', 'Adds the teachers in the file to your current list. A Faculty ID in the file updates that teacher instead.'], ['replace', 'Replace all teachers', 'Full rewrite for another department: every current teacher (except you) is removed with their logins, preferences and assignments, and the file becomes the new list.']] as [ImportMode, string, string][]).map(([m, t, d]) => (
                  <button key={m} onClick={() => setMode(m)} className={`text-left rounded-xl border p-3 transition ${mode === m ? (m === 'replace' ? 'border-rose-400 bg-rose-50/60 ring-1 ring-rose-200' : 'border-[color:var(--c-600)] bg-blue-50/50 ring-1 ring-[color:var(--c-600)]/20') : 'border-slate-200 hover:bg-slate-50'}`}>
                    <p className={`text-xs font-800 ${m === 'replace' ? 'text-rose-700' : 'text-[color:var(--c-600)]'}`}>{mode === m ? '● ' : '○ '}{t}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-800 text-slate-700">1 · Get the template</p>
              <p className="text-[11px] text-slate-500 mt-1">It lists every column, marks the required ones and has example rows to copy. Rows that start with "Example:" are ignored.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => downloadFile(`/setup/import/template/${kind}`, 'template.xlsx').catch(e => setError(e.message))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[color:var(--c-600)] text-[color:var(--c-600)] text-xs font-700 hover:bg-blue-50"><Download className="w-3.5 h-3.5" /> {TITLE[kind]} template</button>
                <button onClick={() => downloadFile('/setup/import/template/all', 'template.xlsx').catch(e => setError(e.message))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 text-slate-600 text-xs font-600 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> All-in-one (sections + syllabus + teachers)</button>
              </div>
              <div className="mt-4 text-[11px] text-slate-500">
                <p className="font-700 text-slate-600 mb-1">Columns</p>
                <ul className="space-y-0.5">{(preview?.columns ?? defaultCols(kind)).map(c => <li key={c.key}><b className="text-slate-700">{c.label}{c.required ? ' *' : ''}</b> · {c.hint}</li>)}</ul>
              </div>
            </div>
            <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 flex flex-col items-center justify-center text-center"
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files?.[0]) }}>
              <Upload className="w-8 h-8 text-slate-400" />
              <p className="text-xs font-700 text-slate-700 mt-2">2 · Upload the filled file</p>
              <p className="text-[11px] text-slate-500 mt-1">Drop the .xlsx here, or</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => choose(e.target.files?.[0])} />
              <button disabled={busy} onClick={() => fileRef.current?.click()} className="mt-2 px-4 py-1.5 rounded-full bg-[color:var(--c-600)] text-white text-xs font-700 disabled:opacity-40">{busy ? 'Reading…' : 'Choose file'}</button>
              <p className="text-[10.5px] text-slate-400 mt-3">Nothing is saved yet. You review and fix everything first.</p>
            </div>
          </div>
        )}

        {/* ── 2. review ── */}
        {step === 'review' && preview && summary && (
          <>
            <div className="px-5 py-3 flex items-center gap-2 flex-wrap shrink-0 border-b border-slate-100">
              <Chip tone="slate">{summary.total} rows</Chip>
              <Chip tone="green">{summary.ready} ready</Chip>
              {summary.errors > 0 && <Chip tone="red">{summary.errors} with errors</Chip>}
              {summary.warnings > 0 && <Chip tone="amber">{summary.warnings} with warnings</Chip>}
              <Chip tone="blue">{summary.toCreate} to add</Chip>
              {summary.toUpdate > 0 && <Chip tone="blue">{summary.toUpdate} to update</Chip>}
              <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-600"><input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} /> Show only rows with problems</label>
            </div>

            {problems.length > 0 && (
              <div className="mx-5 mt-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 max-h-36 overflow-y-auto shrink-0">
                <p className="text-[11px] font-800 text-amber-900 mb-1"><AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />What is missing or wrong ({problems.filter(p => p.level === 'error').length} errors, {problems.filter(p => p.level === 'warning').length} warnings)</p>
                <ul className="space-y-0.5">
                  {problems.slice(0, 60).map((p, i) => (
                    <li key={i} className="text-[11px] flex gap-2">
                      <span className={`shrink-0 font-700 ${p.level === 'error' ? 'text-rose-700' : 'text-amber-700'}`}>{p.level === 'error' ? '✕' : '!'} Row {p.row} · {p.label}</span>
                      <span className="text-slate-700 min-w-0">{p.message}</span>
                      <button onClick={() => focusCell(p.row, p.field)} className="ml-auto shrink-0 text-[color:var(--c-700)] font-700 hover:underline">Fix</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.unknownColumns.length > 0 && <p className="mx-5 mt-2 text-[11px] text-slate-500">Ignored columns: {preview.unknownColumns.join(', ')}</p>}

            <div className="flex-1 overflow-auto px-5 py-3 min-h-[200px]">
              <datalist id="imp-labs">{(preview.lookups.labs ?? []).map(l => <option key={l} value={l} />)}</datalist>
              <table className="w-full text-xs border-separate border-spacing-y-1">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="w-10 py-1">Row</th>
                    {cols.map(c => <th key={c.key} className="py-1 px-1" style={{ minWidth: c.width ? c.width * 7 : 90 }}>{c.label}{c.required && <span className="text-rose-500"> *</span>}</th>)}
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.row} className="align-top">
                      <td className="text-[11px] text-slate-400 pt-1.5">{r.row}</td>
                      {cols.map(c => (
                        <td key={c.key} className="px-1">
                          {c.options ? (
                            <select id={`imp-${r.row}-${c.key}`} value={r.values[c.key] ?? ''} onChange={e => edit(r.row, c.key, e.target.value)} className={cellCls(r, c.key)} title={r.issues.filter(i => i.field === c.key).map(i => i.message).join('\n')}>
                              <option value="">{c.required ? '— choose —' : '—'}</option>
                              {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input id={`imp-${r.row}-${c.key}`} list={c.key === 'labs' ? 'imp-labs' : undefined} value={r.values[c.key] ?? ''} onChange={e => edit(r.row, c.key, e.target.value)} className={cellCls(r, c.key)} title={r.issues.filter(i => i.field === c.key).map(i => i.message).join('\n')} />
                          )}
                        </td>
                      ))}
                      <td className="pt-1 pl-1 whitespace-nowrap">
                        <span className={`text-[10px] font-700 px-1.5 py-0.5 rounded-full ${r.action === 'update' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{r.action === 'update' ? 'update' : 'new'}</span>
                        <button title="Remove this row" onClick={() => remove(r.row)} className="ml-1 p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length === 0 && <p className="text-xs text-slate-400 text-center py-8">{rows.length === 0 ? 'No rows left.' : 'No problems. 🎉'}</p>}
              <button onClick={addRow} className="mt-2 inline-flex items-center gap-1 text-[11px] font-700 text-[color:var(--c-700)] hover:underline"><Plus className="w-3.5 h-3.5" /> Add a row</button>
            </div>

            {replacing && (
              <div className="mx-5 mb-2 rounded-xl border border-rose-300 bg-rose-50/70 px-3 py-2.5 shrink-0">
                <p className="text-[11px] font-800 text-rose-800">Replace all teachers: every current teacher except you will be removed, with their logins, subject preferences, assignments and generated timetables. This cannot be undone.</p>
                <div className="mt-2 flex gap-2 flex-wrap">
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your HOD password" className="border border-rose-200 rounded-lg px-2.5 py-1.5 text-xs bg-white w-52" />
                  <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type REPLACE" className="border border-rose-200 rounded-lg px-2.5 py-1.5 text-xs bg-white w-40" />
                </div>
              </div>
            )}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3 flex-wrap shrink-0">
              <button onClick={() => { setStep('upload'); setPreview(null) }} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-600 text-slate-600 hover:bg-slate-50">Choose another file</button>
              {errorRows > 0 && (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600"><input type="checkbox" checked={skipInvalid} onChange={e => setSkipInvalid(e.target.checked)} /> Skip the {errorRows} row{errorRows === 1 ? '' : 's'} that still have errors</label>
              )}
              <button disabled={busy || toImport === 0 || (errorRows > 0 && !skipInvalid) || (replacing && (!password || confirmText !== 'REPLACE'))} onClick={commit} className="ml-auto px-5 py-2 rounded-full bg-[color:var(--c-600)] text-white text-xs font-700 disabled:opacity-40">
                {busy ? 'Importing…' : errorRows > 0 && !skipInvalid ? `Fix ${errorRows} error${errorRows === 1 ? '' : 's'} to import` : replacing ? `Replace all teachers with these ${toImport}` : `Import ${toImport} ${TITLE[kind].toLowerCase()}`}
              </button>
            </div>
          </>
        )}

        {/* ── 3. done ── */}
        {step === 'done' && result && (
          <div className="p-6 overflow-y-auto space-y-4">
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="w-5 h-5" /><p className="text-sm font-800">Imported: {result.created} added{result.removed ? `, ${result.removed} old teachers removed` : ''}{result.updated ? `, ${result.updated} updated` : ''}{result.skipped ? `, ${result.skipped} skipped` : ''}.</p></div>
            {kind === 'teachers' && result.logins.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2"><p className="text-xs font-800 text-amber-900">One-time passwords — shown only now. Save or hand them out.</p><button onClick={csv} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-300 text-amber-900 text-[11px] font-700 hover:bg-amber-100"><Download className="w-3 h-3" /> CSV</button></div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2 max-h-48 overflow-y-auto">
                  {result.logins.map(l => <div key={l.facultyId} className="flex items-center gap-2 bg-white border border-amber-100 rounded-md px-2.5 py-1 text-xs"><span className="font-mono text-[11px] text-[color:var(--c-600)]">{l.facultyId}</span><span className="truncate flex-1">{l.name}</span><span className="font-mono font-700">{l.password}</span></div>)}
                </div>
              </div>
            )}
            <ReadyPanel check={check} />
            <div className="flex justify-end"><button onClick={onClose} className="px-5 py-2 rounded-full bg-[color:var(--c-600)] text-white text-xs font-700">Close</button></div>
          </div>
        )}
      </div>
    </div>
  )
}

/** What is still missing before preferences, approval and timetable generation can work. */
export function ReadyPanel({ check }: { check: DataCheck | null }) {
  if (!check) return <p className="text-[11px] text-slate-400">Checking what is still missing…</p>
  const errors = check.items.filter(i => i.level === 'error'), warns = check.items.filter(i => i.level === 'warning')
  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex gap-2 flex-wrap">
        <Chip tone={check.ready.preferences ? 'green' : 'red'}>{check.ready.preferences ? '✓' : '✕'} Ready for teacher preferences</Chip>
        <Chip tone={check.ready.timetable ? 'green' : 'amber'}>{check.ready.timetable ? '✓' : '…'} Ready for timetable generation</Chip>
        <span className="text-[11px] text-slate-400 self-center">{check.counts.sections} sections · {check.counts.subjects} subjects · {check.counts.teachers} teachers</span>
      </div>
      {[...errors, ...warns].length === 0 ? <p className="text-xs text-emerald-700 font-600">Nothing is missing.</p> : (
        <ul className="space-y-0.5 max-h-44 overflow-y-auto">
          {[...errors, ...warns].slice(0, 40).map((i, k) => <li key={k} className={`text-[11px] ${i.level === 'error' ? 'text-rose-700' : 'text-amber-800'}`}>{i.level === 'error' ? '✕' : '!'} {i.message}</li>)}
        </ul>
      )}
    </div>
  )
}

function Chip({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'blue' | 'slate'; children: React.ReactNode }) {
  const c = { green: 'bg-emerald-50 text-emerald-700 border-emerald-200', red: 'bg-rose-50 text-rose-700 border-rose-200', amber: 'bg-amber-50 text-amber-800 border-amber-200', blue: 'bg-blue-50 text-blue-700 border-blue-200', slate: 'bg-slate-50 text-slate-600 border-slate-200' }[tone]
  return <span className={`text-[11px] font-700 px-2.5 py-0.5 rounded-full border ${c}`}>{children}</span>
}

const defaultCols = (kind: ImportKind) => ({
  sections: [{ key: 'semester', label: 'Semester', required: true, hint: 'I to VIII' }, { key: 'section', label: 'Section', required: true, hint: 'A, B, C … one per row' }, { key: 'students', label: 'Students', hint: 'optional' }, { key: 'incharge', label: 'Class In-charge', hint: 'optional' }],
  syllabus: [{ key: 'semester', label: 'Semester', required: true, hint: 'I to VIII' }, { key: 'code', label: 'Subject Code', required: true, hint: 'unique' }, { key: 'name', label: 'Subject Name', required: true, hint: '' }, { key: 'type', label: 'Type', required: true, hint: 'THEORY / INTEGRATED / LAB' }, { key: 'theory', label: 'Theory periods/week', required: true, hint: 'per section' }, { key: 'lab', label: 'Lab periods/week', required: true, hint: 'per section' }, { key: 'labs', label: 'Lab rooms', hint: 'needed when there are lab periods' }],
  teachers: [{ key: 'name', label: 'Name', required: true, hint: '' }, { key: 'experience', label: 'Experience (years)', required: true, hint: 'decides which subjects they may choose' }, { key: 'email', label: 'Email', hint: 'for Forgot password and mails' }, { key: 'designation', label: 'Designation', hint: '' }],
}[kind]) as { key: string; label: string; required?: boolean; hint: string }[]
