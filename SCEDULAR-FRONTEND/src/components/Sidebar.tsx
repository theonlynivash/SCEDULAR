import type { Page, UserRole } from '../types'
import { facultyNavItems, hodNavItems } from '../navItems'

export default function Sidebar({
  page,
  navigate,
  open,
  role = 'FACULTY',
  userName = '',
  userDesignation = 'Faculty',
}: {
  page: Page
  navigate: (p: Page) => void
  open: boolean
  role?: UserRole
  userName?: string
  userDesignation?: string
}) {
  const items = role === 'HOD' ? hodNavItems : facultyNavItems

  return (
    <aside
      className="glass-chrome hidden md:flex flex-col rounded-3xl transition-all duration-300 overflow-hidden flex-shrink-0"
      style={{ width: open ? 268 : 0, minWidth: open ? 268 : 0, opacity: open ? 1 : 0 }}
    >
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img
            src="/PEC_ICON.jpeg"
            alt="Panimalar Engineering College"
            className="w-10 h-10 flex-shrink-0 object-contain"
          />
          <div>
            <p className="font-display font-700 text-[15px] leading-tight text-white tracking-wide">SCEDULAR</p>
            <p className="text-white/60 text-xs">Panimalar · AI&amp;DS</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-2 bg-white/5 border-b border-white/5 text-[11px] font-semibold text-cyan-300 text-center">
        {role === 'HOD' ? 'HOD PORTAL' : 'FACULTY PORTAL'}
      </div>

      <nav className="flex-1 py-4 overflow-y-auto glass-scrollarea px-3 space-y-1">
        {items.map(item => (
          <button
            key={item.page + item.label}
            onClick={() => navigate(item.page)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-[14px] rounded-2xl transition-all text-left ${
              page === item.page
                ? 'glass-pill-active text-[#0e254f] font-700'
                : 'text-white/70 hover:bg-white/10 hover:text-white font-500'
            }`}
          >
            <item.icon size={18} strokeWidth={1.8} className="flex-shrink-0" />
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700 text-[#f3c326] bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60">
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-600 truncate text-white">{userName}</p>
            <p className="text-white/50 text-xs truncate">{userDesignation} · AI&amp;DS</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
