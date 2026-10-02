import type { Learner } from '@prisma/client'
import { DEVICE_ID_HEADER, DEVICE_ID_RE, SESSION_CODE_HEADER, SESSION_CODE_RE } from '@lingo/contracts'
import { db } from './db'
import { AppError } from './http'
import { codeMisses, type MissLimiter } from './rateLimit'
export interface HeaderSource { header(name: string): string | undefined; ip?: string }
export interface LearnerOpts {
  /**
   * Only the phone's read and review routes pass true: GET /me, GET /me/words, POST /me/reviews, GET /me/stats.
   * Everywhere else x-session-code is ignored, so a code holder can never change the TV's settings, level, progress or purchases.
   */
  allowCode?: boolean
  limiter?: MissLimiter
}
const UNKNOWN = () => new AppError(404, 'UNKNOWN_CODE', 'No TV with that code')
/**
 * x-device-id, checked against DEVICE_ID_RE (PR #2 review A-L2: an unchecked 5 KB id overflowed the unique index and answered 500).
 * Missing → 'anon' (review A-L3, tracked in TASKS.md). Malformed → 400 VALIDATION.
 */
export function deviceIdOf(req: Pick<HeaderSource, 'header'>): string {
  const raw = req.header(DEVICE_ID_HEADER)
  if (raw === undefined) return 'anon'
  if (!DEVICE_ID_RE.test(raw)) throw new AppError(400, 'VALIDATION', `${DEVICE_ID_HEADER}: up to 128 letters, digits, ".", "_", ":" or "-"`)
  return raw
}
/**
 * The learner a request acts for.
 * With allowCode and x-session-code present and non-empty: trim + uppercase; a malformed code and a well-formed code with no
 * Session both answer 404 UNKNOWN_CODE (one answer, so a code's existence can't be probed by its format), and each counts a miss
 * against the client IP. An IP with too many misses gets 429 RATE_LIMITED for any code until its window passes.
 * A known code → the session's learner (the phone sees and grades the TV's words; the code is the pairing secret,
 * docs/decisions/0005-realtime-session.md). Otherwise: upsert by x-device-id (default 'anon'). lastActive = now either way.
 */
export async function learner(req: HeaderSource, opts: LearnerOpts = {}): Promise<Learner> {
  const raw = opts.allowCode ? req.header(SESSION_CODE_HEADER)?.trim() : undefined
  if (raw) {
    const limiter = opts.limiter ?? codeMisses
    const key = req.ip ?? 'unknown'
    if (limiter.blocked(key)) throw new AppError(429, 'RATE_LIMITED', 'Too many tries. Wait a minute and try again.')
    const code = raw.toUpperCase()
    if (!SESSION_CODE_RE.test(code)) { limiter.miss(key); throw UNKNOWN() }
    const session = await db.session.findUnique({ where: { code }, select: { learnerId: true } })
    if (!session) { limiter.miss(key); throw UNKNOWN() }
    return db.learner.update({ where: { id: session.learnerId }, data: { lastActive: new Date() } })
  }
  const deviceId = deviceIdOf(req)
  return db.learner.upsert({ where: { deviceId }, create: { deviceId }, update: { lastActive: new Date() } })
}
