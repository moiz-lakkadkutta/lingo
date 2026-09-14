import type { Server } from 'socket.io'
import { db } from './lib/db'
/** Rooms are session codes. TV and phone both join; the API emits word:saved into the room from REST handlers. */
export function registerSockets(io: Server) {
  io.on('connection', (s) => {
    s.on('join', async ({ code, role }: { code: string; role: 'tv' | 'phone' }) => {
      s.join(code)
      if (role === 'phone') { await db.session.update({ where: { code }, data: { phoneConnected: true } }).catch(() => {}); io.to(code).emit('phone:connected', { code }) }
    })
    s.on('quiz:start', ({ code }: { code: string }) => io.to(code).emit('quiz:start', { code }))
    s.on('quiz:result', (payload: { code: string; correct: number; total: number }) => io.to(payload.code).emit('quiz:result', payload))
  })
}
