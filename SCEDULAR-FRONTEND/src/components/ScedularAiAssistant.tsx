import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Bot } from 'lucide-react'
import { api } from '../api'

interface ScedularAiAssistantProps {
  role?: 'FACULTY' | 'HOD'
}

// Simple inline formatter for markdown bold (**text**), lists (- item), and line breaks
function FormattedText({ text }: { text: string }) {
  if (!text) return null

  const lines = text.split('\n')
  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, lIdx) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={lIdx} className="h-1.5" />

        const isList = trimmed.startsWith('- ') || trimmed.startsWith('* ')
        const content = isList ? trimmed.substring(2) : trimmed

        // Parse bold **text**
        const parts = content.split(/(\*\*.*?\*\*)/g)
        const parsed = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className="font-bold text-white">
                {part.slice(2, -2)}
              </strong>
            )
          }
          return part
        })

        if (isList) {
          return (
            <div key={lIdx} className="flex items-start gap-1.5 pl-2">
              <span className="text-cyan-400 font-bold">•</span>
              <span className="flex-1">{parsed}</span>
            </div>
          )
        }

        return <div key={lIdx}>{parsed}</div>
      })}
    </div>
  )
}

export default function ScedularAiAssistant({ role = 'FACULTY' }: ScedularAiAssistantProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string }>>([
    {
      sender: 'bot',
      text:
        role === 'HOD'
          ? 'Hello HOD! I am your SCEDULAR AI Assistant. I can answer questions about project identity, faculty allocations, experience policy, or timetable readiness.'
          : 'Hello! I am your SCEDULAR AI Assistant. Ask me about SCEDULAR creators, subject eligibility, preference rules, or timetables.',
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  const handleSend = async () => {
    if (!input.trim() || sending) return

    const userText = input.trim()
    setInput('')
    setMessages(prev => [...prev, { sender: 'user', text: userText }])
    setSending(true)

    try {
      const res = await api.facultyAllocation.aiChat(userText, role)
      setMessages(prev => [...prev, { sender: 'bot', text: res.reply }])
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: `Sorry, I couldn't reach the SCEDULAR AI service just now (${detail}). Please try again in a moment.`,
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-2xl shadow-cyan-500/40 hover:scale-105 transition transform flex items-center gap-2 border border-white/20"
        title="SCEDULAR AI Assistant"
      >
        <Sparkles className="w-5 h-5 text-white animate-pulse" />
        <span className="text-xs font-bold hidden md:inline tracking-wide">SCEDULAR AI</span>
      </button>

      {/* Drawer / Responsive Chat Modal */}
      {open && (
        <div className="fixed bottom-20 right-4 md:right-6 z-50 w-[90vw] md:w-[440px] max-w-[480px] h-[520px] max-h-[85vh] rounded-3xl bg-slate-900/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
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
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                  className={`px-4 py-3 rounded-2xl max-w-[85%] ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-tr-none shadow-md'
                      : 'bg-slate-800/90 text-slate-100 border border-white/10 rounded-tl-none shadow-sm'
                  }`}
                >
                  <FormattedText text={m.text} />
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-slate-950/90 border-t border-white/10 flex items-center gap-2 shrink-0">
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
