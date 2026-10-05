import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { runAssistant } from '../ai/assistant.js'
import { getAllocationSettings } from '../db/repo.js'

export const assistantRouter = Router()

/** The HOD can switch the assistant off for teachers (Settings -> Policy & cycle); the HOD is never blocked. */
async function enabledFor(role: string): Promise<boolean> {
  if (role === 'HOD') return true
  return (await getAllocationSettings()).facultyAiEnabled !== false
}

// GET /api/assistant/status -> { enabled } so the UI can hide the button for teachers
assistantRouter.get('/assistant/status', requireAuth, async (req, res, next) => {
  try { res.json({ enabled: await enabledFor(req.auth!.role) }) } catch (err) { next(err) }
})

const body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(6000) })).min(1).max(40) })

// POST /api/assistant/chat { messages: [{role, content}] } -> { reply, drafts }
assistantRouter.post('/assistant/chat', requireAuth, async (req, res, next) => {
  try {
    if (!(await enabledFor(req.auth!.role))) return res.status(403).json({ error: 'AI_DISABLED', message: 'SCEDULAR AI has been turned off for faculty by your HOD.' })
    const p = body.safeParse(req.body)
    if (!p.success || p.data.messages[p.data.messages.length - 1].role !== 'user') return res.status(400).json({ error: 'INVALID_INPUT', message: 'Send the conversation, ending with your question.' })
    const out = await runAssistant({ facultyId: req.auth!.facultyId, role: req.auth!.role, history: p.data.messages })
    if (!out) return res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'The AI service is not reachable right now (check GROQ_API_KEY and the internet connection).' })
    res.json(out)
  } catch (err) { next(err) }
})
