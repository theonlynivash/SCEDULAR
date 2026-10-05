// Root Vercel Serverless Function entry point.
// Serves /api/* on the same domain as the frontend SPA (CORS-free in prod).
//
// ⚠️  For this entry point to resolve correctly, the Vercel Project's
//     "Root Directory" setting (Project → Settings → General) MUST be empty
//     (or ".") so the working directory during install/build/run is the repo
//     root (the one that contains SCEDULAR-BACKEND/, SCEDULAR-FRONTEND/, api/,
//     and vercel.json). Any other value will cause a path/ENOENT error below.
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const expectedAppSrc = path.resolve(__dirname, '..', 'SCEDULAR-BACKEND', 'src', 'app.js')
if (!fs.existsSync(expectedAppSrc)) {
  const expectedAppDist = path.resolve(__dirname, '..', 'SCEDULAR-BACKEND', 'dist', 'app.js')
  if (!fs.existsSync(expectedAppDist)) {
    console.error('═══════════════════════════════════════════════════════════════')
    console.error('[FATAL] api/index.ts cannot locate the backend Express app.')
    console.error('         current working dir  :', process.cwd())
    console.error('         entry file dir       :', __dirname)
    console.error('         looked for (src path) :', expectedAppSrc)
    console.error('         looked for (dist path):', expectedAppDist)
    console.error('')
    console.error('         FIX: Vercel → Project → Settings → General → Root Directory')
    console.error('         → DELETE everything in the box, leave it EMPTY, then Save.')
    console.error('         (If blank is refused, type a single dot:  . )')
    console.error('         Then REDEPLOY this commit.')
    console.error('═══════════════════════════════════════════════════════════════')
    throw new Error(
      'Backend source missing at ' + expectedAppSrc +
      ' — fix Vercel Root Directory to EMPTY (Settings → General) and redeploy.'
    )
  }
}

import { app } from '../SCEDULAR-BACKEND/src/app.js'
export default app