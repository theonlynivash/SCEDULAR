import { useState } from 'react'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [remember, setRemember] = useState(false)

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0F4C81 0%, #1a6bb5 40%, #e3f2fd 100%)' }}
    >
      <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <circle cx="10%" cy="20%" r="120" fill="white" opacity="0.05" />
        <circle cx="85%" cy="75%" r="200" fill="white" opacity="0.05" />
        <circle cx="50%" cy="50%" r="300" fill="white" opacity="0.03" />
      </svg>

      <div className="relative w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-[#0F4C81] px-8 py-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-full flex items-center justify-center shadow">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="18" fill="#0F4C81" />
                <path d="M8 24L18 10L28 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 20H24" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <circle cx="18" cy="26" r="2" fill="#2196F3" />
              </svg>
            </div>
            <h1 className="text-white font-display text-lg font-700 leading-tight">Panimalar Engineering College</h1>
            <p className="text-blue-200 text-sm mt-1 font-display font-500">PEC TIMETABLE SCHEDULER</p>
          </div>

          <div className="px-8 py-7">
            <div className="mb-5">
              <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
              <input
                value={user}
                onChange={e => setUser(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                placeholder="Enter your username"
              />
            </div>
            <div className="mb-5">
              <label className="block text-xs font-600 text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                placeholder="Enter your password"
              />
            </div>
            <div className="flex items-center justify-between mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="accent-[#0F4C81]"
                />
                <span className="text-sm text-slate-600">Remember me</span>
              </label>
              <button className="text-sm text-[#1a6bb5] hover:text-[#0F4C81] font-500 transition">Forgot Password?</button>
            </div>
            <button
              onClick={onLogin}
              className="w-full bg-[#0F4C81] hover:bg-[#0a3860] text-white font-600 py-3 rounded-lg transition-all shadow-md hover:shadow-lg text-sm tracking-wide"
            >
              Sign In to Dashboard
            </button>
          </div>
        </div>
        <p className="text-center text-white/70 text-xs mt-5">
          © 2024 Panimalar Engineering College. All rights reserved.
        </p>
      </div>
    </div>
  )
}
