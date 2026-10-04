import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { deleteFacultyPhoto, getFaculty, getFacultyPhoto, setFacultyPhoto } from '../db/repo.js'

/** Profile pictures. Anyone signed in can see them (chat, lists); a teacher changes their own, the HOD anyone's. */
export const photosRouter = Router()

const MAX_BYTES = 300 * 1024
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

// GET /api/faculty/:id/photo -> the image itself (the browser fetches it with the session token)
photosRouter.get('/faculty/:id/photo', requireAuth, async (req, res, next) => {
  try {
    const p = await getFacultyPhoto(String(req.params.id))
    const m = p && DATA_URL.exec(p.data)
    if (!p || !m) return res.status(404).json({ error: 'NO_PHOTO', message: 'No picture yet.' })
    res.setHeader('Content-Type', m[1])
    res.setHeader('Cache-Control', 'private, max-age=600')
    res.send(Buffer.from(m[2], 'base64'))
  } catch (err) { next(err) }
})

const allowed = (req: any) => req.auth!.role === 'HOD' || req.auth!.facultyId === req.params.id

// PUT /api/faculty/:id/photo { image: "data:image/jpeg;base64,..." }
photosRouter.put('/faculty/:id/photo', requireAuth, async (req, res, next) => {
  try {
    if (!allowed(req)) return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only change your own picture.' })
    const p = z.object({ image: z.string().max(600_000) }).safeParse(req.body)
    const m = p.success ? DATA_URL.exec(p.data.image) : null
    if (!p.success || !m) return res.status(400).json({ error: 'INVALID_IMAGE', message: 'Send a JPEG, PNG or WebP picture.' })
    if (Buffer.from(m[2], 'base64').length > MAX_BYTES) return res.status(400).json({ error: 'IMAGE_TOO_LARGE', message: 'The picture is too large (300 KB at most). Pick a smaller one.' })
    if (!(await getFaculty(req.params.id))) return res.status(404).json({ error: 'NOT_FOUND', message: 'Teacher not found.' })
    res.json({ success: true, photoAt: await setFacultyPhoto(req.params.id, p.data.image) })
  } catch (err) { next(err) }
})

// DELETE /api/faculty/:id/photo
photosRouter.delete('/faculty/:id/photo', requireAuth, async (req, res, next) => {
  try {
    if (!allowed(req)) return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only change your own picture.' })
    await deleteFacultyPhoto(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
})
