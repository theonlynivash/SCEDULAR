import { useEffect, useRef, useState } from 'react'
import { PageHeader, Btn, Section, Field, Select, Chip, GlassPanel, IconBtn } from './ui'
import type { Page } from '../types'
import { api, type Lab, type Section as SectionRow } from '../api'
import { YEARS, SEMESTERS_BY_YEAR } from '../scope'

function BackBtn({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <button
      onClick={() => navigate('dashboard')}
      className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-500 text-slate-600 hover:bg-white/50 glass-pill transition"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  )
}

const TEMPLATE_HEADERS = [
  'FacultyId', 'FacultyName', 'Designation',
  'Year', 'Semester', 'SectionId',
  'CourseId', 'CourseCode', 'CourseName', 'ComponentType', 'LabBlockLength',
  'WeeklyTheoryPeriods', 'WeeklyLabPeriods',
  'MaxDailyPeriods', 'MaxWeeklyPeriods',
]

const TEMPLATE_SAMPLE_ROWS = [
  // An integrated subject is always TWO rows -- theory and lab never share
  // one row, even when (as here) the same faculty teaches both.
  ['FAC_GIRIYASAKTHI', 'Mrs. D. K. Giriyasakthi', 'Asst. Professor', 'II', 'III', 'II-K', 'OOP', '23AD1312', 'Object Oriented Programming Paradigm', 'INTEGRATED_THEORY', '3', '5', '0', '8', '24'],
  ['FAC_GIRIYASAKTHI', 'Mrs. D. K. Giriyasakthi', 'Asst. Professor', 'II', 'III', 'II-K', 'OOP_LAB', '23AD1312L', 'Object Oriented Programming Paradigm Laboratory', 'INTEGRATED_LAB', '3', '0', '3', '8', '24'],
  // Same faculty, same subject, a different section -- one more row, not a
  // new faculty record. This is how one teacher covers 3-4 sections.
  ['FAC_GIRIYASAKTHI', 'Mrs. D. K. Giriyasakthi', 'Asst. Professor', 'II', 'III', 'II-L', 'OOP', '23AD1312', 'Object Oriented Programming Paradigm', 'INTEGRATED_THEORY', '3', '5', '0', '8', '24'],
  ['FAC_KAVITHA_MATH', 'Dr. M. Kavitha', 'Professor', 'II', 'III', 'II-I', 'MFAI', '23MA1304', 'Mathematical Foundations for Artificial Intelligence', 'THEORY_ONLY', '3', '5', '0', '8', '24'],
]

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(','), ...TEMPLATE_SAMPLE_ROWS.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'scedular_workload_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

interface WorkloadImportResult {
  totalRows: number
  imported: number
  rejected: number
  rejectedRows: { row: number; issues: unknown }[]
}

export default function DataHub({ navigate }: { navigate: (p: Page) => void }) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<WorkloadImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [sections, setSections] = useState<SectionRow[]>([])
  const [sectionForm, setSectionForm] = useState({ id: '', year: 'II', semester: 'III' })
  const [sectionSaving, setSectionSaving] = useState(false)
  const [sectionMsg, setSectionMsg] = useState<string | null>(null)

  const [labs, setLabs] = useState<Lab[]>([])
  const [labForm, setLabForm] = useState({ id: '', name: '' })
  const [labSaving, setLabSaving] = useState(false)

  function loadSectionsAndLabs() {
    api.sections.list().then(setSections).catch(() => setSections([]))
    api.labs.list().then(setLabs).catch(() => setLabs([]))
  }

  useEffect(() => {
    loadSectionsAndLabs()
  }, [])

  async function handleFile(file: File) {
    setFileName(file.name)
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.importFacultyWorkload(file)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleAddSection() {
    if (!sectionForm.id) return
    setSectionSaving(true)
    setSectionMsg(null)
    try {
      await api.sections.create({ id: sectionForm.id, name: sectionForm.id, year: sectionForm.year, semester: sectionForm.semester })
      setSectionMsg(`Section ${sectionForm.id} created.`)
      setSectionForm({ ...sectionForm, id: '' })
      setSections(await api.sections.list())
    } catch (e) {
      setSectionMsg(e instanceof Error ? e.message : 'Failed to create section')
    } finally {
      setSectionSaving(false)
    }
  }

  async function handleDeleteSection(id: string) {
    if (!confirm(`Remove section ${id}? This also removes its course requirements and teacher assignments.`)) return
    try {
      await api.sections.remove(id)
      setSections(await api.sections.list())
    } catch (e) {
      setSectionMsg(e instanceof Error ? e.message : 'Failed to delete section')
    }
  }

  async function handleAddLab() {
    if (!labForm.id || !labForm.name) return
    setLabSaving(true)
    try {
      await api.labs.create(labForm)
      setLabForm({ id: '', name: '' })
      setLabs(await api.labs.list())
    } catch {
      // surfaced inline by the (empty) labs list staying unchanged
    } finally {
      setLabSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Data & Import Hub">
        <BackBtn navigate={navigate} />
      </PageHeader>

      <GlassPanel className="p-5">
        <p className="text-sm font-500 text-slate-700 mb-1.5">How this feeds a balanced timetable</p>
        <ul className="text-xs text-slate-500 space-y-1 leading-relaxed list-disc pl-4">
          <li>Import the workload spreadsheet for bulk faculty + course + section + requirement rows, or add sections/labs manually below.</li>
          <li>A subject with both theory and lab (e.g. OOP) is always <strong className="text-slate-600 font-600">two rows</strong> — one Integrated Theory row, one Integrated Lab row (e.g. OOP + OOP_LAB) — never one combined row, even when the same faculty teaches both.</li>
          <li>One faculty teaching the same subject to several sections (commonly 3-4) is just <strong className="text-slate-600 font-600">one row per section</strong> — same FacultyId + CourseId, different SectionId each time.</li>
          <li>Faculty max daily/weekly period caps always travel <strong className="text-slate-600 font-600">with this spreadsheet</strong> (MaxDailyPeriods/MaxWeeklyPeriods columns) — they're not meant to be typed in one at a time elsewhere.</li>
          <li>Every lab-hosted course must be mapped to at least one physical lab in <button onClick={() => navigate('lab-management')} className="text-[#0e254f] font-600 underline underline-offset-2">Lab Management</button> — two subjects sharing one room is fine, just map both.</li>
        </ul>
      </GlassPanel>

      <Section
        title="Workload Spreadsheet"
        actions={<Btn variant="secondary" onClick={downloadTemplate}>Download CSV template</Btn>}
      >
        <div className="overflow-x-auto rounded-2xl border border-white/50">
          <table className="tbl text-xs">
            <thead>
              <tr className="bg-white/40">
                {TEMPLATE_HEADERS.map(h => (
                  <th key={h} className="text-left px-3 py-2 font-600 text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEMPLATE_SAMPLE_ROWS.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white/10' : 'bg-white/25'}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <div
          onClick={() => inputRef.current?.click()}
          className="glass rounded-2xl p-10 text-center cursor-pointer hover:bg-white/50 transition-all group border-2 border-dashed border-white/60"
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 bg-gradient-to-br from-[#0e254f]/20 to-[#f3c326]/20 group-hover:from-[#0e254f]/30 group-hover:to-[#f3c326]/30 transition">
            <svg className="w-7 h-7 text-[#0e254f]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="font-display font-700 text-slate-800">{fileName ?? 'Upload workload spreadsheet'}</p>
          <p className="text-slate-500 text-xs mt-1">.xlsx, .xls or .csv matching the columns above</p>
        </div>

        {uploading && <p className="text-sm text-slate-500 text-center">Uploading and validating…</p>}
        {error && <div className="bg-rose-400/15 border border-rose-300/40 text-rose-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}

        {result && (
          <GlassPanel className="overflow-hidden">
            <div className={`px-5 py-3 flex items-center gap-2 ${result.rejected === 0 ? 'bg-emerald-400/15' : 'bg-amber-400/15'}`}>
              <span className={`text-sm font-500 ${result.rejected === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {result.imported} of {result.totalRows} rows imported{result.rejected > 0 ? `, ${result.rejected} rejected` : ''}
              </span>
            </div>
            {result.rejectedRows.length > 0 && (
              <table className="tbl text-sm">
                <tbody>
                  {result.rejectedRows.map(r => (
                    <tr key={r.row} className="border-t border-white/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 align-top whitespace-nowrap">Row {r.row}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs font-mono whitespace-pre-wrap">{JSON.stringify(r.issues)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-5 py-3 flex justify-end gap-2 border-t border-white/40">
              <Btn variant="secondary" onClick={() => navigate('faculty')}>View Faculty</Btn>
              <Btn onClick={() => navigate('generate')}>Continue to Generate →</Btn>
            </div>
          </GlassPanel>
        )}
      </Section>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        {/* Sections quick-add */}
        <Section title="Add Section">
          <div className="grid grid-cols-3 gap-3">
            <Select label="Year" value={sectionForm.year} onChange={e => setSectionForm({ ...sectionForm, year: e.target.value, semester: SEMESTERS_BY_YEAR[e.target.value as keyof typeof SEMESTERS_BY_YEAR][0] })}>
              {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
            </Select>
            <Select label="Semester" value={sectionForm.semester} onChange={e => setSectionForm({ ...sectionForm, semester: e.target.value })}>
              {SEMESTERS_BY_YEAR[sectionForm.year as keyof typeof SEMESTERS_BY_YEAR].map(s => <option key={s} value={s}>Sem {s}</option>)}
            </Select>
            <Field label="Section ID" placeholder="e.g. II-M" value={sectionForm.id} onChange={e => setSectionForm({ ...sectionForm, id: e.target.value })} />
          </div>
          <Btn onClick={handleAddSection} disabled={sectionSaving || !sectionForm.id}>{sectionSaving ? 'Adding…' : 'Add Section'}</Btn>
          {sectionMsg && <p className="text-xs text-slate-500">{sectionMsg}</p>}

          <div>
            <p className="text-xs font-600 text-slate-500 uppercase tracking-wider mb-2">Sections already added ({sections.length})</p>
            {sections.length === 0 && <p className="text-xs text-slate-400">No sections configured yet.</p>}
            <div className="max-h-56 overflow-y-auto rounded-xl border border-white/50 divide-y divide-white/40">
              {sections.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-white/30 transition">
                  <span className="font-500 text-slate-700">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <Chip tone="neutral">Yr {s.year} · Sem {s.semester}</Chip>
                    <IconBtn tone="danger" title="Delete section" onClick={() => handleDeleteSection(s.id)}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </IconBtn>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Labs quick-add */}
        <Section title="Labs & Physical Rooms" actions={<Btn variant="secondary" onClick={() => navigate('lab-management')}>Manage Course Mapping →</Btn>}>
          <div>
            <p className="text-xs font-600 text-slate-500 uppercase tracking-wider mb-2">Labs already added ({labs.length})</p>
            {labs.length === 0 && <p className="text-xs text-slate-400">No labs configured yet.</p>}
            <div className="max-h-40 overflow-y-auto rounded-xl border border-white/50 divide-y divide-white/40">
              {labs.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-white/30 transition">
                  <span className="font-500 text-slate-700">{l.name}</span>
                  <Chip tone={l.courseIds.length > 0 ? 'accent' : 'warning'}>
                    {l.courseIds.length === 0 ? 'No courses mapped' : `${l.courseIds.length} course${l.courseIds.length !== 1 ? 's' : ''}`}
                  </Chip>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lab ID" placeholder="e.g. LAB_AIES_3" value={labForm.id} onChange={e => setLabForm({ ...labForm, id: e.target.value })} />
            <Field label="Lab Name" placeholder="e.g. AIES Lab 3" value={labForm.name} onChange={e => setLabForm({ ...labForm, name: e.target.value })} />
          </div>
          <Btn onClick={handleAddLab} disabled={labSaving || !labForm.id || !labForm.name}>{labSaving ? 'Adding…' : 'Add Lab Room'}</Btn>
        </Section>
      </div>

      <Section title="Also configurable">
        <div className="flex flex-wrap gap-3">
          <Btn variant="secondary" onClick={() => navigate('subjects')}>Subject / Syllabus Catalog</Btn>
          <Btn variant="secondary" onClick={() => navigate('faculty')}>Faculty Directory</Btn>
          <Btn variant="secondary" onClick={() => navigate('constraints')}>Period Grid &amp; Working Days</Btn>
        </div>
      </Section>
    </div>
  )
}
