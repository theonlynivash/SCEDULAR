import { useEffect, useState } from 'react'
import { api, type StaffingReport } from '../api'

/** Total weekly demand vs what the teachers can carry, with a plain "need N more teachers" when they cannot. */
export default function StaffingCard({ refreshKey }: { refreshKey: unknown }) {
  const [r, setR] = useState<StaffingReport | null>(null)
  useEffect(() => { api.facultyAllocation.staffing().then(setR).catch(() => setR(null)) }, [refreshKey])
  if (!r || r.totalDemandPeriods === 0) return null

  const capacity = r.teachers * r.maxWeeklyPeriods
  const scale = Math.max(capacity, r.totalDemandPeriods, 1)
  return (
    <div className={`rounded-2xl border px-4 py-3 ${r.enough ? 'border-emerald-200/70 bg-emerald-50/50' : 'border-amber-300/70 bg-amber-50/70'}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-700 ${r.enough ? 'text-emerald-800' : 'text-amber-900'}`}>
            {r.enough ? 'Teachers are enough for this cycle' : `Need ${r.moreTeachersNeeded} more teacher${r.moreTeachersNeeded === 1 ? '' : 's'}`}
          </p>
          <p className="text-[11.5px] text-slate-600 mt-0.5">{r.message}</p>
        </div>
        <dl className="flex gap-5 text-[11px] text-slate-500">
          <div><dt>Weekly demand</dt><dd className="text-slate-800 font-700 text-sm">{r.totalDemandPeriods} periods</dd></div>
          <div><dt>Teachers</dt><dd className="text-slate-800 font-700 text-sm">{r.teachers} × {r.maxWeeklyPeriods}</dd></div>
          <div><dt>Needed at least</dt><dd className="text-slate-800 font-700 text-sm">{r.teachersNeeded}</dd></div>
        </dl>
      </div>
      <div className="mt-2.5">
        <div className="relative h-2 rounded-full bg-[#0e254f]/8 overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#0e254f]/20" style={{ width: `${(100 * capacity) / scale}%` }} title="Total teacher capacity" />
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#2f6fc4]/75" style={{ width: `${(100 * r.assignedPeriods) / scale}%` }} title="Periods already assigned" />
          {r.totalDemandPeriods > capacity && <div className="absolute inset-y-0 right-0 rounded-full bg-amber-400/80" style={{ width: `${(100 * (r.totalDemandPeriods - capacity)) / scale}%` }} title="Demand beyond capacity" />}
        </div>
        <div className="flex justify-between text-[10.5px] text-slate-500 mt-1">
          <span>{r.assignedPeriods} assigned</span>
          <span>{r.openPeriods} still open · capacity {capacity}</span>
        </div>
      </div>
      <p className="text-[10.5px] text-slate-400 mt-1.5">Each subject accepts about one teacher per {r.avgSectionsPerTeacher} sections; a teacher carries at most {r.maxWeeklyPeriods} periods a week. Both can be changed in Settings → Policy &amp; cycle.</p>
    </div>
  )
}
