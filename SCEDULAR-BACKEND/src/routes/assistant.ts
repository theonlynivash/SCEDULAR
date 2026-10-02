import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { runAssistant } from '../ai/assistant.js'

export const assistantRouter = Router()

const body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(6000) })).min(1).max(40) })

// POST /api/assistant/chat { messages: [{role, content}] } -> { reply, drafts }
assistantRouter.post('/assistant/chat', requireAuth, async (req, res, next) => {
  try {
    const p = body.safeParse(req.body)
    if (!p.success || p.data.messages[p.data.messages.length - 1].role !== 'user') return res.status(400).json({ error: 'INVALID_INPUT', message: 'Send the conversation, ending with your question.' })
    const out = await runAssistant({ facultyId: req.auth!.facultyId, role: req.auth!.role, history: p.data.messages })
    if (!out) return res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'The AI service is not reachable right now (check GROQ_API_KEY and the internet connection).' })
    res.json(out)
  } catch (err) { next(err) }
})
