import type { Page } from '../types'

const stats = [
  { label: 'Total Faculty', value: '142', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: '#0F4C81', bg: '#e3f2fd' },
  { label: 'Total Subjects', value: '386', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', color: '#10b981', bg: '#d1fae5' },
  { label: 'Total Labs', value: '24', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', color: '#f59e0b', bg: '#fef3c7' },
]

const topActions: { label: string; page: Page; icon: string; desc: string; color: string; btnColor: string }[] = [
  { label: 'Upload Excel', page: 'upload-workload', icon: '📊', desc: 'Import faculty workload from Excel file', color: '#e3f2fd', btnColor: '#0F4C81' },
  { label: 'Upload Curriculum', page: 'upload-curriculum', icon: '📄', desc: 'Import curriculum from PDF or Excel', color: '#e8f5e9', btnColor: '#10b981' },
  { label: 'Upload Constraints', page: 'constraints', icon: '⚙️', desc: 'Configure scheduling constraints', color: '#fef3c7', btnColor: '#f59e0b' },
]

export default function Dashboard({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-800 text-2xl text-[#0F4C81]">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Welcome back, Admin. Here's your scheduling overview.</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
              <svg className="w-6 h-6" fill="none" stroke={s.color} strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-display font-800" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 font-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Faculty Subject Allocation */}
      <button
        onClick={() => navigate('faculty-allocation')}
        className="w-full bg-[#0F4C81] hover:bg-[#0a3860] text-white rounded-xl px-6 py-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all group"
      >
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
          📋
        </div>
        <div className="text-left flex-1">
          <p className="font-display font-700 text-base">Faculty Subject Allocation</p>
          <p className="text-blue-200 text-sm mt-0.5">Assign subjects & labs to faculty based on experience and eligibility</p>
        </div>
        <svg className="w-5 h-5 text-blue-300 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Actions */}
      <div>
        <h2 className="font-display font-700 text-base text-slate-700 mb-3">Actions</h2>

        {/* Top row — 3 cards */}
        <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {topActions.map(a => (
            <button
              key={a.page}
              onClick={() => navigate(a.page)}
              className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 text-left hover:shadow-md hover:-translate-y-0.5 transition-all group flex flex-col"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: a.color }}>
                {a.icon}
              </div>
              <p className="font-600 text-sm text-slate-800 group-hover:text-[#0F4C81] transition mb-1">{a.label}</p>
              <p className="text-xs text-slate-400 mb-4 flex-1">{a.desc}</p>
              <div className="w-full py-2 rounded-lg text-white text-xs font-600 text-center" style={{ background: a.btnColor }}>
                {a.label} →
              </div>
            </button>
          ))}
        </div>

        {/* Generate Timetable — centered below */}
        <div className="flex justify-center">
          <button
            onClick={() => navigate('generate')}
            className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 text-left hover:shadow-md hover:-translate-y-0.5 transition-all group flex flex-col w-80"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-3 bg-[#ede9fe]">
              🤖
            </div>
            <p className="font-600 text-sm text-slate-800 group-hover:text-[#0F4C81] transition mb-1">Generate Timetable</p>
            <p className="text-xs text-slate-400 mb-4 flex-1">Run the AI scheduling engine</p>
            <div className="w-full py-2 rounded-lg text-white text-xs font-600 text-center bg-[#8b5cf6]">
              Generate Timetable →
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
