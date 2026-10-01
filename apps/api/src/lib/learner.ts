import type { Learner } from '@prisma/client'
import { SESSION_CODE_HEADER, SESSION_CODE_RE } from '@lingo/contracts'
import { db } from './db'
import { AppError } from './http'
export interface HeaderSource { header(name: string): string | undefined }
/**
 * The learner a /me/* request acts for.
 * x-session-code present and non-empty → trim + uppercase; fails SESSION_CODE_RE → 400 VALIDATION; no Session with that code → 404 UNKNOWN_CODE;
 * else the session's learner (the phone sees and grades the TV's words; the code is the pairing secret, docs/decisions/0005-realtime-session.md).
 * Otherwise: upsert by x-device-id (default 'anon'). The session code wins over the device id. lastActive = now either way.
 */
export async function learner(req: HeaderSource): Promise<Learner> {
  const raw = req.header(SESSION_CODE_HEADER)?.trim()
  if (raw) {
    const code = raw.toUpperCase()
    if (!SESSION_CODE_RE.test(code)) throw new AppError(400, 'VALIDATION', `${SESSION_CODE_HEADER}: six characters, no 0/O/1/I`)
    const session = await db.session.findUnique({ where: { code }, select: { learnerId: true } })
    if (!session) throw new AppError(404, 'UNKNOWN_CODE', 'No TV with that code')
    return db.learner.update({ where: { id: session.learnerId }, data: { lastActive: new Date() } })
  }
  const deviceId = String(req.header('x-device-id') ?? 'anon')
  return db.learner.upsert({ where: { deviceId }, create: { deviceId }, update: { lastActive: new Date() } })
}
