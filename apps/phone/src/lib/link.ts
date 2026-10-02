import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, QuizStartPayload, ServerToClientEvents, SessionErrorPayload, WordSavedPayload } from '@lingo/contracts'
/** The phone's one Socket.IO connection to the TV's room (docs/decisions/0005-realtime-session.md). Never two sockets at once. */
export interface LinkHandlers {
  onJoined(): void                       // phone:connected for our code (the server sends it to the whole room, us included)
  onRefused(e: SessionErrorPayload): void // session:error UNKNOWN_CODE only → the socket is closed first (a refused join is never re-sent)
  onTransport(up: boolean): void         // connect / disconnect
  onUnreachable(): void                  // connect_error before the first successful connect of this join (once)
  onWordSaved(p: WordSavedPayload): void
  onQuizStart(p: QuizStartPayload): void
}
export interface PhoneLink {
  join(code: string, deviceName?: string | null): void // closes any previous socket first; emits join on every connect (rooms are lost on reconnect)
  sendQuizResult(correct: number, total: number): boolean // emits only when connected and joined; returns whether it did
  leave(): void
}
export type Connect = (url: string) => Socket<ServerToClientEvents, ClientToServerEvents>
/** Join retry after a non-refusal session:error (INTERNAL, VALIDATION, RATE_LIMITED): 1 s, 2 s, 4 s … capped at 30 s. */
export const joinBackoffMs = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt)
const defaultConnect: Connect = (url) => io(url, { transports: ['websocket'], forceNew: true })
export function createPhoneLink(baseUrl: () => string, h: LinkHandlers, connect: Connect = defaultConnect): PhoneLink {
  let sock: ReturnType<Connect> | null = null
  let code: string | null = null
  let joined = false
  let retry: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  const stopRetry = () => { if (retry) clearTimeout(retry); retry = null }
  const close = () => { stopRetry(); const s = sock; sock = null; joined = false; if (s) { s.removeAllListeners(); s.disconnect() } }
  return {
    join(c, deviceName) {
      close()
      const s = connect(baseUrl())
      sock = s; code = c
      const name = deviceName?.trim().slice(0, 40) || undefined // JoinPayload clamps too; a clean name keeps the TV's label honest
      let everConnected = false; let reported = false
      attempt = 0
      const emitJoin = () => s.emit('join', { code: c, role: 'phone', deviceName: name })
      s.on('connect', () => { everConnected = true; stopRetry(); h.onTransport(true); emitJoin() })
      s.on('disconnect', () => { if (sock !== s) return; stopRetry(); joined = false; h.onTransport(false) })
      s.on('connect_error', () => { if (!everConnected && !reported) { reported = true; h.onUnreachable() } })
      s.on('phone:connected', (p) => { if (p.code === c && sock === s) { joined = true; attempt = 0; h.onJoined() } })
      s.on('session:error', (e) => {
        if (sock !== s) return
        // Only UNKNOWN_CODE is a refusal: it ends this link and the app forgets the TV.
        if (e.code === 'UNKNOWN_CODE') { close(); h.onRefused(e); return }
        // Anything else after joining concerns a quiz event, not the room.
        if (joined) return
        // A join that hit a server hiccup (INTERNAL during a restart, RATE_LIMITED, …) is retried with backoff; the TV stays remembered.
        h.onTransport(false)
        stopRetry()
        retry = setTimeout(() => { retry = null; if (sock === s && s.connected) { h.onTransport(true); emitJoin() } }, joinBackoffMs(attempt++))
      })
      s.on('word:saved', (p) => h.onWordSaved(p))
      s.on('quiz:start', (p) => h.onQuizStart(p))
    },
    sendQuizResult(correct, total) {
      if (!sock || !sock.connected || !joined || !code) return false
      sock.emit('quiz:result', { code, correct, total })
      return true
    },
    leave() { close(); code = null },
  }
}
