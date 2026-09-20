// Root Vercel Serverless Function entry point.
// Serves /api/* on the same domain as the frontend SPA (CORS-free in prod).
import 'dotenv/config'
import { app } from '../SCEDULAR-BACKEND/src/app.js'

export default app