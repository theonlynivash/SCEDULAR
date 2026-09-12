import type { Page } from '../types'

const navItems: { label: string; page: Page; icon: string }[] = [
  { label: 'Dashboard', page: 'dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Faculty Management', page: 'faculty', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Subject Management', page: 'subjects', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { label: 'View Timetable', page: 'view-timetable', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Reports', page: 'reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

export default function Sidebar({
  page,
  navigate,
  open,
}: {
  page: Page
  navigate: (p: Page) => void
  open: boolean
}) {
  return (
    <aside
      className="flex flex-col bg-[#0F4C81] text-white transition-all duration-300 overflow-hidden"
      style={{ width: open ? 260 : 0, minWidth: open ? 260 : 0 }}
    >
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 14L10 5L16 14" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 11H14" stroke="#0F4C81" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="font-display font-700 text-sm leading-tight">Panimalar</p>
            <p className="text-blue-300 text-xs">Timetable System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map(item => (
          <button
            key={item.page}
            onClick={() => navigate(item.page)}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all text-left ${
              page === item.page
                ? 'bg-white/15 text-white font-600 border-r-2 border-white'
                : 'text-blue-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-8 h-8 bg-blue-400 rounded-full flex items-center justify-center text-xs font-700">AD</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-500 truncate">Admin User</p>
            <p className="text-blue-300 text-xs truncate">admin@pec.edu.in</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
