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
  ['FAC_GIRIYASAKTHI', 'Mrs. D. K. Giriyasakthi', 'Asst. Professor', 'II', 'III', 'II-K', 'OOP', '23AD1312', 'Object Oriented Programming Paradigm', 'INTEGRATED_THEORY', '', '5', '0', '8', '24'],
  ['FAC_GIRIYASAKTHI', 'Mrs. D. K. Giriyasakthi', 'Asst. Professor', 'II', 'III', 'II-K', 'OOP_LAB', '23AD1312L', 'Object Oriented Programming Paradigm Laboratory', 'INTEGRATED_LAB', '3', '0', '3', '8', '24'],
  // Same faculty, same subject, a different section -- one more row, not a
  // new faculty record. This is how one teacher covers 3-4 sections.
  ['FAC_GIRIYASAKTHI', 'Mrs. D. K. Giriyasakthi', 'Asst. Professor', 'II', 'III', 'II-L', 'OOP', '23AD1312', 'Object Oriented Programming Paradigm', 'INTEGRATED_THEORY', '', '5', '0', '8', '24'],
  ['FAC_KAVITHA_MATH', 'Dr. M. Kavitha', 'Professor', 'II', 'III', 'II-I', 'MFAI', '23MA1304', 'Mathematical Foundations for Artificial Intelligence', 'THEORY_ONLY', '', '5', '0', '8', '24'],
]

const SUBJECT_TEMPLATE_HEADERS = ['CourseId', 'CourseName', 'ComponentType', 'WeeklyPeriods', 'LabBlockLength']
const SUBJECT_TEMPLATE_ROWS = [
  ['OOP', 'Object Oriented Programming Paradigm', 'INTEGRATED_THEORY', '5', ''],
  ['OOP_LAB', 'Object Oriented Programming Paradigm Laboratory', 'INTEGRATED_LAB', '3', '3'],
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

function downloadSubjectTemplate() {
  const csv = [SUBJECT_TEMPLATE_HEADERS.join(','), ...SUBJECT_TEMPLATE_ROWS.map(row => row.join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'scedular_subject_template.csv'
  link.click()
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
  const subjectInputRef = useRef<HTMLInputElement>(null)
  const [subjectImporting, setSubjectImporting] = useState(false)
  const [subjectImportResult, setSubjectImportResult] = useState<WorkloadImportResult | null>(null)

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

  async function handleSubjectFile(file: File) {
    setSubjectImporting(true)
    setError(null)
    setSubjectImportResult(null)
    try {
      setSubjectImportResult(await api.importSubjects(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Subject import failed')
    } finally {
      setSubjectImporting(false)
      if (subjectInputRef.current) subjectInputRef.current.value = ''
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

  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  async function handleResetAllData() {
    if (!confirm('Are you sure you want to delete ALL existing dataset rows (sections, subjects, faculty, labs, assignments)? This will wipe all data so you can re-upload fresh.')) return
    setResetting(true)
    setResetMsg(null)
    try {
      await api.importMaster.reset()
      setResetMsg('✓ All existing data has been deleted. Ready for fresh Excel re-upload!')
      loadSectionsAndLabs()
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : 'Failed to reset data')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Data & Import Hub">
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetAllData}
            disabled={resetting}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-700 text-rose-700 bg-rose-400/15 border border-rose-300/40 hover:bg-rose-400/25 transition disabled:opacity-50 cursor-pointer"
          >
            {resetting ? 'Deleting Data…' : '🗑️ Delete All Existing Data'}
          </button>
          <BackBtn navigate={navigate} />
        </div>
      </PageHeader>

      {resetMsg && (
        <div className="bg-emerald-400/15 border border-emerald-300/40 text-emerald-800 font-600 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
          <span>{resetMsg}</span>
          <Btn onClick={() => navigate('upload-curriculum')}>Go to Master Upload →</Btn>
        </div>
      )}

      <GlassPanel className="p-5">
        <p className="text-sm font-500 text-slate-700 mb-1.5">How this feeds a balanced timetable</p>
        <ul className="text-xs text-slate-500 space-y-1 leading-relaxed list-disc pl-4">
          <li>Use <strong className="text-slate-600 font-600">Master Excel Import</strong> for a complete dataset.</li>
          <li>An integrated subject stays <strong className="text-slate-600 font-600">one subject</strong>; its theory and lab requirements are defined in SECTION_SUBJECTS.</li>
          <li>Teaching assignments separately identify the faculty, section, component and optional lab batch.</li>
          <li>Labs are physical resources and can be mapped to multiple compatible subjects through LAB_MAPPING.</li>
          <li>Invalid workbooks are blocked before import; confirmed imports replace the canonical dataset transactionally.</li>
        </ul>
      </GlassPanel>

      <GlassPanel className="p-6 border border-white/70">
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider font-700 text-slate-500">Recommended import path</p>
            <h2 className="font-display font-800 text-2xl text-slate-900 mt-1">Master Excel Dataset</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">Subjects, section requirements, faculty, teaching assignments, labs and availability now belong to one validated workbook. SCEDULAR previews the complete dataset first and only commits it after you confirm.</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {['SECTIONS','SUBJECTS','SECTION_SUBJECTS','FACULTY','TEACHING_ASSIGNMENTS','LABS','LAB_MAPPING'].map(name => <Chip key={name}>{name}</Chip>)}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleResetAllData}
              disabled={resetting}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-700 text-rose-700 bg-rose-400/15 border border-rose-300/40 hover:bg-rose-400/25 transition disabled:opacity-50 cursor-pointer"
            >
              Clear / Reset All Data
            </button>
            <Btn onClick={() => navigate('upload-curriculum')}>Open Master Import →</Btn>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <p className="text-xs text-slate-500 leading-relaxed">💡 The older row-based workload and subject import controls are intentionally no longer promoted here. They remain available only through their legacy routes while the migration is completed.</p>
      </GlassPanel>

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
