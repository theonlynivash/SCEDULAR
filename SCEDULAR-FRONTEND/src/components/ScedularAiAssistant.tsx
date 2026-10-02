import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, X, Send, Bot } from 'lucide-react'
import { api } from '../api'

interface ScedularAiAssistantProps {
  role?: 'FACULTY' | 'HOD'
}

/* ── Typewriter hook: reveals text character-by-character ── */
function useTypewriter(fullText: string, speed = 12) {
  const [visible, setVisible] = useState('')
  const [done, setDone] = useState(false)
  const idx = useRef(0)

  useEffect(() => {
    idx.current = 0
    setVisible('')
    setDone(false)

    if (!fullText) { setDone(true); return }

    const id = setInterval(() => {
      idx.current += 1
      setVisible(fullText.slice(0, idx.current))
      if (idx.current >= fullText.length) {
        clearInterval(id)
        setDone(true)
      }
    }, speed)

    return () => clearInterval(id)
  }, [fullText, speed])

  return { visible, done }
}

/* ── Typing indicator dots ── */
function TypingIndicator() {
  return (
    <div className="flex gap-2.5 justify-start">
      <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-slate-800/90 border border-white/10 shadow-sm flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

/* ── Renders a single bot message with typewriter effect ── */
function BotMessage({ text, drafts }: { text: string; drafts?: Draft[] }) {
  const { visible, done } = useTypewriter(text, 2)

  return (
    <div className="flex gap-2.5 justify-start">
      <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div
        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        className="px-4 py-3 rounded-2xl rounded-tl-none bg-slate-800/90 text-slate-100 border border-white/10 shadow-sm max-w-[85%]"
      >
        <FormattedText text={visible} />
        {!done && (
          <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-0.5 animate-pulse rounded-sm" />
        )}
        {done && drafts?.map((d, i) => <DraftCard key={i} draft={d} />)}
      </div>
    </div>
  )
}

/* ── Small Markdown renderer: **bold**, bullets, numbered lists, headings and tables (no raw HTML) ── */
const inline = (t: string) => t.split(/(\*\*.*?\*\*)/g).map((part, i) =>
  part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong> : part)

function FormattedText({ text }: { text: string }) {
  if (!text) return null
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) { out.push(<div key={i} className="h-1.5" />); continue }
    if (trimmed.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      i--
      out.push(
        <div key={i} className="overflow-x-auto my-1">
          <table className="text-[11px] border-collapse">
            <tbody>{rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => ri === 0
                ? <th key={ci} className="px-2 py-1 text-left text-cyan-300 font-semibold border-b border-white/15 whitespace-nowrap">{inline(c)}</th>
                : <td key={ci} className="px-2 py-1 border-b border-white/5 align-top">{inline(c)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>,
      )
      continue
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(trimmed)
    if (heading) { out.push(<div key={i} className="font-bold text-white pt-1">{inline(heading[1])}</div>); continue }
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed)
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed)
    if (bullet || numbered) {
      out.push(
        <div key={i} className="flex items-start gap-1.5 pl-2">
          <span className="text-cyan-400 font-bold">{numbered ? `${numbered[1]}.` : '•'}</span>
          <span className="flex-1">{inline(bullet ? bullet[1] : numbered![2])}</span>
        </div>,
      )
      continue
    }
    out.push(<div key={i}>{inline(trimmed)}</div>)
  }
  return <div className="space-y-1 leading-relaxed">{out}</div>
}

type Draft = { facultyId: string; name: string; email: string | null; subject: string; body: string }

/* ── An email the assistant prepared: the HOD can tweak it and press Send (it is never sent automatically) ── */
function DraftCard({ draft }: { draft: Draft }) {
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [credentials, setCredentials] = useState<'none' | 'id' | 'new'>('none')
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; text?: string }>({ kind: 'idle' })
  const send = async () => {
    setState({ kind: 'sending' })
    try {
      const r = await api.mail.send({ facultyId: draft.facultyId, subject, body, credentials })
      setState({ kind: 'sent', text: `Sent to ${r.to}` })
    } catch (e) {
      setState({ kind: 'error', text: e instanceof Error ? e.message : 'Could not send.' })
    }
  }
  return (
    <div className="mt-2 rounded-xl border border-cyan-500/30 bg-slate-900/80 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">Email draft → {draft.name}{draft.email ? ` (${draft.email})` : ''}</p>
      {!draft.email && <p className="text-[11px] text-amber-300">No email address on file for this teacher — add one on the Teachers page first.</p>}
      <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
      <div className="flex items-center gap-2">
        <select value={credentials} onChange={e => setCredentials(e.target.value as 'none' | 'id' | 'new')} className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white">
          <option value="none">No login details</option>
          <option value="id">Include login ID</option>
          <option value="new">Include NEW password</option>
        </select>
        <button onClick={send} disabled={!draft.email || state.kind === 'sending' || state.kind === 'sent'} className="ml-auto px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-[11px] disabled:opacity-40">
          {state.kind === 'sending' ? 'Sending…' : state.kind === 'sent' ? 'Sent ✓' : 'Send'}
        </button>
      </div>
      {state.text && <p className={`text-[11px] ${state.kind === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{state.text}</p>}
    </div>
  )
}

export default function ScedularAiAssistant({ role = 'FACULTY' }: ScedularAiAssistantProps) {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(true)
  useEffect(() => { api.assistant.status().then(r => setEnabled(r.enabled)).catch(() => {}) }, [])
  const [messages, setMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string; id: number; drafts?: Draft[] }>>([
    {
      id: 0,
      sender: 'bot',
      text: role === 'HOD'
        ? 'Hi! I can look up anything in SCEDULAR — teachers, subjects, sections, workload, timetables, results — explain how things work, and draft emails for you to send. Pick a preset below or just ask.'
        : 'Hi! I can show your timetable, subjects and results, explain how SCEDULAR works, or help you write something. Pick a preset below or just ask.',
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const msgId = useRef(1)
  const [showChips, setShowChips] = useState(true)

  type Preset = { group: string; items: { label: string; prompt: string }[] }
  const hodPresets: Preset[] = [
    { group: 'Status', items: [
      { label: 'Project summary', prompt: 'Give me a short summary of the project: counts, the latest timetable run and anything that needs my attention.' },
      { label: 'Any timetable problems?', prompt: 'Are there any conflicts or unscheduled periods in the latest timetable? Explain them simply.' },
      { label: 'Subjects without a teacher', prompt: 'Which subject offerings still have no teacher assigned?' },
    ] },
    { group: 'Teachers', items: [
      { label: 'Heaviest workloads', prompt: 'Show the 10 teachers with the highest weekly load against their limit, as a table.' },
      { label: 'Lightest workloads', prompt: 'Which teachers have the lightest weekly load right now?' },
      { label: 'Best pass percentages', prompt: 'Rank teachers by their average past pass percentage and show the top 5 and bottom 5.' },
    ] },
    { group: 'Sections & timetable', items: [
      { label: 'Class in-charges', prompt: 'List the class in-charge of every section, grouped by semester.' },
      { label: 'Timetable of Y4-A', prompt: 'Show the timetable of section Y4-A as a table, one row per day.' },
    ] },
    { group: 'Write & help', items: [
      { label: 'Email: results reminder', prompt: 'Draft an email to the teachers whose past results are missing, asking them to add their pass percentages on the Profile page. Ask me which teacher first if you need to.' },
      { label: 'Email: thank a teacher', prompt: 'Help me write a thank-you email to a teacher. Ask me who it is and what for.' },
      { label: 'How does SCEDULAR work?', prompt: 'Explain the full SCEDULAR workflow from setup to the printed timetable in 6 short steps.' },
    ] },
  ]
  const facultyPresets: Preset[] = [
    { group: 'My work', items: [
      { label: 'My timetable', prompt: 'Show my weekly timetable as a table, one row per day.' },
      { label: 'What do I teach?', prompt: 'Which subjects and sections do I teach, and how many periods is that per week?' },
      { label: 'My workload', prompt: 'What is my weekly load compared with my limit?' },
    ] },
    { group: 'My results', items: [
      { label: 'My pass percentages', prompt: 'Show the past pass percentages I recorded and my average.' },
    ] },
    { group: 'Help', items: [
      { label: 'How do I pick subjects?', prompt: 'How do I choose my preferred subjects, and how many can I pick?' },
      { label: 'How does SCEDULAR work?', prompt: 'Explain the SCEDULAR workflow in 5 short steps from a teacher\'s point of view.' },
      { label: 'Write a message to the HOD', prompt: 'Help me write a short, polite message to the HOD. Ask me what it is about.' },
    ] },
  ]
  const presets = role === 'HOD' ? hodPresets : facultyPresets

  useEffect(() => {
    if (open) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, sending])

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const ask = useCallback(async (userText: string) => {
    if (!userText.trim() || sending) return
    const history = [...messagesRef.current.slice(1), { sender: 'user' as const, text: userText, id: -1 }]
      .map(m => ({ role: m.sender === 'user' ? 'user' as const : 'assistant' as const, content: m.text }))
    setMessages(prev => [...prev, { sender: 'user', text: userText, id: msgId.current++ }])
    setSending(true)
    try {
      const res = await api.assistant.chat(history)
      setMessages(prev => [...prev, { sender: 'bot', text: res.reply, drafts: res.drafts, id: msgId.current++ }])
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => [...prev, { sender: 'bot', text: `Sorry, I couldn't get an answer just now (${detail}).`, id: msgId.current++ }])
    } finally {
      setSending(false)
    }
  }, [sending])

  const handleSend = useCallback(() => { const t = input.trim(); if (!t) return; setInput(''); void ask(t) }, [input, ask])

  if (!enabled) return null   // the HOD switched SCEDULAR AI off for faculty

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 px-4 py-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-2xl shadow-cyan-500/40 hover:scale-105 transition transform flex items-center gap-2 border border-white/20"
        title="SCEDULAR AI Assistant"
      >
        <Sparkles className="w-5 h-5 text-white animate-pulse" />
        <span className="text-xs font-bold hidden md:inline tracking-wide">SCEDULAR AI</span>
      </button>

      {/* Drawer / Responsive Chat Modal */}
      {open && (
        <div className="fixed bottom-40 md:bottom-20 right-4 md:right-6 z-50 w-[92vw] md:w-[520px] max-w-[560px] h-[640px] max-h-[calc(100vh-11rem)] md:max-h-[88vh] rounded-3xl bg-slate-900/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-slate-950/90 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">SCEDULAR AI Assistant</h3>
                <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">{role} Mode</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs">
            {messages.map((m) => {
              if (m.sender === 'user') {
                return (
                  <div key={m.id} className="flex gap-2.5 justify-end">
                    <div
                      style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                      className="px-4 py-3 rounded-2xl rounded-tr-none bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium max-w-[85%] shadow-md"
                    >
                      <FormattedText text={m.text} />
                    </div>
                  </div>
                )
              }
              // Bot message with typewriter effect
              return <BotMessage key={m.id} text={m.text} drafts={m.drafts} />
            })}

            {/* Preset chats */}
            {showChips && (
              <div className="space-y-3 pt-1">
                {presets.map(g => (
                  <div key={g.group} className="space-y-1.5">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{g.group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map(it => (
                        <button
                          key={it.label}
                          onClick={() => { setShowChips(false); void ask(it.prompt) }}
                          className="px-3 py-1.5 rounded-full bg-slate-800/80 border border-cyan-500/30 text-cyan-300 text-[11px] hover:bg-cyan-500/20 hover:border-cyan-400 transition cursor-pointer"
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Typing indicator while waiting for response */}
            {sending && <TypingIndicator />}

            <div ref={chatEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-slate-950/90 border-t border-white/10 flex items-center gap-2 shrink-0">
            <button onClick={() => setShowChips(v => !v)} title="Preset chats" className={`p-2.5 rounded-xl border border-white/10 transition ${showChips ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-cyan-300'}`}><Sparkles className="w-3.5 h-3.5" /></button>
            <input
              type="text"
              placeholder="Ask SCEDULAR AI..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="p-2.5 rounded-xl bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-bold transition disabled:opacity-50 flex items-center justify-center"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
