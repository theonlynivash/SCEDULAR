import { useEffect, useState } from 'react'
import type { Page } from '../types'
import { api } from '../api'
import { StatCard, GlassPanel } from './ui'

const statMeta = [
  { key: 'faculty', label: 'Total Faculty', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', tone: 'accent' as const },
  { key: 'subjects', label: 'Total Subjects', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', tone: 'success' as const },
  { key: 'labs', label: 'Total Labs', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', tone: 'warning' as const },
] as const

const topActions: { label: string; page: Page; icon: string }[] = [
  { label: 'Data & Import Hub', page: 'data-hub', icon: '🗂️' },
  { label: 'Upload Curriculum', page: 'upload-curriculum', icon: '📄' },
  { label: 'Constraints & Grid', page: 'constraints', icon: '⚙️' },
]

export default function Dashboard({ navigate }: { navigate: (p: Page) => void }) {
  const [counts, setCounts] = useState<{ faculty: number; subjects: number; labs: number } | null>(null)

  useEffect(() => {
    Promise.all([api.faculty.list(), api.courses.list(), api.labs.list()])
      .then(([f, c, l]) => setCounts({ faculty: f.length, subjects: c.length, labs: l.length }))
      .catch(() => setCounts({ faculty: 0, subjects: 0, labs: 0 }))
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="font-display font-800 text-2xl text-slate-900">Dashboard</h1>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {statMeta.map(s => (
          <StatCard
            key={s.label}
            tone={s.tone}
            label={s.label}
            value={counts ? counts[s.key] : '—'}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
            }
          />
        ))}
      </div>

      <div>
        <h2 className="font-display font-700 text-base text-slate-700 mb-3">Actions</h2>

        <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
          {topActions.map(a => (
            <button
              key={a.page}
              onClick={() => navigate(a.page)}
              className="text-left transition-all group flex flex-col"
            >
              <GlassPanel className="p-5 flex flex-col h-full group-hover:-translate-y-0.5 transition-transform">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl mb-3 bg-white/40">
                  {a.icon}
                </div>
                <p className="font-600 text-sm text-slate-800 group-hover:text-[#0e254f] transition mb-3 flex-1">{a.label}</p>
                <div className="w-full py-2 rounded-full text-white text-xs font-600 text-center bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60">
                  {a.label} →
                </div>
              </GlassPanel>
            </button>
          ))}
        </div>

        <div className="flex justify-center">
          <button onClick={() => navigate('generate')} className="w-80 text-left transition-all group">
            <GlassPanel className="p-5 flex flex-col group-hover:-translate-y-0.5 transition-transform">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl mb-3 bg-white/40">
                🤖
              </div>
              <p className="font-600 text-sm text-slate-800 group-hover:text-[#0e254f] transition mb-3 flex-1">Generate Timetable</p>
              <div className="w-full py-2 rounded-full text-white text-xs font-600 text-center bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60">
                Generate Timetable →
              </div>
            </GlassPanel>
          </button>
        </div>
      </div>
    </div>
  )
}
