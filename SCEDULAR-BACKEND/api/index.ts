// Vercel serverless entry point. Vercel's Node runtime accepts an Express
// app directly as the default export -- every request to any path routed
// here (see vercel.json) is dispatched through Express's own routing,
// which already expects the full "/api/..." paths used by src/app.ts.
import { app } from '../src/app.js'

export default app
