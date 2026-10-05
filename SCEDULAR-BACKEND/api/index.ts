/**
 * ⚠️  NOT THE REAL ENTRYPOINT — this file is intentionally inert.
 *
 * The canonical Vercel serverless entrypoint for the MONOREPO build lives at:
 *     /api/index.ts   (repo root, next to vercel.json)
 *
 * That root /api/index.ts imports the Express app from ../SCEDULAR-BACKEND/src/app.ts
 * and is mounted by vercel.json via:
 *     { "source": "/api/:path*", "destination": "/api/index" }
 *
 * Why this file still exists:
 *   - It was used during early single-project (Root Directory = SCEDULAR-BACKEND)
 *     experiments and removing it now could break local tooling that expects it.
 *   - On the monorepo build, Vercel's function scanner ignores it because the
 *     project-level "functions" config in vercel.json only targets /api/index.ts.
 *   - If Vercel ever does try to compile it, it throws immediately with a clear
 *     pointer to the real file, instead of a confusing path-doubling ENOENT.
 */
export default function _legacyEntryNotUsed() {
  throw new Error(
    'Wrong Vercel entrypoint: expected /api/index.ts at repo root, not SCEDULAR-BACKEND/api/index.ts. '
    + 'Set Vercel Project → Settings → General → Root Directory to EMPTY (or ".") so vercel.json at repo root is honored.'
  )
}

