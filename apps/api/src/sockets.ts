import { JoinPayload, QuizResultPayload, QuizStartPayload } from '@lingo/contracts'
import type { SessionErrorPayload } from '@lingo/contracts'
import { db } from './lib/db'
import { logger } from './lib/logger'
import type { LingoIo } from './server'

const DEFAULT_PHONE = 'Your phone' // mirrors strings.pair.defaultPhone in shared-ui
const noop = () => {}

/** First phone socket's name in the room (first phone wins), else null. `except` skips a socket that is on its way out. Presence is derived from the room, not the DB (docs/decisions/0005-realtime-session.md). */
export async function phoneIn(io: LingoIo, code: string, except?: string): Promise<string | null> {
  const sockets = await io.in(code).fetchSockets()
  const phone = sockets.find((s) => s.data.role === 'phone' && s.id !== except)
  return phone?.data.phoneName ?? null
}

const validationMessage = (issues: { path: (string | number)[]; message: string }[]) => issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')

/** Rooms are session codes. TV and phone both join; the API emits word:saved into the room from POST /me/words only. */
export function registerSockets(io: LingoIo): void {
  io.on('connection', (socket) => {
    const fail = (e: SessionErrorPayload): void => { socket.emit('session:error', e) }
    const guard = (fn: () => Promise<void> | void) => async () => {
      try { await fn() } catch (e) { logger.error(e, 'socket handler'); fail({ code: 'INTERNAL', message: 'Something went wrong' }) }
    }

    socket.on('join', (p) => guard(async () => {
      const r = JoinPayload.safeParse(p)
      if (!r.success) return fail({ code: 'VALIDATION', message: validationMessage(r.error.issues) })
      const { code, role, deviceName } = r.data
      const session = await db.session.findUnique({ where: { code } })
      if (!session) return fail({ code: 'UNKNOWN_CODE', message: 'No TV with that code' })
      socket.data = { code, role, phoneName: role === 'phone' ? (deviceName ?? DEFAULT_PHONE) : undefined }
      await socket.join(code)
      if (role === 'tv') {
        socket.emit('session:state', { code, phone: await phoneIn(io, code) })
      } else {
        await db.session.update({ where: { code }, data: { phoneConnected: true } }).catch(noop)
        io.to(code).emit('phone:connected', { code, phoneName: socket.data.phoneName ?? DEFAULT_PHONE })
      }
    })())

    socket.on('quiz:start', (p) => guard(() => {
      const r = QuizStartPayload.safeParse(p)
      if (!r.success) return fail({ code: 'VALIDATION', message: validationMessage(r.error.issues) })
      io.to(r.data.code).emit('quiz:start', r.data)
    })())

    socket.on('quiz:result', (p) => guard(() => {
      const r = QuizResultPayload.safeParse(p)
      if (!r.success) return fail({ code: 'VALIDATION', message: validationMessage(r.error.issues) })
      io.to(r.data.code).emit('quiz:result', r.data)
    })())

    // Rooms are still known here (unlike 'disconnect'): https://socket.io/docs/v4/server-socket-instance/#disconnecting
    // Only the last phone leaving counts: another phone still in the room keeps the TV's check mark and the flag.
    socket.on('disconnecting', async () => {
      const { code, role } = socket.data
      if (role !== 'phone' || !code) return
      const remaining = await phoneIn(io, code, socket.id).catch(() => null)
      if (remaining) return
      io.to(code).emit('phone:disconnected', { code })
      db.session.update({ where: { code }, data: { phoneConnected: false } }).catch(noop)
    })
  })
}
