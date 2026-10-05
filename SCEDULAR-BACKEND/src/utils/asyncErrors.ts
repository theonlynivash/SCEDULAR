/**
 * Express 4 does not catch errors thrown (or rejected) inside async route handlers: the request would hang and, on modern
 * Node, a rejected promise can take the whole server down. This makes any such error go to the normal error handler
 * (a clean 500 response) instead. Imported once, first, from app.ts.
 */
import { createRequire } from 'node:module'

const Layer = createRequire(import.meta.url)('express/lib/router/layer')

const proto = (Layer as any).prototype
if (!proto.__asyncPatched) {
  const original = proto.handle_request
  proto.handle_request = function handle(req: any, res: any, next: any) {
    const fn = this.handle
    if (fn.length > 3) return next()          // error-handling middleware
    try {
      const out = fn(req, res, next)
      if (out && typeof out.catch === 'function') out.catch(next)
    } catch (err) { next(err) }
  }
  proto.__asyncPatched = true
  void original
}
