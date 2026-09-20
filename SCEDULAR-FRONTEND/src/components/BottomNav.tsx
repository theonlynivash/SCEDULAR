import type { Page, UserRole } from '../types'
import { facultyNavItems, hodNavItems } from '../navItems'

export default function BottomNav({ page, navigate, role = 'FACULTY' }: { page: Page; navigate: (p: Page) => void; role?: UserRole }) {
  const items = role === 'HOD' ? hodNavItems : facultyNavItems
  return (
    <nav className="glass-chrome md:hidden fixed bottom-3 left-3 right-3 z-20 rounded-3xl px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-start justify-center gap-0.5 overflow-x-auto glass-scrollarea">
        {items.map(item => {
          const active = page === item.page
          return (
            <button
              key={item.page}
              onClick={() => navigate(item.page)}
              className="flex flex-col items-center gap-0.5 flex-shrink-0 min-w-[62px] px-2 py-1.5 rounded-2xl transition-all"
            >
              <item.icon size={22} strokeWidth={1.8} className={active ? 'text-[#f3c326]' : 'text-white/70'} />
              <span className={`text-[10px] font-600 whitespace-nowrap ${active ? 'text-[#f3c326]' : 'text-white/70'}`}>{item.shortLabel}</span>
              <span className={`w-1 h-1 rounded-full transition-all ${active ? 'bg-[#f3c326]' : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>
    </nav>
  )
}