// Motivational quotes — fetched from API at login, cached for the session.
// Falls back to a local curated list if the API is unreachable.

export interface ScedularQuote {
  text: string
  author: string
}

const SESSION_KEY = 'scedular_session_quote'

// Curated fallback — professional, motivational, not corny.
const FALLBACK_QUOTES: ScedularQuote[] = [
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Quality is not an act, it is a habit.', author: 'Aristotle' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { text: 'What we think, we become.', author: 'Buddha' },
  { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'Excellence is not a destination but a continuous journey.', author: 'B. Bush' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Never let the fear of striking out keep you from playing the game.', author: 'Babe Ruth' },
  { text: 'Everything you can imagine is real.', author: 'Pablo Picasso' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'The only limit to our realization of tomorrow is our doubts of today.', author: 'Franklin D. Roosevelt' },
  { text: 'Hard work beats talent when talent doesn\'t work hard.', author: 'Tim Notke' },
  { text: 'Push yourself, because no one else is going to do it for you.', author: 'Unknown' },
]

function pickLocal(): ScedularQuote {
  const idx = Math.floor(Math.random() * FALLBACK_QUOTES.length)
  return FALLBACK_QUOTES[idx]
}

/**
 * Fetch a random quote from the API. Cached in sessionStorage for the
 * duration of the login session (one fetch per login, never stale).
 * If the API is unreachable, falls back to a local curated quote.
 */
export async function fetchSessionQuote(): Promise<ScedularQuote> {
  // Return cached quote if available
  try {
    const cached = sessionStorage.getItem(SESSION_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as ScedularQuote
      if (parsed.text && parsed.author) return parsed
    }
  } catch { /* ignore */ }

  // Fetch from API
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000) // 4s timeout
    const res = await fetch('https://dummyjson.com/quotes/random', { signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json()
      const quote: ScedularQuote = { text: data.quote, author: data.author }
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(quote)) } catch { /* ignore */ }
      return quote
    }
  } catch { /* API unreachable */ }

  // Fallback: local quote
  const fallback = pickLocal()
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(fallback)) } catch { /* ignore */ }
  return fallback
}

/**
 * Synchronous accessor for the already-fetched quote (used by Dashboard
 * after the initial async fetch completes). Returns a local fallback if
 * the async fetch hasn't finished yet.
 */
export function getCachedQuote(): ScedularQuote | null {
  try {
    const cached = sessionStorage.getItem(SESSION_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as ScedularQuote
      if (parsed.text && parsed.author) return parsed
    }
  } catch { /* ignore */ }
  return null
}
