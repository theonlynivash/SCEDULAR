import type { Page } from '../types'
import { navItems } from '../navItems'

// Mobile/narrow-window navigation: the sidebar's tabs collapse into a
// fixed bottom bar once the window gets too narrow for a side rail.
export default function BottomNav({ page, navigate }: { page: Page; navigate: (p: Page) => void }) {
  return (
    <nav className="glass-chrome md:hidden fixed bottom-3 left-3 right-3 z-20 rounded-3xl px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-1 overflow-x-auto glass-scrollarea">
        {navItems.map(item => {
          const active = page === item.page
          return (
            <button
              key={item.page}
              onClick={() => navigate(item.page)}
              className="flex flex-col items-center gap-1 flex-shrink-0 px-3 py-1.5 rounded-2xl transition-all"
            >
              <svg className={`w-5.5 h-5.5 ${active ? 'text-[#f3c326]' : 'text-white/70'}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className={`text-[10px] font-600 whitespace-nowrap ${active ? 'text-[#f3c326]' : 'text-white/70'}`}>{item.shortLabel}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
