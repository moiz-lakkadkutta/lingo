import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { db } from '../lib/db'
import { ok } from '../lib/http'
export const sessions: Router = Router()
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
export const newCode = () => Array.from(randomBytes(6), (b) => ALPHA[b % ALPHA.length]).join('')
/** TV creates a session code (shown as text + QR); phone joins the Socket.IO room with the same code. */
sessions.post('/', async (req, res, next) => {
  try {
    const l = await db.learner.upsert({ where: { deviceId: String(req.header('x-device-id') ?? 'anon') }, create: { deviceId: String(req.header('x-device-id') ?? 'anon') }, update: {} })
    const s = await db.session.create({ data: { code: newCode(), learnerId: l.id } })
    ok(res, { code: s.code, joinUrl: `${process.env.PHONE_URL ?? 'lingo://join'}/${s.code}` }, 201)
  } catch (e) { next(e) }
})
