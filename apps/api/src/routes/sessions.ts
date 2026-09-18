import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { SessionDto } from '@lingo/contracts'
import { db } from '../lib/db'
import { ok } from '../lib/http'
export const sessions: Router = Router()
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
export const newCode = () => Array.from(randomBytes(6), (b) => ALPHA[b % ALPHA.length]).join('')
/** The code is the single source of truth; joinUrl is only a carrier (docs/decisions/0005-realtime-session.md). */
export const joinUrlFor = (code: string) => `${process.env.PHONE_URL ?? 'lingo://join'}/${code}`
/** Idempotent per TV device: the learner's latest session is reused so a phone that remembers the TV still finds a live room. phoneConnected is reset; live presence comes from the socket room. */
export async function getOrCreateSession(deviceId: string): Promise<{ code: string }> {
  const l = await db.learner.upsert({ where: { deviceId }, create: { deviceId }, update: {} })
  const existing = await db.session.findFirst({ where: { learnerId: l.id }, orderBy: { createdAt: 'desc' } })
  if (existing) { await db.session.update({ where: { code: existing.code }, data: { phoneConnected: false } }); return { code: existing.code } }
  const s = await db.session.create({ data: { code: newCode(), learnerId: l.id } })
  return { code: s.code }
}
/** TV creates a session code (shown as text + QR); phone joins the Socket.IO room with the same code. */
sessions.post('/', async (req, res, next) => {
  try {
    const { code } = await getOrCreateSession(String(req.header('x-device-id') ?? 'anon'))
    ok(res, SessionDto.parse({ code, joinUrl: joinUrlFor(code) }), 201)
  } catch (e) { next(e) }
})
