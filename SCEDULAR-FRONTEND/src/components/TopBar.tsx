import ScedularLogo from './ScedularLogo'
import { useState } from 'react'
import MessagesPanel from './MessagesPanel'
import { THEMES, applyTheme, currentTheme } from '../themes'

function ThemeSwitcher() {
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState(currentTheme)
  const pick = (id: string) => { applyTheme(id); setCur(id); setOpen(false) }
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} title="Colour theme" className="grid place-items-center w-8 h-8 rounded-lg hover:bg-white/15 transition text-white/70">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 100 18c1.1 0 1.5-.8 1.2-1.6-.4-1 .2-2.1 1.3-2.1H17a4 4 0 004-4c0-5-4-10.3-9-10.3z" />
          <circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="15" cy="8" r="1" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div className="fixed right-3 top-14 z-[100] w-56 max-h-[70vh] overflow-auto rounded-xl p-1.5 bg-white shadow-xl border border-slate-200 animate-[pop-in_.18s_ease-out]">
            {THEMES.map(t => (
              <button key={t.id} onClick={() => pick(t.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] font-600 transition ${cur === t.id ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className="flex -space-x-1">{t.dots.map(c => <span key={c} className="w-3.5 h-3.5 rounded-full ring-2 ring-white" style={{ background: c }} />)}</span>
                {t.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Global header: system-level controls only (branding, menu toggle,
// notifications, logout, HOD settings). Semester/Year context lives inside
// each feature page (Subject Management, Faculty Allocation, Faculty
// Subject Review, Section Allocation) — never as a global academic selector.
export default function TopBar({
  onToggleSidebar,
  onLogout,
  navigate,
  role,
}: {
  onToggleSidebar: () => void
  onLogout: () => void
  navigate: (p: any) => void
  role?: 'HOD' | 'FACULTY'
}) {
  return (
    <header className="glass-chrome rounded-xl px-3 py-1.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
      <button onClick={onToggleSidebar} className="grid place-items-center w-9 h-9 md:w-8 md:h-8 rounded-lg hover:bg-white/15 transition text-white/80">
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex items-center gap-1.5 min-w-0">
        <ScedularLogo className="w-7 h-7 flex-shrink-0" />
        <span className="text-[13px] font-800 tracking-[0.2em] text-white whitespace-nowrap">SCEDULAR</span>
        <span className="hidden lg:inline text-[10.5px] font-500 text-white/45 whitespace-nowrap">AI &amp; DS Timetable Suite</span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {role === 'HOD' && (
          <button
            onClick={() => navigate('settings')}
            title="Settings"
            className="grid place-items-center w-8 h-8 rounded-lg hover:bg-white/15 transition text-white/70"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        )}
        <ThemeSwitcher />
        <MessagesPanel role={role} />
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 h-8 text-[13px] text-white/80 hover:text-white px-2.5 rounded-lg hover:bg-white/15 transition font-600"
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
