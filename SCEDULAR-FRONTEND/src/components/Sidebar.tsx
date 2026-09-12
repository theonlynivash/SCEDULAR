import type { Page } from '../types'
import CollegeLogo from './CollegeLogo'
import { navItems } from '../navItems'

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
      className="glass-chrome hidden md:flex flex-col rounded-3xl transition-all duration-300 overflow-hidden flex-shrink-0"
      style={{ width: open ? 264 : 0, minWidth: open ? 264 : 0, opacity: open ? 1 : 0 }}
    >
      <div className="px-6 py-5 border-b border-white/20">
        <div className="flex items-center gap-3">
          <CollegeLogo className="w-10 h-10 flex-shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
          <div>
            <p className="font-display font-700 text-sm leading-tight text-white">SCEDULAR</p>
            <p className="text-white/60 text-xs">Panimalar · AI&DS</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto glass-scrollarea px-2.5 space-y-1">
        {navItems.map(item => (
          <button
            key={item.page}
            onClick={() => navigate(item.page)}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm rounded-2xl transition-all text-left ${
              page === item.page
                ? 'glass-pill-active text-[#0e254f] font-700'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/20">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700 text-white bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60">AD</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-500 truncate text-white">Admin User</p>
            <p className="text-white/50 text-xs truncate">admin@pec.edu.in</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
