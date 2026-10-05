import type { Page, UserRole } from '../types'
import { facultyNavItems, hodNavItems } from '../navItems'
import Avatar from './Avatar'
import { getSession } from '../session'

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
      className="glass-chrome hidden md:flex flex-col rounded-2xl transition-all duration-300 overflow-hidden flex-shrink-0"
      style={{ width: open ? 224 : 0, minWidth: open ? 224 : 0, opacity: open ? 1 : 0 }}
    >
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img
            src="/PEC_ICON.jpeg"
            alt="Panimalar Engineering College"
            className="w-9 h-9 flex-shrink-0 object-contain"
          />
          <div>
            <p className="font-display font-800 text-[14px] leading-tight text-white tracking-[0.14em]">SCEDULAR</p>
            <p className="text-white/55 text-[11px]">Panimalar · AI&amp;DS</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-1.5 bg-white/5 border-b border-white/5 text-[10px] font-700 tracking-[0.18em] text-cyan-300 text-center">
        {role === 'HOD' ? 'HOD PORTAL' : 'FACULTY PORTAL'}
      </div>

      <nav className="flex-1 py-3 overflow-y-auto glass-scrollarea px-2.5 space-y-0.5">
        {items.map(item => (
          <button
            key={item.page + item.label}
            onClick={() => navigate(item.page)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl transition-all text-left ${
              page === item.page
                ? 'glass-pill-active text-[color:var(--ink-800)] font-700'
                : 'text-white/70 hover:bg-white/10 hover:text-white font-500'
            }`}
          >
            <item.icon size={16} strokeWidth={1.9} className="flex-shrink-0" />
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-1">
          <Avatar id={getSession()?.user.facultyId ?? ''} name={userName} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-600 truncate text-white">{userName}</p>
            <p className="text-white/50 text-xs truncate">{userDesignation} · AI&amp;DS</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
