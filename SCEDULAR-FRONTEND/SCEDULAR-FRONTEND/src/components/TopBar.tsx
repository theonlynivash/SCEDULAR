import type { Page } from '../types'

export default function TopBar({
  onToggleSidebar,
  onLogout,
}: {
  onToggleSidebar: () => void
  onLogout: () => void
  navigate: (p: Page) => void
}) {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 flex-shrink-0 shadow-sm">
      <button onClick={onToggleSidebar} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-600">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="flex-1">
        <h2 className="font-display font-700 text-[#0F4C81] text-sm">AI-Based Timetable Scheduling System</h2>
        <p className="text-xs text-slate-400">Academic Year 2024–25 | Odd Semester</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg hover:bg-slate-100 transition text-slate-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#0F4C81] px-3 py-1.5 rounded-lg hover:bg-slate-100 transition font-500"
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
