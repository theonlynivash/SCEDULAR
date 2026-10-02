import { Menu } from 'lucide-react'
import type { Page, UserRole } from '../types'
import { facultyNavItems, hodNavItems } from '../navItems'

export default function BottomNav({ page, navigate, role = 'FACULTY', onMore }: { page: Page; navigate: (p: Page) => void; role?: UserRole; onMore: () => void }) {
  const all = role === 'HOD' ? hodNavItems : facultyNavItems
  const items = all.slice(0, 4)
  const moreActive = !items.some(i => i.page === page)
  return (
    <nav className="glass-chrome md:hidden fixed bottom-3 left-3 right-3 z-20 rounded-3xl px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-5 items-start">
        {items.map(item => {
          const active = page === item.page
          return (
            <button
              key={item.page}
              onClick={() => navigate(item.page)}
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-2xl transition-all active:scale-95"
            >
              <item.icon size={22} strokeWidth={1.8} className={active ? 'text-[#f3c326]' : 'text-white/70'} />
              <span className={`text-[10px] font-600 whitespace-nowrap ${active ? 'text-[#f3c326]' : 'text-white/70'}`}>{item.shortLabel}</span>
              <span className={`w-1 h-1 rounded-full transition-all ${active ? 'bg-[#f3c326]' : 'bg-transparent'}`} />
            </button>
          )
        })}
        <button onClick={onMore} className="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-2xl transition-all active:scale-95">
          <Menu size={22} strokeWidth={1.8} className={moreActive ? 'text-[#f3c326]' : 'text-white/70'} />
          <span className={`text-[10px] font-600 ${moreActive ? 'text-[#f3c326]' : 'text-white/70'}`}>More</span>
          <span className={`w-1 h-1 rounded-full ${moreActive ? 'bg-[#f3c326]' : 'bg-transparent'}`} />
        </button>
      </div>
    </nav>
  )
}