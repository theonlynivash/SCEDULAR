import type { Page } from '../types'
import { useScope, YEARS, SEMESTERS_BY_YEAR, type Scope } from '../scope'

export default function TopBar({
  onToggleSidebar,
  onLogout,
}: {
  onToggleSidebar: () => void
  onLogout: () => void
  navigate: (p: Page) => void
}) {
  const { scope, setScope } = useScope()

  const semesterOptions: string[] = scope.year === 'ALL' ? [] : SEMESTERS_BY_YEAR[scope.year]

  function onYearChange(year: Scope['year']) {
    setScope({ year, semester: 'ALL' })
  }

  return (
    <header className="glass-chrome rounded-2xl px-3 py-2 flex items-center gap-3 flex-shrink-0 flex-wrap">
      <button onClick={onToggleSidebar} className="hidden md:block p-1 rounded-lg hover:bg-white/15 transition text-white/80">
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex items-center gap-1.5 glass-pill rounded-full px-1.5 py-1">
        <ScopeSegment label="Dept" active={scope.year === 'ALL'} onClick={() => setScope({ year: 'ALL', semester: 'ALL' })} />
        {YEARS.map(y => (
          <ScopeSegment key={y} label={`Yr ${y}`} active={scope.year === y} onClick={() => onYearChange(y)} />
        ))}
      </div>

      {scope.year !== 'ALL' && (
        <div className="flex items-center gap-1.5 glass-pill rounded-full px-1.5 py-1.5">
          <ScopeSegment label="All Sem" active={scope.semester === 'ALL'} onClick={() => setScope({ ...scope, semester: 'ALL' })} />
          {semesterOptions.map(s => (
            <ScopeSegment key={s} label={`Sem ${s}`} active={scope.semester === s} onClick={() => setScope({ ...scope, semester: s })} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 ml-auto">
        <button className="relative p-2 rounded-xl hover:bg-white/15 transition text-white/70">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-400 rounded-full" />
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sm text-white/80 hover:text-white px-3 py-1.5 rounded-xl hover:bg-white/15 transition font-500"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </header>
  )
}

function ScopeSegment({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-600 transition-all whitespace-nowrap ${
        active ? 'glass-pill-active text-[#0e254f] font-700' : 'text-white/60 hover:text-white hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}
