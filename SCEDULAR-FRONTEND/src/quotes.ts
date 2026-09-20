// Small centralized quote collection for the dashboard "✨ SCEDULAR AI" card.
// Purely motivational — the AI makes NO allocation decisions anywhere in SCEDULAR.

export interface ScedularQuote {
  text: string
  author: string
}

export const SCEDULAR_QUOTES: ScedularQuote[] = [
  {
    text: 'Dream, dream, dream. Dreams transform into thoughts and thoughts result in action.',
    author: 'Dr. A.P.J. Abdul Kalam',
  },
  {
    text: 'Excellence is a continuous process and not an accident.',
    author: 'Dr. A.P.J. Abdul Kalam',
  },
  {
    text: 'You have to dream before your dreams can come true.',
    author: 'Dr. A.P.J. Abdul Kalam',
  },
]

/** Deterministic quote for a given day so the card is stable across reloads. */
export function quoteOfTheDay(now: Date = new Date()): ScedularQuote {
  const dayIndex = Math.floor(now.getTime() / 86_400_000)
  return SCEDULAR_QUOTES[dayIndex % SCEDULAR_QUOTES.length]
}

const SESSION_QUOTE_KEY = 'scedular_session_quote_index'

/**
 * Picks a fresh random quote and pins it for this login session (every
 * login gets a new one, but it stays stable across page navigation/reload
 * within that same session). Call this once, right when a login succeeds.
 */
export function rollSessionQuote(): void {
  try {
    sessionStorage.setItem(SESSION_QUOTE_KEY, String(Math.floor(Math.random() * SCEDULAR_QUOTES.length)))
  } catch {
    // sessionStorage unavailable (private mode etc) -- quoteOfSession falls back to the daily quote
  }
}

/** The quote pinned for this login session by rollSessionQuote(), falling back to the day's quote. */
export function quoteOfSession(): ScedularQuote {
  try {
    const raw = sessionStorage.getItem(SESSION_QUOTE_KEY)
    if (raw !== null) {
      const idx = Number(raw)
      if (Number.isInteger(idx) && idx >= 0 && idx < SCEDULAR_QUOTES.length) return SCEDULAR_QUOTES[idx]
    }
  } catch {
    // ignore
  }
  return quoteOfTheDay()
}
