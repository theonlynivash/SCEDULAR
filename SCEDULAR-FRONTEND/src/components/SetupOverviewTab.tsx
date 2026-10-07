import { useEffect, useState } from 'react'
import { Check, Circle } from 'lucide-react'
import { api, type SetupOverview } from '../api'
import type { Page } from '../types'

/** One-glance checklist for getting a semester ready: sections → syllabus → teachers → choices → assignment. */
export default function SetupOverviewTab({ navigate, goTo }: { navigate: (p: Page) => void; goTo: (tab: 'sections' | 'syllabus' | 'labs' | 'import') => void }) {
  const [ov, setOv] = useState<SetupOverview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.setup.overview().then(setOv).catch(e => setErr(e?.message || 'Could not load.')) }, [])
  if (err) return <p className="text-sm text-rose-700">{err}</p>
  if (!ov) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>

  const Step = ({ done, title, detail, action }: { done: boolean; title: string; detail: string; action?: { label: string; run: () => void } }) => (
    <div className="flex items-center gap-3 py-2">
      <span className={`w-5 h-5 rounded-full grid place-items-center flex-shrink-0 ${done ? 'bg-emerald-500 text-white' : 'border border-slate-300 text-slate-300'}`}>{done ? <Check className="w-3 h-3" strokeWidth={3} /> : <Circle className="w-2 h-2" />}</span>
      <div className="min-w-0 flex-1"><p className="text-xs font-700 text-slate-800">{title}</p><p className="text-[11px] text-slate-500">{detail}</p></div>
      {action && <button onClick={action.run} className="px-3 py-1 rounded-md border border-[color:var(--c-600)]/40 text-[color:var(--c-600)] text-[11px] font-700 hover:bg-blue-50">{action.label}</button>}
    </div>
  )

  const t = ov.teachers
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Cycle <b className="text-slate-700">{ov.cycle}</b>. Work down each semester's list: sections, syllabus, teachers' logins, their choices, then assignment. The timetable can be generated once every section has a teacher.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {(ov.semesters.some(x => x.sections + x.subjects > 0) ? ov.semesters.filter(x => x.sections + x.subjects > 0) : ov.semesters).map(s => {
          const secOk = s.sections > 0, subOk = s.subjects > 0 && s.subjectsOffered === s.subjects
          const staffOk = s.offerings > 0 && s.staffed === s.offerings
          return (
            <div key={s.semester} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center mb-1"><h3 className="text-sm font-700 text-slate-800">Semester {s.semester}</h3><span className="ml-2 text-[11px] text-slate-400">{s.year}</span>
                <span className={`ml-auto text-[10px] font-700 px-2 py-0.5 rounded-full border ${staffOk ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>{staffOk ? 'Ready to generate' : 'In progress'}</span></div>
              <div className="divide-y divide-slate-50">
                <Step done={secOk} title="Sections" detail={secOk ? `${s.sections} sections` : 'No sections yet'} action={{ label: secOk ? 'Manage' : 'Add', run: () => goTo('sections') }} />
                <Step done={subOk} title="Syllabus" detail={s.subjects === 0 ? 'No subjects yet' : `${s.subjects} subjects, ${s.subjectsOffered} offered to sections`} action={{ label: s.subjects ? 'Edit' : 'Add', run: () => goTo('syllabus') }} />
                <Step done={s.choices > 0} title="Teachers' choices" detail={`${s.choices} subject choices received`} action={{ label: 'Review', run: () => navigate('hod-allocation-review') }} />
                <Step done={staffOk} title="Assignment" detail={`${s.staffed} of ${s.offerings} section-subjects have a teacher`} action={{ label: 'Assign', run: () => navigate('hod-allocation-review') }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <Step done={t.total > 0 && t.withLogin === t.total} title="Teachers and logins" detail={`${t.total} teachers, ${t.withLogin} with a personal login${t.total - t.withLogin ? ` · ${t.total - t.withLogin} still need one` : ''}`} action={{ label: 'Open teachers', run: () => navigate('faculty') }} />
        <Step done={ov.labs > 0} title="Lab rooms" detail={`${ov.labs} rooms configured`} action={{ label: 'Open labs', run: () => goTo('labs') }} />
      </div>
    </div>
  )
}
