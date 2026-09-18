import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react'

export function PageHeader({ title, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <h1 className="font-display font-800 text-xl text-slate-900">{title}</h1>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}

export function Btn({
  children,
  variant = 'primary',
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'danger'
  onClick?: () => void
  disabled?: boolean
  title?: string
}) {
  const styles: Record<string, string> = {
    primary:
      'text-white bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 border border-white/40 shadow-[0_4px_16px_rgba(14,37,79,0.4)] hover:brightness-110',
    secondary: 'glass-pill text-slate-700 hover:bg-white/60',
    outline: 'bg-transparent border border-[#0e254f]/50 text-[#0e254f] hover:bg-[#0e254f]/10',
    danger: 'text-white bg-gradient-to-br from-[#fb7185] to-[#f43f5e] border border-white/40 hover:brightness-110',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-500 transition-all disabled:opacity-50 disabled:pointer-events-none ${styles[variant]}`}
    >
      {children}
    </button>
  )
}

export function GlassPanel({
  children,
  className = '',
  strong = false,
}: {
  children: ReactNode
  className?: string
  strong?: boolean
}) {
  return <div className={`${strong ? 'glass-strong' : 'glass'} rounded-3xl ${className}`}>{children}</div>
}

export function Section({ title, children, actions }: { title: string; desc?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <GlassPanel className="p-6">
      <div className="flex items-start justify-between gap-3 mb-5 pb-3 border-b border-white/50">
        <h3 className="font-display font-700 text-sm text-slate-800 uppercase tracking-wider">{title}</h3>
        {actions}
      </div>
      <div className="space-y-4">{children}</div>
    </GlassPanel>
  )
}

export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full glass-input rounded-xl px-3.5 py-2.5 text-sm text-slate-800 transition placeholder:text-slate-400"
      />
      {hint && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

export function Select({
  label,
  children,
  ...props
}: { label: string; hint?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <select
        {...props}
        className="w-full glass-input rounded-xl pl-3.5 pr-9 py-2.5 text-sm text-slate-800 transition appearance-none bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23636b8a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.9rem center',
          backgroundSize: '16px',
        }}
      >
        {children}
      </select>
    </div>
  )
}

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
}) {
  const tones: Record<string, string> = {
    neutral: 'text-slate-600 bg-white/50 border-white/60',
    success: 'text-emerald-700 bg-emerald-400/20 border-emerald-300/50',
    warning: 'text-amber-700 bg-amber-400/20 border-amber-300/50',
    danger: 'text-rose-700 bg-rose-400/20 border-rose-300/50',
    accent: 'text-[#0e254f] bg-[#0e254f]/10 border-[#0e254f]/30',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-600 border backdrop-blur-md ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function StatCard({
  icon,
  label,
  value,
  tone = 'accent',
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  tone?: 'accent' | 'success' | 'warning'
}) {
  const glow: Record<string, string> = {
    accent: 'from-[#0e254f]/25 to-[#f3c326]/20 text-[#0e254f]',
    success: 'from-[#34d399]/25 to-[#f3c326]/15 text-emerald-600',
    warning: 'from-[#fbbf24]/25 to-[#fb7185]/15 text-amber-600',
  }
  return (
    <GlassPanel className="p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${glow[tone]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-display font-800 text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 font-500">{label}</p>
      </div>
    </GlassPanel>
  )
}

export function IconBtn({ children, onClick, title, tone = 'neutral' }: { children: ReactNode; onClick?: () => void; title?: string; tone?: 'neutral' | 'danger' }) {
  const tones = {
    neutral: 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
    danger: 'text-rose-400 hover:text-rose-600 hover:bg-rose-50/60',
  }
  return (
    <button onClick={onClick} title={title} className={`p-1.5 rounded-lg transition ${tones[tone]}`}>
      {children}
    </button>
  )
}
