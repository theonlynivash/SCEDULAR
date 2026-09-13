import { useState, type FormEvent } from 'react'
import CollegeLogo from './CollegeLogo'

const VALID_USERNAME = 'malathi.s'
const VALID_PASSWORD = 'SCEDULAR_AIDS'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const ok = user.trim().toLowerCase() === VALID_USERNAME && pass === VALID_PASSWORD
    if (ok) {
      setError(null)
      onLogin()
    } else {
      setError('Incorrect username or password.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="app-wallpaper"><div className="blob" /></div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <form onSubmit={handleSubmit} className="glass-strong rounded-[2rem] overflow-hidden">
          <div className="px-8 pt-9 pb-6 text-center">
            <div className="w-full max-w-[420px] mx-auto mb-4 p-2 bg-white border border-[#f3c326] rounded-none shadow-none">
              <CollegeLogo className="block w-full h-auto" />
            </div>
            <h1 className="text-slate-900 font-display text-2xl font-800 tracking-[0.2em]">SCEDULAR</h1>
          </div>

          <div className="px-8 pb-8">
            <div className="mb-4">
              <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
              <input
                value={user}
                onChange={e => { setUser(e.target.value); setError(null) }}
                className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-slate-800 transition placeholder:text-slate-400"
                placeholder="Malathi.S"
                autoComplete="username"
              />
            </div>
            <div className="mb-2">
              <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => { setPass(e.target.value); setError(null) }}
                  className="w-full glass-input rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-800 transition placeholder:text-slate-400"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-[#0e254f] hover:bg-white/60 transition"
                >
                  {showPass ? (
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-rose-600 font-500 mb-3" role="alert">{error}</p>
            )}

            <div className="flex items-center justify-between mb-6 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="accent-[#0e254f]"
                />
                <span className="text-sm text-slate-600">Remember me</span>
              </label>
              <button type="button" className="text-sm text-[#0e254f] hover:text-[#081a38] font-500 transition">Forgot Password?</button>
            </div>
            <button
              type="submit"
              className="w-full text-white font-600 py-3 rounded-xl transition-all text-sm tracking-wide bg-gradient-to-br from-[#0e254f] to-[#081a38] ring-1 ring-[#f3c326]/60 shadow-[0_8px_24px_rgba(14,37,79,0.45)] hover:brightness-110"
            >
              Sign In to Dashboard
            </button>
          </div>
        </form>
        <p className="text-center text-white/60 text-xs mt-5">
          © 2026 Panimalar Engineering College. All rights reserved.
        </p>
      </div>
    </div>
  )
}
