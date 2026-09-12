import { useEffect, useRef, useState } from 'react'
import { PageHeader, Btn, Section, Field, Select, Chip, GlassPanel } from './ui'
import type { Page } from '../types'
import { api, type Lab } from '../api'
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
  ['FAC_GIRIYASAKTHI', 'Mrs. D. K. Giriyasakthi', 'Asst. Professor', 'II', 'III', 'II-K', 'OOP', '23AD1312', 'Object Oriented Programming Paradigm', 'INTEGRATED', '3', '5', '3', '8', '24'],
  ['FAC_GIRIYASAKTHI', 'Mrs. D. K. Giriyasakthi', 'Asst. Professor', 'III', 'V', 'III-B', 'KEIS', '23AD1507', 'Knowledge Engineering and Intelligent Systems', 'INTEGRATED', '3', '3', '2', '8', '24'],
  ['FAC_KAVITHA_MATH', 'Dr. M. Kavitha', 'Professor', 'II', 'III', 'II-I', 'MFAI', '23MA1304', 'Mathematical Foundations for Artificial Intelligence', 'NON_INTEGRATED', '3', '5', '0', '8', '24'],
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

  const [sectionForm, setSectionForm] = useState({ id: '', year: 'II', semester: 'III' })
  const [sectionSaving, setSectionSaving] = useState(false)
  const [sectionMsg, setSectionMsg] = useState<string | null>(null)

  const [labs, setLabs] = useState<Lab[]>([])
  const [labForm, setLabForm] = useState({ id: '', name: '' })
  const [labSaving, setLabSaving] = useState(false)

  useEffect(() => {
    api.labs.list().then(setLabs).catch(() => setLabs([]))
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
    } catch (e) {
      setSectionMsg(e instanceof Error ? e.message : 'Failed to create section')
    } finally {
      setSectionSaving(false)
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
        </Section>

        {/* Labs quick-add */}
        <Section title="Labs & Physical Rooms">
          <div className="flex flex-wrap gap-2">
            {labs.length === 0 && <p className="text-xs text-slate-400">No labs configured yet.</p>}
            {labs.map(l => <Chip key={l.id}>{l.name}</Chip>)}
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
