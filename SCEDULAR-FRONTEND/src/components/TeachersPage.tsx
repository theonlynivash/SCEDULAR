import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, KeyRound, Trash2, Search, Download, X, Copy, Mail, FileSpreadsheet } from 'lucide-react'
import ImportWizard from './ImportWizard'
import Avatar from './Avatar'
import { resizeToDataUrl } from './PhotoUploader'
import { photoChanged } from './Avatar'
import { api, type Faculty, type IssuedLogin } from '../api'

const inputCls = 'w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#1f6a63] bg-white'
const labelCls = 'block text-[10px] font-700 uppercase tracking-wider text-slate-500 mb-1'

function downloadCsv(rows: IssuedLogin[]) {
  const csv = ['Teacher ID,Name,Password', ...rows.map(r => `${r.facultyId},"${r.name.replace(/"/g, '""')}",${r.password}`)].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'scedular-teacher-logins.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

/** The department's teachers: who they are, their experience band, workload limit and login. */
export default function TeachersPage({ onMail }: { onMail: (facultyId: string) => void }) {
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [logins, setLogins] = useState<Record<string, boolean>>({})
  const [loads, setLoads] = useState<Record<string, number>>({})
  const [results, setResults] = useState<Record<string, { count: number; average: number | null }>>({})
  const [editingMail, setEditingMail] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [issued, setIssued] = useState<IssuedLogin[]>([])
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [form, setForm] = useState({ name: '', designation: 'Assistant Professor', email: '', allocationExperience: '', maxWeeklyPeriods: '24' })

  const say = useCallback((ok: boolean, text: string) => { setNotice({ ok, text }); setTimeout(() => setNotice(null), 6000) }, [])

  const load = useCallback(async () => {
    try {
      const [f, l, cyc, res] = await Promise.all([api.faculty.list(), api.setup.logins(), api.facultyAllocation.getAcademicCycle(), api.results.hodOverview().catch(() => ({}))])
      setFaculty(f); setLogins(l); setResults(res)
      // current load = periods taught across the running semesters (one board gives every teacher's total)
      const sem = cyc.allowedSemesters?.[0]
      if (sem) {
        const board = await api.facultyAllocation.getAssignBoard(sem)
        setLoads(Object.fromEntries(board.teachers.map(t => [t.facultyId, t.load])))
      }
    } catch (e: any) { say(false, e?.message || 'Could not load teachers.') }
    finally { setLoading(false) }
  }, [say])
  useEffect(() => { load() }, [load])
  const reloadAll = load   // `load` is shadowed inside the table rows (a teacher's load number)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return faculty.filter(f => !t || f.name.toLowerCase().includes(t) || f.id.toLowerCase().includes(t)).sort((a, b) => a.id.localeCompare(b.id))
  }, [faculty, q])
  const missing = faculty.filter(f => f.role !== 'HOD' && !logins[f.id]).length

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); await load() } catch (e: any) { say(false, e?.message || 'Action failed.') } finally { setBusy(false) }
  }

  const add = () => run(async () => {
    const r = await api.setup.createTeacher({
      name: form.name.trim(), designation: form.designation.trim() || null, email: form.email.trim() || null,
      allocationExperience: form.allocationExperience === '' ? undefined : Number(form.allocationExperience),
      maxWeeklyPeriods: Number(form.maxWeeklyPeriods) || 24,
    })
    setIssued(x => [r, ...x]); setAdding(false)
    setForm({ name: '', designation: 'Assistant Professor', email: '', allocationExperience: '', maxWeeklyPeriods: '24' })
    say(true, `${r.name} added as ${r.facultyId}. Their password is shown below once.`)
  })
  const reissue = (f: Faculty) => {
    if (window.confirm(`Issue a new password for ${f.name}? The old one stops working.`)) run(async () => { const r = await api.setup.issueLogin(f.id); setIssued(x => [r, ...x.filter(i => i.facultyId !== r.facultyId)]); say(true, `New password for ${f.name} shown below.`) })
  }
  const remove = (f: Faculty) => {
    if (window.confirm(`Remove ${f.name} (${f.id})?\n\nTheir login, subject choices and teaching assignments are deleted; the sections they taught become open again.`)) run(async () => { await api.setup.deleteTeacher(f.id); say(true, `${f.name} removed.`) })
  }
  const bulk = () => run(async () => { const r = await api.setup.issueMissingLogins(); setIssued(x => [...r.issued, ...x]); say(true, `Created ${r.issued.length} login${r.issued.length === 1 ? '' : 's'}.`) })
  const saveField = (f: Faculty, patch: { allocationExperience?: number; maxWeeklyPeriods?: number }) => run(async () => { await api.setup.updateTeacher(f.id, patch) })

  const num = (v: number | null | undefined, onSave: (n: number) => void, min = 0, max = 60) => (
    <input key={String(v)} type="number" min={min} max={max} defaultValue={v ?? ''} placeholder="–"
      onBlur={e => { const n = Number(e.target.value); if (e.target.value !== '' && n !== v && n >= min && n <= max) onSave(n) }}
      className="w-14 text-center border border-transparent hover:border-slate-200 focus:border-[#1f6a63] rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white focus:outline-none" />
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-800 text-lg text-[#1f6a63]">Teachers</h1>
          <p className="text-[11px] text-slate-500">{faculty.length} in the department · {missing === 0 ? 'everyone has a login' : <span className="text-amber-700 font-600">{missing} without a login</span>}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-48 focus:outline-none focus:border-[#1f6a63] bg-white" /></div>
          {missing > 0 && <button disabled={busy} onClick={bulk} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#1f6a63]/40 text-[#1f6a63] text-xs font-700 hover:bg-blue-50 disabled:opacity-40"><KeyRound className="w-3.5 h-3.5" /> Create {missing} missing login{missing === 1 ? '' : 's'}</button>}
          <button onClick={() => setImporting(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#1f6a63]/40 text-[#1f6a63] text-xs font-700 hover:bg-blue-50"><FileSpreadsheet className="w-3.5 h-3.5" /> Import from Excel</button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1f6a63] text-white text-xs font-700"><Plus className="w-3.5 h-3.5" /> Add teacher</button>
        </div>
      </div>

      {notice && <div className={`slide-down text-xs font-600 rounded-lg px-4 py-2.5 border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{notice.ok ? '✓' : '⚠'} {notice.text}</div>}

      {issued.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-700 text-amber-900">New logins — passwords are shown only now. Hand them over, then close this.</p>
            <button onClick={() => downloadCsv(issued)} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-300 text-amber-900 text-[11px] font-700 hover:bg-amber-100"><Download className="w-3 h-3" /> CSV</button>
            <button onClick={() => setIssued([])} className="p-1 rounded hover:bg-amber-100 text-amber-800"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {issued.map(i => (
              <div key={i.facultyId} className="flex items-center gap-2 bg-white border border-amber-100 rounded-md px-2.5 py-1.5 text-xs">
                <span className="font-600 text-slate-800 truncate">{i.name}</span>
                <span className="font-mono text-[10px] text-slate-400">{i.facultyId}</span>
                <span className="ml-auto font-mono font-700 text-[#1f6a63]">{i.password}</span>
                <button title="Copy" onClick={() => navigator.clipboard?.writeText(`${i.facultyId} / ${i.password}`)} className="p-0.5 text-slate-400 hover:text-slate-700"><Copy className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? <p className="text-sm text-slate-500 text-center py-8">Loading…</p> : (
          <table className="tbl text-xs">
            <thead><tr><th>ID</th><th>Name</th><th>Designation</th><th className="!text-center" title="Years of experience used to decide which subjects they may choose">Experience</th><th className="!text-center" title="Weekly teaching periods allowed">Weekly limit</th><th className="!text-center">Load now</th><th className="!text-center" title="Average pass percentage of the classes they took in past semesters">Avg pass</th><th>Mail</th><th>Login</th><th /></tr></thead>
            <tbody>
              {rows.map(f => {
                const load = loads[f.id] ?? 0
                const hod = f.role === 'HOD'
                return (
                  <tr key={f.id} className="hover:bg-slate-50/70">
                    <td className="font-mono text-[11px] text-slate-500">{f.id}</td>
                    <td className="font-600 text-slate-800"><span className="inline-flex items-center gap-2"><PhotoPick f={f} onSaved={reloadAll} />{f.name}</span>{hod && <span className="ml-1.5 text-[9px] font-800 px-1.5 py-0.5 rounded bg-[#1f6a63] text-white">HOD</span>}</td>
                    <td className="text-slate-500">{f.designation || '–'}</td>
                    <td className="text-center">{num(f.allocationExperience, n => saveField(f, { allocationExperience: n }))}</td>
                    <td className="text-center">{num(f.maxWeeklyPeriods, n => saveField(f, { maxWeeklyPeriods: n }), 1, 40)}</td>
                    <td className={`text-center font-700 text-slate-700`}>{load}</td>
                    <td className="text-center">{results[f.id]?.average != null ? <span title={`${results[f.id].count} subject(s)`} className="font-600 text-slate-700">{results[f.id].average}%</span> : <span className="text-slate-300">–</span>}</td>
                    <td className="whitespace-nowrap">
                      {editingMail === f.id ? (
                        <input autoFocus type="email" defaultValue={f.email ?? ''} placeholder="name@gmail.com" className="w-44 border border-slate-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-[#1f6a63]"
                          onKeyDown={e => { if (e.key === 'Escape') setEditingMail(null) }}
                          onBlur={e => { const v = e.target.value.trim(); setEditingMail(null); if (v !== (f.email ?? '')) run(async () => { await api.setup.updateTeacher(f.id, { email: v || null }); say(true, v ? `Email saved for ${f.name}.` : `Email removed for ${f.name}.`) }) }} />
                      ) : f.email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button title="Edit email" onClick={() => setEditingMail(f.id)} className="text-[12px] text-slate-600 hover:text-[#1b5550] max-w-[150px] truncate">{f.email}</button>
                          <button title={`Send mail to ${f.name}`} onClick={() => onMail(f.id)} className="p-1 rounded-md text-[#3a8a80] hover:bg-[#3a8a80]/10"><Mail className="w-3.5 h-3.5" /></button>
                        </span>
                      ) : (
                        <button onClick={() => setEditingMail(f.id)} className="text-[12px] text-slate-400 hover:text-[#1b5550]">+ add email</button>
                      )}
                    </td>
                    <td>{logins[f.id] ? <span className="text-emerald-700 font-600">✓ personal</span> : <span className="text-amber-700 font-600">none yet</span>}</td>
                    <td className="text-right whitespace-nowrap">
                      <button title={logins[f.id] ? 'Reset password' : 'Create login'} disabled={busy} onClick={() => reissue(f)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"><KeyRound className="w-3.5 h-3.5" /></button>
                      {!hod && <button title="Remove teacher" disabled={busy} onClick={() => remove(f)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center"><h3 className="text-sm font-700 text-slate-800">Add teacher</h3><button onClick={() => setAdding(false)} className="ml-auto p-1 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className={labelCls}>Full name</label><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Dr. A. Kumar" autoFocus /></div>
              <div><label className={labelCls}>Designation</label><input className={inputCls} value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} /></div>
              <div><label className={labelCls}>Email (optional)</label><input className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className={labelCls}>Experience (years)</label><input type="number" min={0} className={inputCls} value={form.allocationExperience} onChange={e => setForm({ ...form, allocationExperience: e.target.value })} placeholder="decides which years they can pick" /></div>
              <div><label className={labelCls}>Weekly limit (periods)</label><input type="number" min={1} max={40} className={inputCls} value={form.maxWeeklyPeriods} onChange={e => setForm({ ...form, maxWeeklyPeriods: e.target.value })} /></div>
              <p className="col-span-2 text-[11px] text-slate-500">An ID and a one-time password are generated for them.</p>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="px-4 py-1.5 rounded-lg border border-slate-200 text-xs font-600 text-slate-600">Cancel</button>
              <button disabled={busy || form.name.trim().length < 2} onClick={add} className="px-4 py-1.5 rounded-lg bg-[#1f6a63] text-white text-xs font-700 disabled:opacity-40">Add & create login</button>
            </div>
          </div>
        </div>
      )}
      {importing && <ImportWizard kind="teachers" onClose={() => setImporting(false)} onDone={() => load()} />}
    </div>
  )
}

/** Round picture of a teacher; clicking it lets the HOD set or replace their photo. */
function PhotoPick({ f, onSaved }: { f: { id: string; name: string; photoAt?: string | null }; onSaved: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  async function pick(file?: File) {
    if (!file || !file.type.startsWith('image/')) return
    try { await api.photo.set(f.id, await resizeToDataUrl(file)); photoChanged(f.id); onSaved() } catch { /* shown by the next load */ }
    if (ref.current) ref.current.value = ''
  }
  return (
    <>
      <button type="button" title="Change photo" onClick={() => ref.current?.click()} className="rounded-full hover:ring-2 hover:ring-[#1f6a63]/40 transition"><Avatar id={f.id} name={f.name} photoAt={f.photoAt ?? null} size={28} /></button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
    </>
  )
}
