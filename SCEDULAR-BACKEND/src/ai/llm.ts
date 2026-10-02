/** GroqCloud / Grok chat-completion helper. Returns null when no API key is configured or the call fails. */
export async function callLlm(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.LLM_API_KEY

  if (!apiKey || apiKey.includes('your_')) {
    return null
  }

  const isGroq = apiKey.startsWith('gsk_') || process.env.LLM_PROVIDER === 'groq'
  const defaultBase = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.x.ai/v1'
  const defaultModel = isGroq ? 'qwen/qwen3.8-27b' : 'grok-beta'

  const apiBase = process.env.GROQ_API_BASE || process.env.GROK_API_BASE || defaultBase
  const model = process.env.GROQ_MODEL || process.env.GROK_MODEL || defaultModel

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.warn(`[Groq API] Request failed (${response.status}): ${errText}`)
      return null
    }

    const data: any = await response.json()
    const text: string | null = data?.choices?.[0]?.message?.content ?? null
    // some reasoning models prefix their answer with <think>…</think>
    return text ? text.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : null
  } catch (err) {
    console.warn('[Groq API] Error calling Groq LLM API:', err)
    return null
  }
}


export interface ToolDef { name: string; description: string; parameters: Record<string, unknown> }
type ChatMsg = { role: string; content?: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string }

/**
 * Chat completion with function calling: the model may call the given tools (run via `runTool`) for up to `maxSteps`
 * rounds before it must answer. Returns null when no API key is set or the provider fails.
 */
export async function callLlmWithTools(
  messages: ChatMsg[],
  tools: ToolDef[],
  runTool: (name: string, args: any) => Promise<unknown>,
  maxSteps = 6,
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.LLM_API_KEY
  if (!apiKey || apiKey.includes('your_')) return null
  const isGroq = apiKey.startsWith('gsk_') || process.env.LLM_PROVIDER === 'groq'
  const apiBase = process.env.GROQ_API_BASE || process.env.GROK_API_BASE || (isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.x.ai/v1')
  const model = process.env.GROQ_MODEL || process.env.GROK_MODEL || (isGroq ? 'qwen/qwen3.8-27b' : 'grok-beta')
  const convo: ChatMsg[] = [...messages]
  const clean = (t: string | null | undefined) => (t ? t.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : null)

  for (let step = 0; step <= maxSteps; step++) {
    let data: any
    try {
      const send = () => fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages: convo, temperature: 0.2,
          ...(step < maxSteps ? { tools: tools.map(t => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}),
        }),
      })
      let r = await send()
      // free-tier token-per-minute limit: wait the time the provider asks for (max 25s, twice) and retry
      for (let tries = 0; r.status === 429 && tries < 2; tries++) {
        const txt = await r.text().catch(() => '')
        const wait = Math.min(25, Number(/try again in ([\d.]+)s/i.exec(txt)?.[1] ?? 10) + 1)
        await new Promise(res => setTimeout(res, wait * 1000))
        r = await send()
      }
      if (!r.ok) { console.warn(`[LLM] tools request failed (${r.status}): ${(await r.text().catch(() => '')).slice(0, 300)}`); return null }
      data = await r.json()
    } catch (err) { console.warn('[LLM] tools request error:', err); return null }

    const msg = data?.choices?.[0]?.message
    if (!msg) return null
    const calls: any[] = msg.tool_calls ?? []
    if (!calls.length) return clean(msg.content)
    convo.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls })
    for (const c of calls) {
      let out: unknown
      try { out = await runTool(c.function?.name, JSON.parse(c.function?.arguments || '{}')) }
      catch (e: any) { out = { error: String(e?.message ?? e) } }
      let s = JSON.stringify(out)
      if (s.length > 7000) s = s.slice(0, 7000) + '…(truncated)'
      convo.push({ role: 'tool', tool_call_id: c.id, name: c.function?.name, content: s })
    }
  }
  return null
}
