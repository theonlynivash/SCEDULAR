// Local-dev-only entry point: runs the Express app as a normal long-lived
// server. The Vercel deployment instead uses api/index.ts, which imports
// the same app.js and lets Vercel's Node runtime handle the listening
// (env vars there come from the Vercel project settings, not a .env file).
import 'dotenv/config'
import { app } from './app.js'

const PORT = Number(process.env.PORT) || 8090
app.listen(PORT, () => {
  console.log(`SCEDULAR backend listening on http://localhost:${PORT}`)
})
