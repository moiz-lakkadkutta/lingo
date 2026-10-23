import type { NextFunction, Request, Response } from 'express'
import { ZodError, type ZodTypeAny } from 'zod'
/** `{ success, data }` envelope + Zod validation, matching the Socials API conventions. */
export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ success: true, data })
/** headers are set on the error response (Retry-After on a 429). */
export class AppError extends Error { constructor(public status: number, public code: string, message: string, public headers: Record<string, string> = {}) { super(message) } }
export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`)
export const rateLimited = (message: string, retryAfterS: number) => new AppError(429, 'RATE_LIMITED', message, { 'Retry-After': String(retryAfterS) })
/** After every router: an unknown path or method answers the JSON envelope, not Express's HTML page. */
export function unknownRoute(_req: Request, _res: Response, next: NextFunction) { next(new AppError(404, 'NOT_FOUND', 'No such route')) }
/** express.json() (body-parser) errors carry `type` and a 4xx `status` (https://github.com/expressjs/body-parser#errors): a client error, never logged as a crash. */
const bodyError = (err: unknown): AppError | null => {
  const e = err as { type?: unknown; status?: unknown } | null
  if (!e || typeof e.type !== 'string' || typeof e.status !== 'number' || e.status < 400 || e.status > 499) return null
  if (e.type === 'entity.parse.failed') return new AppError(400, 'VALIDATION', 'Body is not valid JSON')
  if (e.type === 'entity.too.large') return new AppError(413, 'TOO_LARGE', 'Body is too large')
  return new AppError(e.status, 'BAD_REQUEST', 'Body could not be read')
}
export function validate<T extends ZodTypeAny>(schema: T, pick: (req: Request) => unknown) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(pick(req))
    if (!r.success) return next(new AppError(400, 'VALIDATION', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')))
    ;(req as Request & { valid: unknown }).valid = r.data
    next()
  }
}
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = err instanceof AppError ? err : bodyError(err)
  if (e) return res.status(e.status).set(e.headers).json({ success: false, error: { code: e.code, message: e.message } })
  if (err instanceof ZodError) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: err.message } })
  console.error(err)
  return res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Something went wrong' } })
}
