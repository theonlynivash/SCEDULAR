import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bell, Search, Send, X } from 'lucide-react'
import { api, type ChatMsg, type MsgThread } from '../api'
import { getSession } from '../session'
import Avatar from './Avatar'

const clock = (iso: string) => {
  const d = new Date(iso), now = new Date()
  const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  return d.toDateString() === now.toDateString() ? t : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${t}`
}

/** Bell in the top bar: short plain-text messages between the HOD and teachers (kept for 30 days). */
export default function MessagesPanel({ role }: { role?: 'HOD' | 'FACULTY' }) {
  const me = getSession()?.user.facultyId ?? ''
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [threads, setThreads] = useState<MsgThread[]>([])
  const [active, setActive] = useState<MsgThread | null>(null)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const refreshCount = useCallback(() => { api.messages.unread().then(r => setUnread(r.count)).catch(() => {}) }, [])
  const refreshThreads = useCallback(async () => {
    try {
      const t = await api.messages.threads()
      setThreads(t)
      // a teacher only ever talks to the HOD, so open that conversation straight away
      if (role !== 'HOD') setActive(cur => cur ?? t[0] ?? null)
    } catch { /* offline: keep what we have */ }
  }, [role])
  const refreshThread = useCallback(async (id: string) => {
    try { setMsgs(await api.messages.thread(id)); refreshCount() } catch { /* ignore */ }
  }, [refreshCount])

  useEffect(() => { refreshCount(); const i = setInterval(refreshCount, 20_000); return () => clearInterval(i) }, [refreshCount])
  useEffect(() => { if (open) { refreshThreads(); const i = setInterval(refreshThreads, 15_000); return () => clearInterval(i) } }, [open, refreshThreads])
  useEffect(() => { if (open && active) { refreshThread(active.id); const i = setInterval(() => refreshThread(active.id), 8_000); return () => clearInterval(i) } }, [open, active, refreshThread])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, active])

  async function send() {
    const t = text.trim()
    if (!t || !active) return
    setText(''); setErr(null)
    try { await api.messages.send(active.id, t); await refreshThread(active.id); refreshThreads() }
    catch (e: any) { setErr(e?.message || 'Could not send.'); setText(t) }
  }

  const shown = threads.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Messages" className="relative grid place-items-center w-8 h-8 rounded-lg hover:bg-white/15 transition text-white/70">
        <Bell className="w-5 h-5" strokeWidth={2} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-400 text-white text-[10px] font-700 grid place-items-center">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && createPortal(
        <div className="fixed top-14 right-3 z-[100] w-[min(94vw,380px)] h-[min(78vh,540px)] rounded-2xl overflow-hidden flex flex-col bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl text-slate-100">
          <div className="px-3.5 py-2.5 flex items-center gap-2 border-b border-white/10 shrink-0">
            {active && role === 'HOD' && <button onClick={() => { setActive(null); setMsgs([]); refreshThreads() }} className="p-1 rounded-lg hover:bg-white/10"><ArrowLeft className="w-4 h-4" /></button>}
            {active && <Avatar id={active.id} name={active.name} photoAt={active.photoAt} size={32} />}
            <div className="min-w-0">
              <p className="text-sm font-700 truncate">{active ? active.name : 'Messages'}</p>
              <p className="text-[10px] text-white/45">{active ? (active.designation ?? '') : 'Short notes · deleted after 30 days'}</p>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
          </div>

          {!active ? (
            <>
              <div className="px-3 py-2 shrink-0">
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5">
                  <Search className="w-3.5 h-3.5 text-white/50" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search teachers" className="bg-transparent text-xs flex-1 outline-none placeholder:text-white/40" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {shown.map(t => (
                  <button key={t.id} onClick={() => setActive(t)} className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-white/10 transition">
                    <Avatar id={t.id} name={t.name} photoAt={t.photoAt} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2"><span className="text-[13px] font-600 truncate">{t.name}</span>{t.lastAt && <span className="ml-auto text-[10px] text-white/40 shrink-0">{clock(t.lastAt)}</span>}</span>
                      <span className="block text-[11px] text-white/50 truncate">{t.lastText ? `${t.lastFromMe ? 'You: ' : ''}${t.lastText}` : 'No messages yet'}</span>
                    </span>
                    {t.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-400 text-slate-900 text-[10px] font-700 grid place-items-center">{t.unread}</span>}
                  </button>
                ))}
                {shown.length === 0 && <p className="text-xs text-white/40 text-center py-8">No one found.</p>}
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                {msgs.length === 0 && <p className="text-xs text-white/40 text-center py-8">Say hello 👋</p>}
                {msgs.map(m => (
                  <div key={m.id} className={`flex items-end gap-1.5 ${m.fromId === me ? 'justify-end' : 'justify-start'}`}>
                    {m.fromId !== me && active && <Avatar id={active.id} name={active.name} photoAt={active.photoAt} size={24} />}
                    <div style={{ overflowWrap: 'anywhere' }} className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-[12.5px] ${m.fromId === me ? 'bg-cyan-500/80 text-white rounded-br-md' : 'bg-white/10 rounded-bl-md'}`}>
                      <span className="whitespace-pre-wrap">{m.text}</span>
                      <span className="block text-[9.5px] opacity-60 text-right mt-0.5">{clock(m.sentAt)}{m.fromId === me && (m.readAt ? ' · seen' : '')}</span>
                    </div>
                    {m.fromId === me && <Avatar id={me} name={getSession()?.user.name ?? ''} size={24} />}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              {err && <p className="px-3 text-[11px] text-rose-300">{err}</p>}
              <div className="p-2.5 flex items-center gap-2 border-t border-white/10 shrink-0">
                <input value={text} maxLength={1000} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a message" className="flex-1 rounded-full bg-white/10 px-3.5 py-2 text-xs outline-none placeholder:text-white/40" />
                <button onClick={send} disabled={!text.trim()} className="p-2 rounded-full bg-cyan-500 text-slate-900 disabled:opacity-40"><Send className="w-3.5 h-3.5" /></button>
              </div>
            </>
          )}
        </div>
        , document.body)}
    </>
  )
}
