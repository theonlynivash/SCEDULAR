import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { THEMES, applyTheme, currentTheme } from '../themes'

// HOD Settings → Appearance: pick the colour theme. The choice is remembered in this browser only.
export default function SetupAppearanceTab() {
  const [cur, setCur] = useState(currentTheme)
  useEffect(() => {
    const on = () => setCur(currentTheme())
    window.addEventListener('scedular-theme', on)
    return () => window.removeEventListener('scedular-theme', on)
  }, [])

  return (
    <div className="space-y-4">
      <div className="glass-main rounded-2xl p-4">
        <h2 className="font-display font-700 text-[15px] text-[color:var(--c-600)]">Colour themes</h2>
        <p className="text-[12.5px] text-slate-500 mt-0.5">Pick a ready-made combination. It changes the whole app at once and is remembered on this browser; each person can choose their own.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {THEMES.map(t => {
          const on = cur === t.id
          return (
            <button key={t.id} onClick={() => applyTheme(t.id)}
              className={`text-left rounded-2xl p-3 transition glass-main hover:-translate-y-0.5 ${on ? 'ring-2 ring-[color:var(--accent)]' : ''}`}>
              {/* a miniature of the app in this theme's colours */}
              <div className="h-28 rounded-xl overflow-hidden flex gap-1.5 p-1.5" style={{ background: t.ink }}>
                <div className="w-1/4 rounded-lg" style={{ background: 'rgba(255,255,255,0.10)' }}>
                  <div className="m-1.5 h-2.5 rounded" style={{ background: t.dots[1] }} />
                  <div className="mx-1.5 mt-1.5 h-1.5 rounded bg-white/25" /><div className="mx-1.5 mt-1 h-1.5 rounded bg-white/25" />
                </div>
                <div className="flex-1 rounded-lg p-1.5 space-y-1.5" style={{ background: t.paper }}>
                  <div className="h-2.5 w-1/2 rounded" style={{ background: t.dots[0] }} />
                  <div className="flex gap-1.5">
                    {t.dots.map(c => <div key={c} className="h-9 flex-1 rounded-md" style={{ background: c, opacity: 0.85 }} />)}
                  </div>
                  <div className="h-1.5 rounded" style={{ background: t.dots[0], opacity: 0.35 }} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <div>
                  <div className="text-[13.5px] font-700 text-slate-800">{t.name}</div>
                  <div className="text-[11.5px] text-slate-500">{t.tagline}</div>
                </div>
                {on && <span className="grid place-items-center w-6 h-6 rounded-full text-white" style={{ background: 'var(--c-600)' }}><Check className="w-3.5 h-3.5" /></span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
