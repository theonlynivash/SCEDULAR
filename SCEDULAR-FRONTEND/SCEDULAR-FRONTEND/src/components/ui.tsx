import type { ReactNode } from 'react'

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="font-display font-800 text-xl text-[#0F4C81]">{title}</h1>
        {desc && <p className="text-sm text-slate-400 mt-0.5">{desc}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function Btn({
  children,
  variant = 'primary',
  onClick,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline'
  onClick?: () => void
}) {
  const styles = {
    primary: 'bg-[#0F4C81] text-white hover:bg-[#0a3860]',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    outline: 'border border-[#0F4C81] text-[#0F4C81] hover:bg-[#0F4C81] hover:text-white',
  }
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-500 transition-all ${styles[variant]}`}
    >
      {children}
    </button>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
      <h3 className="font-display font-700 text-sm text-[#0F4C81] uppercase tracking-wider mb-5 pb-3 border-b border-slate-100">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export function Field({
  label,
  type = 'text',
  defaultValue,
}: {
  label: string
  type?: string
  defaultValue?: string | number
}) {
  return (
    <div>
      <label className="block text-xs font-500 text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
      />
    </div>
  )
}
