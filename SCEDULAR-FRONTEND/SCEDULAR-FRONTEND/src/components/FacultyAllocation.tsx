import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Page } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────
type SubjectEntry = {
  code: string
  name: string
  difficulty: 'Normal' | 'Tough'
  previousYear?: string
  relatedLab?: string
  type: 'theory' | 'lab'
  sem: 'odd' | 'even'
  year: number
}

type FacultyRecord = {
  id: string
  name: string
  department: string
  designation: string
  prevExp: number
  currExp: number
  previouslyHandled: { year: string; semester: string; subject: string; type: string }[]
}

// ── Static data ────────────────────────────────────────────────────────────
const facultyList: FacultyRecord[] = [
  { id: 'F001', name: 'Dr. J. Suganya Devi', department: 'Artificial Intelligence and Data Science', designation: 'Associate Professor', prevExp: 8, currExp: 7,
    previouslyHandled: [
      { year: '2025–26', semester: 'Odd', subject: 'Machine Learning', type: 'Theory' },
      { year: '2024–25', semester: 'Even', subject: 'DBMS', type: 'Theory' },
      { year: '2024–25', semester: 'Even', subject: 'DBMS Laboratory', type: 'Lab' },
      { year: '2023–24', semester: 'Odd', subject: 'Deep Learning', type: 'Theory' },
    ] },
  { id: 'F002', name: 'Dr. R. Krishnamurthy', department: 'Computer Science and Engineering', designation: 'Professor', prevExp: 10, currExp: 6,
    previouslyHandled: [
      { year: '2025–26', semester: 'Odd', subject: 'Advanced Algorithms', type: 'Theory' },
      { year: '2024–25', semester: 'Even', subject: 'Operating Systems', type: 'Theory' },
    ] },
  { id: 'F003', name: 'Ms. T. Deepika', department: 'Artificial Intelligence and Data Science', designation: 'Assistant Professor', prevExp: 2, currExp: 4,
    previouslyHandled: [
      { year: '2025–26', semester: 'Odd', subject: 'Programming Fundamentals', type: 'Theory' },
      { year: '2024–25', semester: 'Even', subject: 'Mathematics II', type: 'Theory' },
    ] },
  { id: 'F004', name: 'Dr. V. Lakshmi', department: 'Computer Science and Engineering', designation: 'Associate Professor', prevExp: 5, currExp: 9,
    previouslyHandled: [
      { year: '2025–26', semester: 'Even', subject: 'Natural Language Processing', type: 'Theory' },
      { year: '2024–25', semester: 'Odd', subject: 'Computer Vision', type: 'Theory' },
    ] },
  { id: 'F005', name: 'Mr. S. Arumugam', department: 'Artificial Intelligence and Data Science', designation: 'Assistant Professor', prevExp: 0, currExp: 5,
    previouslyHandled: [{ year: '2025–26', semester: 'Odd', subject: 'Data Structures', type: 'Theory' }] },
]

const subjectDB: SubjectEntry[] = [
  // I Year Odd
  { code: '23AD1101', name: 'Programming Fundamentals', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 1, relatedLab: 'Programming Lab' },
  { code: '23AD1102', name: 'Mathematics I', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 1 },
  { code: '23AD1103', name: 'Data Structures', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 1, relatedLab: 'DS Lab' },
  { code: '23AD1104', name: 'Python Programming', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 1, relatedLab: 'Python Lab' },
  { code: '23AD1105', name: 'Computer Organization', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 1 },
  { code: '23AD1L01', name: 'Programming Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 1 },
  { code: '23AD1L02', name: 'DS Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 1 },
  { code: '23AD1L03', name: 'Python Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 1 },
  // I Year Even
  { code: '23AD1201', name: 'Mathematics II', difficulty: 'Normal', type: 'theory', sem: 'even', year: 1 },
  { code: '23AD1202', name: 'Digital Systems', difficulty: 'Normal', type: 'theory', sem: 'even', year: 1, relatedLab: 'Digital Lab' },
  { code: '23AD1203', name: 'C Programming', difficulty: 'Normal', type: 'theory', sem: 'even', year: 1, relatedLab: 'C Lab' },
  { code: '23AD1204', name: 'Discrete Mathematics', difficulty: 'Normal', type: 'theory', sem: 'even', year: 1 },
  { code: '23AD1205', name: 'Introduction to AI', difficulty: 'Normal', type: 'theory', sem: 'even', year: 1 },
  { code: '23AD1L04', name: 'Digital Lab', difficulty: 'Normal', type: 'lab', sem: 'even', year: 1 },
  { code: '23AD1L05', name: 'C Lab', difficulty: 'Normal', type: 'lab', sem: 'even', year: 1 },
  // II Year Odd
  { code: '23AD2101', name: 'DBMS', difficulty: 'Normal', previousYear: '2024', type: 'theory', sem: 'odd', year: 2, relatedLab: 'DBMS Laboratory' },
  { code: '23AD2102', name: 'Data Structures & Algorithms', difficulty: 'Tough', type: 'theory', sem: 'odd', year: 2, relatedLab: 'DSA Lab' },
  { code: '23AD2103', name: 'Object Oriented Programming', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 2, relatedLab: 'OOP Lab' },
  { code: '23AD2104', name: 'Computer Networks', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 2 },
  { code: '23AD2105', name: 'Operating Systems', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 2, relatedLab: 'OS Lab' },
  { code: '23AD2L01', name: 'DBMS Laboratory', difficulty: 'Normal', previousYear: '2024', type: 'lab', sem: 'odd', year: 2 },
  { code: '23AD2L02', name: 'DSA Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 2 },
  { code: '23AD2L03', name: 'OOP Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 2 },
  { code: '23AD2L04', name: 'OS Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 2 },
  // II Year Even
  { code: '23AD2201', name: 'Advanced Algorithms', difficulty: 'Tough', type: 'theory', sem: 'even', year: 2 },
  { code: '23AD2202', name: 'Probability & Statistics', difficulty: 'Normal', type: 'theory', sem: 'even', year: 2 },
  { code: '23AD2203', name: 'Compiler Design', difficulty: 'Tough', type: 'theory', sem: 'even', year: 2, relatedLab: 'Compiler Lab' },
  { code: '23AD2204', name: 'Software Engineering', difficulty: 'Normal', type: 'theory', sem: 'even', year: 2 },
  { code: '23AD2205', name: 'Web Technologies', difficulty: 'Normal', type: 'theory', sem: 'even', year: 2, relatedLab: 'Web Tech Lab' },
  { code: '23AD2L05', name: 'Compiler Lab', difficulty: 'Normal', type: 'lab', sem: 'even', year: 2 },
  { code: '23AD2L06', name: 'Web Tech Lab', difficulty: 'Normal', type: 'lab', sem: 'even', year: 2 },
  // III Year Odd
  { code: '23AD3101', name: 'Machine Learning', difficulty: 'Tough', previousYear: '2025', type: 'theory', sem: 'odd', year: 3, relatedLab: 'ML Laboratory' },
  { code: '23AD3102', name: 'Deep Learning', difficulty: 'Tough', previousYear: '2023', type: 'theory', sem: 'odd', year: 3, relatedLab: 'Deep Learning Lab' },
  { code: '23AD3103', name: 'Data Mining', difficulty: 'Tough', type: 'theory', sem: 'odd', year: 3, relatedLab: 'Data Mining Lab' },
  { code: '23AD3104', name: 'Web Technologies', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 3, relatedLab: 'Web Tech Lab 2' },
  { code: '23AD3105', name: 'OOP Advanced', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 3 },
  { code: '23AD3L01', name: 'ML Laboratory', difficulty: 'Normal', previousYear: '2025', type: 'lab', sem: 'odd', year: 3 },
  { code: '23AD3L02', name: 'Deep Learning Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 3 },
  { code: '23AD3L03', name: 'Data Mining Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 3 },
  { code: '23AD3L04', name: 'Web Tech Lab 2', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 3 },
  // III Year Even
  { code: '23AD3201', name: 'Natural Language Processing', difficulty: 'Tough', type: 'theory', sem: 'even', year: 3, relatedLab: 'NLP Laboratory' },
  { code: '23AD3202', name: 'Computer Vision', difficulty: 'Tough', type: 'theory', sem: 'even', year: 3, relatedLab: 'CV Laboratory' },
  { code: '23AD3203', name: 'Software Engineering', difficulty: 'Normal', type: 'theory', sem: 'even', year: 3 },
  { code: '23AD3204', name: 'Cloud Fundamentals', difficulty: 'Normal', type: 'theory', sem: 'even', year: 3, relatedLab: 'Cloud Lab' },
  { code: '23AD3205', name: 'Microprocessors', difficulty: 'Normal', type: 'theory', sem: 'even', year: 3 },
  { code: '23AD3L05', name: 'NLP Laboratory', difficulty: 'Normal', type: 'lab', sem: 'even', year: 3 },
  { code: '23AD3L06', name: 'CV Laboratory', difficulty: 'Normal', type: 'lab', sem: 'even', year: 3 },
  { code: '23AD3L07', name: 'Cloud Lab', difficulty: 'Normal', type: 'lab', sem: 'even', year: 3 },
  // IV Year Odd
  { code: '23AD4101', name: 'Advanced Machine Learning', difficulty: 'Tough', previousYear: '2025', type: 'theory', sem: 'odd', year: 4, relatedLab: 'Advanced ML Lab' },
  { code: '23AD4102', name: 'Deep Learning Advanced', difficulty: 'Tough', type: 'theory', sem: 'odd', year: 4, relatedLab: 'DL Lab' },
  { code: '23AD4103', name: 'Natural Language Processing', difficulty: 'Tough', type: 'theory', sem: 'odd', year: 4, relatedLab: 'NLP Lab' },
  { code: '23AD4104', name: 'Computer Vision', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 4, relatedLab: 'CV Lab' },
  { code: '23AD4105', name: 'Big Data Analytics', difficulty: 'Normal', type: 'theory', sem: 'odd', year: 4 },
  { code: '23AD4106', name: 'Advanced AI', difficulty: 'Tough', type: 'theory', sem: 'odd', year: 4 },
  { code: '23AD4L01', name: 'Advanced ML Lab', difficulty: 'Normal', previousYear: '2025', type: 'lab', sem: 'odd', year: 4 },
  { code: '23AD4L02', name: 'DL Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 4 },
  { code: '23AD4L03', name: 'NLP Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 4 },
  { code: '23AD4L04', name: 'CV Lab', difficulty: 'Normal', type: 'lab', sem: 'odd', year: 4 },
  // IV Year Even
  { code: '23AD4201', name: 'Cloud Computing', difficulty: 'Normal', type: 'theory', sem: 'even', year: 4, relatedLab: 'Cloud Computing Lab' },
  { code: '23AD4202', name: 'Edge AI', difficulty: 'Tough', type: 'theory', sem: 'even', year: 4 },
  { code: '23AD4203', name: 'IoT Systems', difficulty: 'Normal', type: 'theory', sem: 'even', year: 4, relatedLab: 'IoT Lab' },
  { code: '23AD4204', name: 'Blockchain Technology', difficulty: 'Tough', type: 'theory', sem: 'even', year: 4 },
  { code: '23AD4205', name: 'Mobile Computing', difficulty: 'Normal', type: 'theory', sem: 'even', year: 4 },
  { code: '23AD4L05', name: 'Cloud Computing Lab', difficulty: 'Normal', type: 'lab', sem: 'even', year: 4 },
  { code: '23AD4L06', name: 'IoT Lab', difficulty: 'Normal', type: 'lab', sem: 'even', year: 4 },
]

// Year sections rendered IV→I; each section's first option number:
// twoOptions: IV=1,2 | III=3,4 | II=5,6 | I=7,8
// oneOption:  IV=1   | III=2   | II=3   | I=4
const YEAR_ORDER = [4, 3, 2, 1] as const
const YEAR_LABELS: Record<number, string> = { 4: 'IV Year', 3: 'III Year', 2: 'II Year', 1: 'I Year' }

function optStart(year: number, twoOptions: boolean): number {
  if (twoOptions) return ({ 4: 1, 3: 3, 2: 5, 1: 7 } as Record<number, number>)[year]
  return ({ 4: 1, 3: 2, 2: 3, 1: 4 } as Record<number, number>)[year]
}

// ── Faculty picker ─────────────────────────────────────────────────────────
function FacultyPicker({ value, onChange }: { value: FacultyRecord | null; onChange: (f: FacultyRecord | null) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = facultyList.filter(f =>
    f.name.toLowerCase().includes(query.toLowerCase()) ||
    f.id.toLowerCase().includes(query.toLowerCase()) ||
    f.department.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center gap-3 border rounded-xl px-4 py-3 bg-white cursor-pointer transition ${open ? 'border-[#0F4C81] ring-2 ring-[#0F4C81]/15' : 'border-slate-200 hover:border-slate-300'}`}
        onClick={() => setOpen(o => !o)}
      >
        {value ? (
          <>
            <div className="w-8 h-8 bg-[#0F4C81] rounded-lg flex items-center justify-center text-white text-xs font-700 flex-shrink-0">
              {value.name.split(' ').filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-600 text-slate-800 truncate">{value.name}</p>
              <p className="text-xs text-slate-400 truncate">{value.id} · {value.designation}</p>
            </div>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" /></svg>
            <span className="text-sm text-slate-400">Search faculty by name, ID, or department…</span>
          </>
        )}
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </div>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Type to search…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
              onClick={e => e.stopPropagation()} />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No faculty found</p>
            ) : filtered.map(f => {
              const total = f.prevExp + f.currExp
              return (
                <div key={f.id}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 transition ${value?.id === f.id ? 'bg-blue-50' : ''}`}
                  onClick={() => { onChange(f); setOpen(false); setQuery('') }}>
                  <div className="w-8 h-8 bg-[#0F4C81] rounded-lg flex items-center justify-center text-white text-xs font-700 flex-shrink-0">
                    {f.name.split(' ').filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-slate-800">{f.name}</p>
                    <p className="text-xs text-slate-400 truncate">{f.id} · {f.department}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-600 flex-shrink-0 ${total >= 13 ? 'bg-[#0F4C81]/10 text-[#0F4C81]' : 'bg-slate-100 text-slate-500'}`}>
                    {total} yrs
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single theory option dropdown ─────────────────────────────────────────
function TheoryDropdown({ optionNum, subjects, totalExp, value, onChange, onDetails, sections, onSectionsChange }: {
  optionNum: number; subjects: SubjectEntry[]; totalExp: number
  value: string; onChange: (code: string) => void; onDetails: (s: SubjectEntry) => void
  sections: number; onSectionsChange: (n: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = subjects.find(s => s.code === value) ?? null

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        containerRef.current && !containerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function openDropdown() {
    if (!triggerRef.current) { setOpen(o => !o); return }
    const rect = triggerRef.current.getBoundingClientRect()
    const dropH = 280
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUp = spaceBelow < dropH && spaceAbove > spaceBelow

    const style: React.CSSProperties = {
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 340),
      maxWidth: 480,
      zIndex: 9999,
    }
    if (openUp) {
      style.bottom = window.innerHeight - rect.top + 4
    } else {
      style.top = rect.bottom + 4
    }
    setDropStyle(style)
    setOpen(o => !o)
  }

  const dropdown = open ? createPortal(
    <div
      ref={containerRef}
      style={dropStyle}
      className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
        <div
          className="px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer"
          onClick={() => { onChange(''); setOpen(false) }}
        >
          — No selection —
        </div>
        {subjects.map(sub => {
          const locked = sub.difficulty === 'Tough' && totalExp < 13
          return (
            <div
              key={sub.code}
              className={`flex items-start gap-3 px-4 py-3 transition ${locked ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-blue-50 cursor-pointer'} ${value === sub.code ? 'bg-blue-50' : ''}`}
              onClick={() => { if (!locked) { onChange(sub.code); setOpen(false) } }}
            >
              <span className="flex-shrink-0 w-5 text-center text-sm mt-0.5">{locked ? '🔒' : sub.difficulty === 'Tough' ? '★' : ''}</span>
              <div className="flex-1">
                <p className={`text-sm font-500 leading-snug ${locked ? 'text-slate-400' : 'text-slate-800'}`}>{sub.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-slate-400 font-mono">{sub.code}</span>
                  {sub.relatedLab && <span className="text-xs text-teal-600 font-500">🧪 Lab Required</span>}
                  {sub.difficulty === 'Tough' && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-600 ${locked ? 'bg-red-50 text-red-400' : 'bg-amber-50 text-amber-600'}`}>
                      {locked ? 'Experienced Only' : 'Tough'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div className="flex-1">
      <label className="text-xs text-slate-500 font-600 mb-1.5 flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center w-5 h-5 bg-[#0F4C81] text-white rounded text-xs font-700">{optionNum}</span>
        Option {optionNum}
      </label>
      <div>
        {/* Trigger */}
        <div
          ref={triggerRef}
          className={`border rounded-lg px-3 pt-2.5 pb-2 bg-white cursor-pointer transition ${open ? 'border-[#0F4C81] ring-2 ring-[#0F4C81]/15' : 'border-slate-200 hover:border-slate-300'}`}
          onClick={openDropdown}
        >
          {selected ? (
            <div className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-slate-800 leading-snug" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {selected.difficulty === 'Tough' && <span className="text-amber-500 mr-1">★</span>}
                  {selected.name}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-slate-400 font-mono">{selected.code}</span>
                  {selected.relatedLab && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 font-600">🧪 Lab Required</span>
                  )}
                  <button
                    className="text-xs text-[#0F4C81] font-600 hover:underline"
                    onClick={e => { e.stopPropagation(); onDetails(selected) }}
                  >
                    Details
                  </button>
                </div>
              </div>
              <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm text-slate-400">Select subject…</span>
              <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </div>
          )}
        </div>

        {/* Sections counter */}
        {selected && (
          <div className="flex items-center gap-2 mt-2 px-1">
            <span className="text-xs text-slate-500 font-600">Sections:</span>
            <button
              onClick={() => onSectionsChange(Math.max(1, sections - 1))}
              className="w-6 h-6 rounded bg-slate-100 hover:bg-[#0F4C81] hover:text-white text-slate-600 text-sm font-700 flex items-center justify-center transition"
            >−</button>
            <span className="text-sm font-800 text-[#0F4C81] w-6 text-center">{sections}</span>
            <button
              onClick={() => onSectionsChange(Math.min(5, sections + 1))}
              className="w-6 h-6 rounded bg-slate-100 hover:bg-[#0F4C81] hover:text-white text-slate-600 text-sm font-700 flex items-center justify-center transition"
            >+</button>
            <span className="text-xs text-slate-400">{sections === 1 ? 'section' : 'sections'}</span>
          </div>
        )}
      </div>
      {dropdown}
    </div>
  )
}

// ── Subject detail side panel ──────────────────────────────────────────────
function SubjectDetailPanel({ sub, onClose }: { sub: SubjectEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/25 flex items-center justify-end z-50" onClick={onClose}>
      <div className="bg-white w-80 h-full overflow-auto shadow-2xl p-6 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display font-700 text-base text-slate-800">Subject Details</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">✕</button>
        </div>
        <div className="flex-1 divide-y divide-slate-50">
          {([
            ['Subject Code', sub.code],
            ['Subject Name', sub.name],
            ['Year', YEAR_LABELS[sub.year]],
            ['Semester', sub.sem === 'odd' ? 'Odd' : 'Even'],
            ['Type', sub.type === 'theory' ? 'Theory' : 'Laboratory'],
            ['Difficulty', sub.difficulty === 'Tough' ? '★  Tough' : 'Normal'],
            ['Exp. Requirement', sub.difficulty === 'Tough' ? '13+ Years' : 'No restriction'],
            ['Previously Handled', sub.previousYear ? `Yes – ${sub.previousYear}` : 'No'],
            ...(sub.relatedLab ? [['Related Laboratory', `🧪 ${sub.relatedLab}`] as [string, string]] : []),
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex gap-3 py-2.5">
              <span className="text-xs text-slate-400 w-32 flex-shrink-0 pt-0.5">{k}</span>
              <span className={`text-sm font-500 ${k === 'Related Laboratory' ? 'text-teal-700' : 'text-slate-700'}`}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-6 w-full py-2.5 border border-slate-200 text-slate-600 text-sm font-600 rounded-lg hover:bg-slate-50 transition">Close</button>
      </div>
    </div>
  )
}

// ── Required lab card ─────────────────────────────────────────────────────
type RequiredLab = { optNum: number; theoryCode: string; theoryName: string; lab: SubjectEntry; confirmed: boolean }

function LabRequirementCard({ req, onConfirm, onDetails }: {
  req: RequiredLab; onConfirm: (n: number, v: boolean) => void; onDetails: (s: SubjectEntry) => void
}) {
  return (
    <div className={`rounded-xl border p-4 transition ${req.confirmed ? 'border-teal-200 bg-teal-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
        <span className="inline-flex items-center justify-center w-5 h-5 bg-[#0F4C81] text-white rounded text-xs font-700 flex-shrink-0">{req.optNum}</span>
        <span className="font-500 text-slate-600">Theory Option {req.optNum}</span>
        <span className="text-slate-300">→</span>
        <span className="font-600 text-slate-700">{req.theoryName}</span>
        <span className="text-slate-300">→</span>
        <span className="font-600 text-teal-700">🧪 {req.lab.name}</span>
        <span className={`ml-auto text-xs font-700 px-2 py-0.5 rounded-full ${req.confirmed ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>
          {req.confirmed ? '✓ Completed' : '⚠ Required'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center text-teal-600 text-sm flex-shrink-0">🔬</div>
          <div>
            <p className="text-sm font-600 text-slate-800">{req.lab.name}</p>
            <p className="text-xs text-slate-400 font-mono">{req.lab.code} · {YEAR_LABELS[req.lab.year]} · {req.lab.sem === 'odd' ? 'Odd' : 'Even'} Sem</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="text-xs text-[#0F4C81] font-600 hover:underline" onClick={() => onDetails(req.lab)}>Details</button>
          <button onClick={() => onConfirm(req.optNum, !req.confirmed)}
            className={`px-3 py-1.5 rounded-lg text-xs font-700 transition ${req.confirmed ? 'bg-teal-100 text-teal-700 hover:bg-teal-200' : 'bg-[#0F4C81] text-white hover:bg-[#0a3860]'}`}>
            {req.confirmed ? '✓ Selected' : 'Select Lab'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Year section in Theory tab ─────────────────────────────────────────────
function YearSection({ yearNum, semester, twoOptions, totalExp, theorySelections, onSelect, onSectionsChange, onDetails }: {
  yearNum: number; semester: 'odd' | 'even'; twoOptions: boolean; totalExp: number
  theorySelections: Record<number, { code: string; sections: number }>
  onSelect: (optNum: number, code: string) => void
  onSectionsChange: (optNum: number, sections: number) => void
  onDetails: (s: SubjectEntry) => void
}) {
  const start = optStart(yearNum, twoOptions)
  const slots = twoOptions ? [start, start + 1] : [start]
  const subjects = subjectDB.filter(s => s.type === 'theory' && s.sem === semester && s.year === yearNum)
  const semLabel = semester === 'odd' ? 'Odd Semester' : 'Even Semester'

  return (
    <div className="border border-slate-200 rounded-xl">
      <div className="bg-[#0F4C81] px-5 py-3 flex items-center justify-between rounded-t-xl">
        <div>
          <span className="font-display font-800 text-white text-sm">{YEAR_LABELS[yearNum]}</span>
          <span className="text-blue-200 text-xs ml-2">– {semLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {slots.map(n => (
            <span key={n} className="inline-flex items-center gap-1 bg-white/15 text-white text-xs px-2 py-0.5 rounded-full">
              <span className="w-4 h-4 bg-white text-[#0F4C81] rounded text-xs font-700 flex items-center justify-center">{n}</span>
              Option {n}
            </span>
          ))}
        </div>
      </div>

      <div className="p-5 bg-white">
        {subjects.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No theory subjects available for this semester</p>
        ) : (
          <div className={`grid gap-5 ${twoOptions ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {slots.map(optNum => (
              <TheoryDropdown
                key={optNum}
                optionNum={optNum}
                subjects={subjects}
                totalExp={totalExp}
                value={theorySelections[optNum]?.code ?? ''}
                onChange={code => onSelect(optNum, code)}
                onDetails={onDetails}
                sections={theorySelections[optNum]?.sections ?? 1}
                onSectionsChange={n => onSectionsChange(optNum, n)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function FacultyAllocation({ navigate }: { navigate: (p: Page) => void }) {
  const [faculty, setFaculty] = useState<FacultyRecord | null>(null)
  const [academicYear, setAcademicYear] = useState('')
  const [semester, setSemester] = useState<'odd' | 'even'>('odd')
  const [semesterNum, setSemesterNum] = useState('')
  const [subjectTab, setSubjectTab] = useState<'theory' | 'lab'>('theory')
  const [theorySelections, setTheorySelections] = useState<Record<number, { code: string; sections: number }>>({})
  const [labConfirmed, setLabConfirmed] = useState<Record<number, boolean>>({})
  const [detailSub, setDetailSub] = useState<SubjectEntry | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [validationMsg, setValidationMsg] = useState('')

  const totalExp = faculty ? faculty.prevExp + faculty.currExp : 0
  const twoOptions = totalExp >= 13

  function changeFaculty(f: FacultyRecord | null) {
    setFaculty(f)
    setTheorySelections({})
    setLabConfirmed({})
    setSubmitted(false)
    setValidationMsg('')
    setSubjectTab('theory')
    setAcademicYear('')
  }

  function setTheoryOption(optNum: number, code: string) {
    if (!code) {
      setTheorySelections(prev => { const n = { ...prev }; delete n[optNum]; return n })
    } else {
      setTheorySelections(prev => ({ ...prev, [optNum]: { code, sections: prev[optNum]?.sections ?? 1 } }))
    }
    setLabConfirmed(prev => { const n = { ...prev }; delete n[optNum]; return n })
    setValidationMsg('')
  }

  function setSections(optNum: number, sections: number) {
    setTheorySelections(prev => prev[optNum] ? { ...prev, [optNum]: { ...prev[optNum], sections } } : prev)
  }

  function confirmLab(optNum: number, confirmed: boolean) {
    setLabConfirmed(prev => ({ ...prev, [optNum]: confirmed }))
    setValidationMsg('')
  }

  // Derive required labs
  const requiredLabs: RequiredLab[] = Object.entries(theorySelections)
    .filter(([, sel]) => !!sel?.code)
    .flatMap(([optNumStr, sel]) => {
      const optNum = Number(optNumStr)
      const sub = subjectDB.find(s => s.code === sel.code)
      if (!sub?.relatedLab) return []
      const lab = subjectDB.find(s => s.name === sub.relatedLab && s.type === 'lab' && s.year === sub.year && s.sem === sub.sem)
      if (!lab) return []
      return [{ optNum, theoryCode: sel.code, theoryName: sub.name, lab, confirmed: !!labConfirmed[optNum] }]
    })
    .sort((a, b) => a.optNum - b.optNum)

  const totalRequired = requiredLabs.length
  const totalCompleted = requiredLabs.filter(r => r.confirmed).length
  const totalPending = totalRequired - totalCompleted
  const allLabsDone = totalPending === 0

  const allOptNums = twoOptions ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4]
  const anyTheorySelected = allOptNums.some(n => theorySelections[n]?.code)

  function handleSubmit() {
    if (!academicYear) { setValidationMsg('Please select an Academic Year before submitting.'); return }
    if (!anyTheorySelected) { setValidationMsg('Please select at least one Theory subject before submitting.'); return }
    if (!allLabsDone) {
      const pending = requiredLabs.filter(r => !r.confirmed)
      setValidationMsg(`Please complete all required laboratory selections before submitting. Pending: ${pending.map(r => r.theoryName).join(', ')}.`)
      setSubjectTab('lab')
      return
    }
    setShowConfirm(true)
  }

  // Summary entries
  const summaryEntries = allOptNums
    .map(n => {
      const sel = theorySelections[n]
      if (!sel?.code) return null
      const sub = subjectDB.find(s => s.code === sel.code)
      if (!sub) return null
      const reqLab = requiredLabs.find(r => r.optNum === n)
      return { optNum: n, sub, reqLab, year: sub.year, sections: sel.sections }
    })
    .filter(Boolean) as { optNum: number; sub: SubjectEntry; reqLab?: RequiredLab; year: number; sections: number }[]

  const chevronDown = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`

  const formReady = !!faculty && !!academicYear

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('dashboard')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-500 text-slate-600 hover:bg-slate-100 border border-slate-200 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div>
            <h1 className="font-display font-800 text-lg text-[#0F4C81]">Faculty Subject Option Selection</h1>
            <p className="text-xs text-slate-400">All four years displayed after selecting Academic Year and Semester</p>
          </div>
        </div>
        {submitted && <span className="bg-green-100 text-green-700 text-xs font-700 px-3 py-1 rounded-full border border-green-200">✓ SUBMITTED</span>}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-5 space-y-4 max-w-screen-xl mx-auto">

          {/* Faculty picker */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <label className="text-xs font-700 text-slate-500 uppercase tracking-wider mb-2 block">Select Faculty</label>
            <FacultyPicker value={faculty} onChange={changeFaculty} />
          </div>

          {faculty && (
            <>
              {/* Faculty info */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#0F4C81] rounded-xl flex items-center justify-center text-white font-800 font-display text-lg flex-shrink-0">
                      {faculty.name.split(' ').filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('')}
                    </div>
                    <div>
                      <p className="font-display font-700 text-base text-slate-800">{faculty.name}</p>
                      <p className="text-sm text-slate-500">{faculty.department}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{faculty.designation} · {faculty.id}</p>
                    </div>
                  </div>
                  <span className="bg-[#0F4C81] text-white text-xs font-700 px-3 py-1 rounded-full whitespace-nowrap">
                    Eligible for {twoOptions ? 2 : 1} Option{twoOptions ? 's' : ''} per Year
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">Previous College</p>
                    <p className="font-display font-700 text-xl text-slate-700">{faculty.prevExp} <span className="text-sm font-500">Yrs</span></p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">Current College</p>
                    <p className="font-display font-700 text-xl text-slate-700">{faculty.currExp} <span className="text-sm font-500">Yrs</span></p>
                  </div>
                  <div className="bg-[#0F4C81]/8 rounded-lg p-3 text-center border border-[#0F4C81]/20">
                    <p className="text-xs text-[#0F4C81] font-600 mb-1">Total Experience</p>
                    <p className="font-display font-800 text-xl text-[#0F4C81]">{totalExp} <span className="text-sm font-500">Yrs</span></p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-400">13+ Years → 2 options per year &nbsp;|&nbsp; Below 13 Years → 1 option per year</p>
              </div>

              {/* Academic Year + Semester + Semester Number */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                <div className="grid grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-600 text-slate-500 mb-1.5">Academic Year</label>
                    <select value={academicYear} onChange={e => setAcademicYear(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 appearance-none cursor-pointer"
                      style={{ backgroundImage: chevronDown, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                      <option value="">Select Academic Year</option>
                      {['2024–2025', '2025–2026', '2026–2027', '2027–2028', '2028–2029'].map(y => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-600 text-slate-500 mb-1.5">Semester</label>
                    <select value={semester} onChange={e => { setSemester(e.target.value as 'odd' | 'even'); setTheorySelections({}); setLabConfirmed({}) }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 appearance-none cursor-pointer"
                      style={{ backgroundImage: chevronDown, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                      <option value="odd">Odd Semester</option>
                      <option value="even">Even Semester</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-600 text-slate-500 mb-1.5">Semester Number</label>
                    <select value={semesterNum} onChange={e => setSemesterNum(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 appearance-none cursor-pointer"
                      style={{ backgroundImage: chevronDown, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                      <option value="">Select Semester No.</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>Semester {n}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Main area */}
              <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 300px' }}>
                {/* Left: form */}
                <div className="space-y-4">

                  {/* Validation */}
                  {validationMsg && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                      <span className="text-red-500 flex-shrink-0 mt-0.5">⚠</span>
                      <p className="text-sm text-red-700 font-500 flex-1">{validationMsg}</p>
                      <button className="text-red-400 hover:text-red-600 flex-shrink-0" onClick={() => setValidationMsg('')}>✕</button>
                    </div>
                  )}

                  {/* Theory / Lab tabs */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex border-b border-slate-100">
                      <button onClick={() => setSubjectTab('theory')}
                        className={`flex-1 py-3 text-sm font-600 uppercase tracking-wider transition ${subjectTab === 'theory' ? 'text-[#0F4C81] border-b-2 border-[#0F4C81] bg-blue-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                        📚 Theory — All Years
                      </button>
                      <button onClick={() => setSubjectTab('lab')}
                        className={`flex-1 py-3 text-sm font-600 uppercase tracking-wider transition relative ${subjectTab === 'lab' ? 'text-teal-700 border-b-2 border-teal-600 bg-teal-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                        🔬 Laboratory Requirements
                        {totalPending > 0 && <span className="absolute top-2 right-8 bg-amber-500 text-white text-xs font-700 w-4 h-4 rounded-full flex items-center justify-center">{totalPending}</span>}
                        {totalRequired > 0 && totalPending === 0 && <span className="absolute top-2 right-8 bg-teal-500 text-white text-xs font-700 w-4 h-4 rounded-full flex items-center justify-center">✓</span>}
                      </button>
                    </div>

                    {/* THEORY: all 4 years stacked */}
                    {subjectTab === 'theory' && (
                      <div className="p-5 space-y-4">
                        {!formReady ? (
                          <div className="text-center py-8">
                            <p className="text-2xl mb-2">📋</p>
                            <p className="text-sm font-600 text-slate-600 mb-1">Select Academic Year and Semester</p>
                            <p className="text-xs text-slate-400">All four year sections will appear here automatically</p>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex-1 h-px bg-slate-100" />
                              <span className="text-xs text-slate-400 whitespace-nowrap">
                                {academicYear} · {semester === 'odd' ? 'Odd' : 'Even'} Semester · {twoOptions ? '8 Options (2 per year)' : '4 Options (1 per year)'}
                              </span>
                              <div className="flex-1 h-px bg-slate-100" />
                            </div>
                            {YEAR_ORDER.map(yearNum => (
                              <YearSection
                                key={yearNum}
                                yearNum={yearNum}
                                semester={semester}
                                twoOptions={twoOptions}
                                totalExp={totalExp}
                                theorySelections={theorySelections}
                                onSelect={(optNum, code) => setTheoryOption(optNum, code)}
                                onSectionsChange={setSections}
                                onDetails={setDetailSub}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    )}

                    {/* LAB: required labs */}
                    {subjectTab === 'lab' && (
                      <div className="p-5">
                        {totalRequired > 0 && (
                          <div className={`rounded-xl border px-4 py-3 mb-4 ${allLabsDone ? 'bg-teal-50 border-teal-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className={`text-xs font-700 uppercase tracking-wider ${allLabsDone ? 'text-teal-700' : 'text-amber-700'}`}>
                                {allLabsDone ? '✓ All Required Laboratories Selected' : '⚠ Laboratory Selection Required'}
                              </p>
                              <span className="text-xs text-slate-500">
                                Required: {totalRequired} &nbsp;|&nbsp; Completed: {totalCompleted} &nbsp;|&nbsp; Pending: {totalPending}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500 rounded-full transition-all"
                                style={{ width: `${totalRequired ? (totalCompleted / totalRequired) * 100 : 0}%` }} />
                            </div>
                          </div>
                        )}
                        {requiredLabs.length === 0 ? (
                          <div className="text-center py-10">
                            <p className="text-2xl mb-2">🔬</p>
                            <p className="text-sm font-600 text-slate-600 mb-1">No Laboratory Requirements Yet</p>
                            <p className="text-xs text-slate-400">Select Theory subjects with linked laboratories in the Theory tab.<br />Required labs will automatically appear here.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {requiredLabs.map(req => (
                              <LabRequirementCard key={req.optNum} req={req} onConfirm={confirmLab} onDetails={setDetailSub} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Previously Handled */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <h3 className="font-display font-700 text-sm text-slate-700 mb-3">Previously Handled Subjects</h3>
                    {faculty.previouslyHandled.length === 0 ? (
                      <p className="text-sm text-slate-400">No history available</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {['Year', 'Semester', 'Subject', 'Type'].map(h => (
                              <th key={h} className="text-left py-2 text-xs text-slate-400 font-600">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {faculty.previouslyHandled.map((h, i) => (
                            <tr key={i} className="border-b border-slate-50 last:border-0">
                              <td className="py-2 text-xs text-slate-600">{h.year}</td>
                              <td className="py-2 text-xs text-slate-600">{h.semester}</td>
                              <td className="py-2 text-xs text-slate-700 font-500">{h.subject}</td>
                              <td className="py-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${h.type === 'Theory' ? 'bg-blue-50 text-blue-600' : 'bg-teal-50 text-teal-600'}`}>{h.type}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Right: sticky summary — full viewport height */}
                <div className="self-start sticky top-0" style={{ maxHeight: 'calc(100vh - 80px)' }}>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 80px)' }}>
                    <h3 className="font-display font-700 text-sm text-slate-700 mb-1">My Subject Options</h3>
                    <p className="text-xs text-slate-400 mb-4">{academicYear || '—'} · {semester === 'odd' ? 'Odd' : 'Even'} Semester</p>

                    <div className="flex-1 overflow-y-auto min-h-0 space-y-0">
                    {YEAR_ORDER.map(yearNum => {
                      const entries = summaryEntries.filter(e => e.year === yearNum)
                      return (
                        <div key={yearNum} className="mb-3">
                          <p className="text-xs font-700 text-slate-500 mb-1.5">{YEAR_LABELS[yearNum]}</p>
                          {entries.length === 0 ? (
                            <p className="text-xs text-slate-300 italic pl-2">No selection</p>
                          ) : entries.map(e => (
                            <div key={e.optNum} className="rounded border border-slate-100 p-2 mb-1.5 space-y-1">
                              <div className="flex items-start gap-1.5">
                                <span className="inline-flex items-center justify-center w-4 h-4 bg-[#0F4C81] text-white rounded text-xs font-700 flex-shrink-0 mt-0.5">{e.optNum}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-600 text-slate-700 leading-snug" style={{ wordBreak: 'break-word' }}>
                                    {e.sub.difficulty === 'Tough' && <span className="text-amber-500 mr-0.5">★</span>}
                                    {e.sub.name}
                                  </p>
                                  <p className="text-xs text-slate-400 mt-0.5">{e.sections} {e.sections === 1 ? 'section' : 'sections'}</p>
                                </div>
                              </div>
                              {e.reqLab && (
                                <div className={`flex items-start gap-1 pl-5 ${e.reqLab.confirmed ? 'text-teal-600' : 'text-amber-600'}`}>
                                  <span className="text-xs flex-shrink-0">{e.reqLab.confirmed ? '✓' : '⚠'}</span>
                                  <span className="text-xs leading-snug" style={{ wordBreak: 'break-word' }}>{e.reqLab.lab.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })}

                    </div>
                    <div className="border-t border-slate-100 pt-3 mt-2 space-y-1.5 flex-shrink-0">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Theory Selected</span>
                        <span className="font-600 text-[#0F4C81]">{summaryEntries.length} / {allOptNums.length}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Labs Required</span>
                        <span className="font-600 text-teal-600">{totalRequired}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Labs Completed</span>
                        <span className="font-600 text-teal-600">{totalCompleted} / {totalRequired}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Status</span>
                        <span className={`font-700 ${anyTheorySelected && allLabsDone ? 'text-green-600' : totalPending > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {anyTheorySelected && allLabsDone ? '✓ Ready to Submit' : totalPending > 0 ? `⚠ ${totalPending} Lab Pending` : 'Pending'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <button onClick={handleSubmit}
                        disabled={submitted || !anyTheorySelected || !allLabsDone || !academicYear}
                        className="w-full py-2.5 bg-[#0F4C81] hover:bg-[#0a3860] text-white text-sm font-600 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">
                        Submit Options
                      </button>
                      {totalPending > 0 && anyTheorySelected && (
                        <p className="text-xs text-amber-600 text-center">Complete all required lab selections to submit</p>
                      )}
                      <div className="flex gap-2">
                        <button className="flex-1 py-2 border border-slate-200 text-slate-600 text-xs font-600 rounded-lg hover:bg-slate-50 transition">Save Draft</button>
                        <button onClick={() => { setTheorySelections({}); setLabConfirmed({}); setValidationMsg('') }}
                          className="flex-1 py-2 border border-slate-200 text-slate-600 text-xs font-600 rounded-lg hover:bg-slate-50 transition">Reset</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {!faculty && (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">👤</div>
              <p className="font-display font-700 text-slate-600 text-base mb-1">No Faculty Selected</p>
              <p className="text-sm text-slate-400">Search and select a faculty member above to begin subject allocation</p>
            </div>
          )}
        </div>
      </div>

      {detailSub && <SubjectDetailPanel sub={detailSub} onClose={() => setDetailSub(null)} />}

      {showConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-96">
            <h3 className="font-display font-700 text-base text-slate-800 mb-2">Confirm Subject Options</h3>
            <p className="text-sm text-slate-500 mb-5">Please verify your selected subjects and laboratories before final submission. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => { setSubmitted(true); setShowConfirm(false) }}
                className="flex-1 py-2.5 bg-[#0F4C81] text-white text-sm font-600 rounded-lg hover:bg-[#0a3860] transition">
                Confirm Submission
              </button>
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-600 rounded-lg hover:bg-slate-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
