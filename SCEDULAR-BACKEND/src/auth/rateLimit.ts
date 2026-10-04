import type { Request, RequestHandler } from 'express'

/**
 * Slows down password guessing. A caller (IP address + the account they are trying) gets a few failed attempts per 15
 * minutes, then is told to wait. A correct sign-in clears the count. It is kept in the server's memory, so every server
 * instance counts on its own (good enough to stop guessing; it is not a full firewall).
 */
const WINDOW_MS = 15 * 60_000
const MAX_FAILS_PER_ACCOUNT = 8
const MAX_FAILS_PER_IP = 40
const MAX_RESET_MAILS = 5

type Entry = { count: number; first: number }
const byAccount = new Map<string, Entry>()
const byIp = new Map<string, Entry>()
const mails = new Map<string, Entry>()

const live = (m: Map<string, Entry>, key: string, now: number): Entry | undefined => {
  const e = m.get(key)
  if (e && now - e.first > WINDOW_MS) { m.delete(key); return undefined }
  return e
}
const bump = (m: Map<string, Entry>, key: string, now: number) => { const e = live(m, key, now); if (e) e.count++; else m.set(key, { count: 1, first: now }) }
const ident = (req: Request) => String(req.body?.facultyId ?? req.body?.username ?? req.body?.identifier ?? '').trim().toLowerCase()
const wait = (e: Entry, now: number) => Math.max(1, Math.ceil((WINDOW_MS - (now - e.first)) / 60_000))

export const loginLimiter: RequestHandler = (req, res, next) => {
  const now = Date.now(), ip = req.ip ?? 'unknown', key = `${ip}|${ident(req)}`
  const a = live(byAccount, key, now), i = live(byIp, ip, now)
  if ((a && a.count >= MAX_FAILS_PER_ACCOUNT) || (i && i.count >= MAX_FAILS_PER_IP)) {
    const minutes = wait((a && a.count >= MAX_FAILS_PER_ACCOUNT ? a : i)!, now)
    return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: `Too many failed sign-in attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.` })
  }
  res.on('finish', () => {
    if (res.statusCode === 401) { bump(byAccount, key, now); bump(byIp, ip, now) }
    else if (res.statusCode === 200) byAccount.delete(key)
  })
  next()
}

/** "Forgot password" sends an email, so the number of requests (not only failures) is limited. */
export const resetLimiter: RequestHandler = (req, res, next) => {
  const now = Date.now(), key = `${req.ip ?? 'unknown'}|${ident(req)}`
  const e = live(mails, key, now)
  if (e && e.count >= MAX_RESET_MAILS) {
    const minutes = wait(e, now)
    return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: `Too many requests. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.` })
  }
  bump(mails, key, now)
  next()
}

/** For tests. */
export function resetRateLimits() { byAccount.clear(); byIp.clear(); mails.clear() }
