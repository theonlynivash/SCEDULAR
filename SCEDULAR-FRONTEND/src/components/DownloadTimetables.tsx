import { useEffect, useRef, useState } from 'react'
import { Download, ChevronDown } from 'lucide-react'
import { API_BASE, api, downloadFile } from '../api'
import { getSession } from '../session'

const ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/**
 * Download the generated class timetables as PDF sheets in the department's printed format
 * (grid, subject / practical tables with staff, class in-charge), one semester at a time or all together.
 */
export default function DownloadTimetables({ compact = false }: { compact?: boolean }) {
  const [sems, setSems] = useState<{ sem: string; sections: number }[] | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([api.timetable.master().catch(() => null), api.sections.list()]).then(([m, secs]) => {
      if (!m) { setSems([]); return }
      const inRun = new Set(m.assignments.map(a => a.sectionId))
      const bySem = new Map<string, number>()
      for (const s of secs) if (s.semester && inRun.has(s.id)) bySem.set(s.semester, (bySem.get(s.semester) ?? 0) + 1)
      setSems(ORDER.filter(x => bySem.has(x)).map(x => ({ sem: x, sections: bySem.get(x)! })))
    }).catch(() => setSems([]))
  }, [])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (!sems || sems.length === 0) return null
  const href = (s: string) => `${API_BASE}/timetable/export?semester=${s}`
  const isHod = getSession()?.user.role === 'HOD'
  const getMaster = (s: string) => { setOpen(false); downloadFile(`/timetable/export/master?semester=${s}`, 'Master-Timetable.pdf').catch(e => window.alert(e.message)) }

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 rounded-full text-[#16367a] bg-white/15 backdrop-blur ring-1 ring-[#16367a]/25 hover:bg-white/30 transition font-500 ${compact ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2 text-[13px]'}`}>
        <Download size={14} /> Download PDF <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-60 z-30 rounded-2xl bg-white/95 backdrop-blur-xl ring-1 ring-[#0e254f]/10 shadow-[0_12px_32px_rgba(14,37,79,0.18)] overflow-hidden">
          <p className="px-4 pt-3 pb-1 text-[10.5px] uppercase tracking-[0.12em] text-slate-400">Class timetables</p>
          {sems.map(x => (
            <a key={x.sem} href={href(x.sem)} download onClick={() => setOpen(false)} className="flex items-center justify-between px-4 py-2 text-[13px] text-slate-700 hover:bg-[#2f6fc4]/8">
              <span>Semester {x.sem}</span><span className="text-[11px] text-slate-400">{x.sections} sections</span>
            </a>
          ))}
          {sems.length > 1 && (
            <a href={href('all')} download onClick={() => setOpen(false)} className="flex items-center justify-between px-4 py-2 text-[13px] font-500 text-[#16367a] border-t border-[#0e254f]/8 hover:bg-[#2f6fc4]/8">
              <span>All semesters</span><span className="text-[11px] text-slate-400">one file</span>
            </a>
          )}
          {isHod && (
            <>
              <p className="px-4 pt-3 pb-1 text-[10.5px] uppercase tracking-[0.12em] text-slate-400 border-t border-[#0e254f]/8">Master timetable (all sections)</p>
              {sems.map(x => (
                <button key={x.sem} onClick={() => getMaster(x.sem)} className="w-full flex items-center justify-between px-4 py-2 text-[13px] text-slate-700 hover:bg-[#2f6fc4]/8 text-left">
                  <span>Semester {x.sem}</span><span className="text-[11px] text-slate-400">master</span>
                </button>
              ))}
              {sems.length > 1 && (
                <button onClick={() => getMaster('all')} className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-500 text-[#16367a] hover:bg-[#2f6fc4]/8 text-left">
                  <span>All semesters</span><span className="text-[11px] text-slate-400">one file</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
