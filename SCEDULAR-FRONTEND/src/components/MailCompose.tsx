import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Sparkles, Send, Mail, KeyRound, User } from 'lucide-react'
import { api, type FacultyProfile, type MailLogRow, type MailStatus, type ResultSummary } from '../api'

const field = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-[13px] text-slate-800 focus:outline-none focus:border-[color:var(--c-600)] focus:ring-2 focus:ring-[color:var(--c-600)]/15'
const cap = 'block text-[11px] font-600 uppercase tracking-wider text-slate-500 mb-1.5'
const glass = 'rounded-2xl bg-gradient-to-br from-white/60 to-white/25 backdrop-blur-xl ring-1 ring-[color:var(--ink-800)]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_24px_rgba(var(--ink-rgb),0.06)]'

/** "Dr.T.VEERAMANI" -> "VE": the first letters of the longest word of the name. */
const initials = (name: string) => (name.replace(/^(Dr|Mr|Mrs|Ms)\.?\s*/i, '').split(/[\s.]+/).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? name).slice(0, 2).toUpperCase()

type Creds = 'none' | 'id' | 'new'
const CREDS: { id: Creds; title: string; hint: string; icon: any }[] = [
  { id: 'none', title: 'No login details', hint: 'Just the message.', icon: Mail },
  { id: 'id', title: 'Login ID only', hint: 'Adds their ID. Their password stays as it is.', icon: User },
  { id: 'new', title: 'New password', hint: 'Creates a new password, adds it, and replaces the old one.', icon: KeyRound },
]

const IDEAS = [
  'Congratulate them on an achievement or award',
  'Share their login details',
  'Ask them to update their past semester results',
  'Remind them to submit their subject choices',
]

/** HOD → one teacher. Write by hand or describe what you want and let the assistant draft it. */
export default function MailCompose({ facultyId, onBack }: { facultyId: string; onBack: () => void }) {
  const [teacher, setTeacher] = useState<FacultyProfile | null>(null)
  const [status, setStatus] = useState<MailStatus | null>(null)
  const [results, setResults] = useState<ResultSummary | null>(null)
  const [log, setLog] = useState<MailLogRow[]>([])
  const [prompt, setPrompt] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [source, setSource] = useState<'ai' | 'template' | null>(null)
  const [creds, setCreds] = useState<Creds>('none')
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [checking, setChecking] = useState(false)

  const load = useCallback(async () => {
    try {
      const [t, st, r, l] = await Promise.all([api.faculty.profile(facultyId), api.mail.status(), api.results.hodDetail(facultyId).catch(() => null), api.mail.log(facultyId).catch(() => [])])
      setTeacher(t); setStatus(st); setResults(r?.summary ?? null); setLog(l)
    } catch (e: any) { setNotice({ ok: false, text: e?.message || 'Could not load the teacher.' }) }
  }, [facultyId])
  useEffect(() => { load() }, [load])

  const first = teacher?.name.replace(/^(Dr|Mr|Mrs|Ms)\.?\s*/i, '') ?? 'the teacher'

  async function draft() {
    setDrafting(true); setNotice(null)
    try {
      const d = await api.mail.draft(facultyId, prompt)
      setSubject(d.subject); setBody(d.body); setSource(d.source)
    } catch (e: any) { setNotice({ ok: false, text: e?.message || 'Could not write a draft.' }) }
    finally { setDrafting(false) }
  }

  async function checkSetup() {
    setChecking(true); setNotice(null)
    try { const r = await api.mail.check(); setNotice({ ok: r.ok, text: r.message }) }
    catch (e: any) { setNotice({ ok: false, text: e?.message || 'Could not check the mail setup.' }) }
    finally { setChecking(false) }
  }

  async function saveEmail() {
    try { await api.setup.updateTeacher(facultyId, { email: newEmail.trim() || null }); setNewEmail(''); await load() }
    catch (e: any) { setNotice({ ok: false, text: e?.message || 'Could not save the email.' }) }
  }

  async function send() {
    if (creds === 'new' && !window.confirm(`This creates a new password for ${teacher?.name} and emails it. Their old password stops working. Continue?`)) return
    setSending(true); setNotice(null)
    try {
      const r = await api.mail.send({ facultyId, subject, body, credentials: creds })
      setNotice({ ok: true, text: `Sent to ${r.to}.` })
      setSubject(''); setBody(''); setSource(null); setCreds('none'); setPrompt('')
      await load()
    } catch (e: any) { setNotice({ ok: false, text: e?.message || 'The mail could not be sent.' }) }
    finally { setSending(false) }
  }

  if (!teacher) return <p className="text-sm text-slate-500 py-16 text-center">{notice?.text ?? 'Loading…'}</p>

  const canSend = !!teacher.email && !!status?.configured && subject.trim().length > 0 && body.trim().length > 0 && !sending
  const mailto = teacher.email ? `mailto:${teacher.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : ''

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-500 text-[color:var(--c-700)] bg-white/40 backdrop-blur ring-1 ring-[color:var(--c-700)]/20 hover:bg-white/70"><ArrowLeft size={14} /> Teachers</button>
        <h1 className="font-display font-600 text-[22px] text-slate-800">Send mail</h1>
      </div>

      {notice && <div className={`rounded-2xl px-4 py-3 text-[13px] ${notice.ok ? 'bg-[color:var(--c-500)]/10 text-[color:var(--c-700)] ring-1 ring-[color:var(--c-500)]/20' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>{notice.text}</div>}

      <div className="mail-split">
        {/* recipient */}
        <div className="space-y-4">
          <div className={`${glass} p-5`}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full grid place-items-center text-[color:var(--accent)] font-600 bg-gradient-to-br from-[var(--c-700)] to-[var(--ink-850)]">{initials(teacher.name)}</div>
              <div className="min-w-0"><p className="text-[15px] font-600 text-slate-800 truncate">{teacher.name}</p><p className="text-[12px] text-slate-500 truncate">{teacher.designation || 'Faculty'} · {teacher.id}</p></div>
            </div>
            <div className="mt-4 text-[13px]">
              <p className={cap}>Email</p>
              {teacher.email ? <p className="text-slate-800 break-all">{teacher.email}</p> : (
                <div className="flex gap-2"><input className={field} type="email" placeholder="name@gmail.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                  <button disabled={!newEmail.includes('@')} onClick={saveEmail} className="px-3 rounded-xl text-[12.5px] font-500 text-white bg-[color:var(--c-700)] disabled:opacity-40">Save</button></div>
              )}
            </div>
            {results?.average != null && (
              <div className="mt-4"><p className={cap}>Average pass in past semesters</p><p className="text-[20px] font-display font-600 text-[color:var(--c-700)]">{results.average}%<span className="text-[12px] font-400 text-slate-400"> · {results.count} subject{results.count === 1 ? '' : 's'}</span></p></div>
            )}
          </div>

          <div className={`${glass} p-5`}>
            <p className={cap}>Recent mails to {first}</p>
            {log.length === 0 ? <p className="text-[12.5px] text-slate-400">None yet.</p> : (
              <div className="space-y-2.5">
                {log.slice(0, 6).map(m => (
                  <div key={m.id} className="text-[12.5px]">
                    <p className="text-slate-700 truncate">{m.subject}</p>
                    <p className="text-[11px] text-slate-400">{new Date(m.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{m.credentials !== 'none' && ` · ${m.credentials === 'new' ? 'new password' : 'login ID'} included`}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="space-y-4">
          <div className={`${glass} p-5`}>
            <div className="flex items-center gap-2 mb-2"><Sparkles size={15} className="text-[color:var(--accent-dark)]" /><h2 className="text-[14px] font-600 text-slate-800">Write it with AI</h2><span className="text-[11.5px] text-slate-400">describe it in a few words</span></div>
            <textarea className={`${field} resize-none`} rows={2} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={`e.g. Congratulate ${first} on the best paper award and invite them to share it at the next department meeting`} />
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {IDEAS.map(i => <button key={i} onClick={() => setPrompt(`${i}.`)} className="px-3 py-1 rounded-full text-[11.5px] text-[color:var(--c-700)] bg-white/50 ring-1 ring-[color:var(--c-700)]/15 hover:bg-white/80">{i}</button>)}
              <button disabled={drafting || prompt.trim().length < 3} onClick={draft} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-500 text-[color:var(--c-700)] bg-[color:var(--accent)]/90 hover:bg-[color:var(--accent)] disabled:opacity-40"><Sparkles size={13} /> {drafting ? 'Writing…' : 'Write draft'}</button>
            </div>
          </div>

          <div className={`${glass} p-5 space-y-4`}>
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-600 text-slate-800">Your message</h2>
              {source === 'ai' && <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[color:var(--c-500)]/10 text-[color:var(--c-700)]">AI draft · read it before sending</span>}
              {source === 'template' && <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Basic draft · AI is unavailable, please edit</span>}
            </div>
            <label className="block"><span className={cap}>Subject</span><input className={field} value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} placeholder="Subject line" /></label>
            <label className="block"><span className={cap}>Message</span><textarea className={`${field} font-[inherit] leading-relaxed`} rows={11} value={body} onChange={e => setBody(e.target.value)} placeholder={`Dear ${first},\n\n…`} /></label>

            <div>
              <span className={cap}>Login details</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {CREDS.map(c => (
                  <button key={c.id} onClick={() => setCreds(c.id)} className={`text-left rounded-2xl px-3.5 py-3 transition ring-1 ${creds === c.id ? 'bg-white/90 ring-[color:var(--c-500)] shadow-sm' : 'bg-white/40 ring-[color:var(--ink-800)]/10 hover:bg-white/70'}`}>
                    <c.icon size={15} className={creds === c.id ? 'text-[color:var(--c-500)]' : 'text-slate-400'} />
                    <p className="text-[13px] font-500 text-slate-800 mt-1.5">{c.title}</p>
                    <p className="text-[11.5px] text-slate-500 leading-snug mt-0.5">{c.hint}</p>
                  </button>
                ))}
              </div>
              {creds === 'new' && <p className="text-[12px] text-amber-700 mt-2">The old password stops working as soon as the mail is sent. A password that is already set cannot be read back, so “current password” cannot be emailed; choose “Login ID only” to remind them of their ID.</p>}
            </div>

            {!teacher.email && <p className="text-[12.5px] text-amber-700">Add {first}'s email on the left before sending.</p>}
            {status && !status.configured && (
              <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-[12.5px] text-amber-800">
                Sending is not set up on the server yet, so mail cannot go out from here. Add <b>SMTP_USER</b> and <b>SMTP_PASS</b> (a Gmail app password) to the backend <code>.env</code>.
                {teacher.email && creds !== 'new' && <> Meanwhile you can <a className="underline font-500" href={mailto}>open this in your own mail app</a>.</>}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button disabled={!canSend} onClick={send} className="flex items-center gap-1.5 px-6 py-2.5 rounded-full text-[13px] font-500 text-white bg-gradient-to-br from-[var(--c-700)] to-[var(--ink-850)] shadow-[0_4px_14px_rgba(10,29,69,0.28)] disabled:opacity-40"><Send size={14} /> {sending ? 'Sending…' : 'Send mail'}</button>
              {teacher.email && <span className="text-[12px] text-slate-500">to {teacher.email}</span>}
              <button onClick={checkSetup} disabled={checking} className="ml-auto text-[12px] text-[color:var(--c-500)] hover:underline disabled:opacity-50">{checking ? 'Checking…' : 'Check mail setup'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
