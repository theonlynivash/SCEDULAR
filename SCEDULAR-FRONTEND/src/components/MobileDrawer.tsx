import { useEffect } from 'react'
import { LogOut, X } from 'lucide-react'
import type { Page, UserRole } from '../types'
import { facultyNavItems, hodNavItems } from '../navItems'
import Avatar from './Avatar'
import { getSession } from '../session'

/** Phone-sized replacement for the left sidebar: slides in from the left with every page, who is signed in, and Logout. */
export default function MobileDrawer({ open, onClose, page, navigate, role = 'FACULTY', userName = '', userDesignation = 'Faculty', onLogout }: {
  open: boolean; onClose: () => void; page: Page; navigate: (p: Page) => void; role?: UserRole; userName?: string; userDesignation?: string; onLogout: () => void
}) {
  const items = role === 'HOD' ? hodNavItems : facultyNavItems
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`md:hidden fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <aside className={`glass-chrome absolute left-2 top-2 bottom-2 w-[78%] max-w-[300px] rounded-3xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-[110%]'}`}>
        <div className="px-4 py-4 flex items-center gap-3 border-b border-white/10">
          <img src="/PEC_ICON.jpeg" alt="" className="w-9 h-9 object-contain" />
          <div className="min-w-0">
            <p className="font-display font-800 text-[14px] leading-tight text-white tracking-[0.14em]">SCEDULAR</p>
            <p className="text-white/55 text-[11px]">{role === 'HOD' ? 'HOD portal' : 'Faculty portal'}</p>
          </div>
          <button onClick={onClose} aria-label="Close menu" className="ml-auto p-2 rounded-full text-white/70 hover:bg-white/10"><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto glass-scrollarea p-2.5 space-y-1">
          {items.map(item => (
            <button key={item.page + item.label} onClick={() => { navigate(item.page); onClose() }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-[14px] text-left transition ${page === item.page ? 'glass-pill-active text-[#17403d] font-700' : 'text-white/80 hover:bg-white/10'}`}>
              <item.icon size={18} strokeWidth={1.9} className="shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10 space-y-2.5">
          <div className="flex items-center gap-3 px-1">
            <Avatar id={getSession()?.user.facultyId ?? ''} name={userName} size={36} />
            <div className="min-w-0"><p className="text-sm font-600 text-white truncate">{userName}</p><p className="text-xs text-white/50 truncate">{userDesignation}</p></div>
          </div>
          <button onClick={() => { onClose(); onLogout() }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/10 text-white/90 text-[13px] font-600 hover:bg-white/15"><LogOut size={15} /> Log out</button>
        </div>
      </aside>
    </div>
  )
}
