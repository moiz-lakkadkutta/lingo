import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, QuizStartPayload, ServerToClientEvents, SessionErrorPayload, WordSavedPayload } from '@lingo/contracts'
/** The phone's one Socket.IO connection to the TV's room (docs/decisions/0005-realtime-session.md). Never two sockets at once. */
export interface LinkHandlers {
  onJoined(): void                       // phone:connected for our code (the server sends it to the whole room, us included)
  onRefused(e: SessionErrorPayload): void // session:error → the socket is closed first (a refused join is never re-sent)
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
const defaultConnect: Connect = (url) => io(url, { transports: ['websocket'], forceNew: true })
export function createPhoneLink(baseUrl: () => string, h: LinkHandlers, connect: Connect = defaultConnect): PhoneLink {
  let sock: ReturnType<Connect> | null = null
  let code: string | null = null
  let joined = false
  const close = () => { const s = sock; sock = null; joined = false; if (s) { s.removeAllListeners(); s.disconnect() } }
  return {
    join(c, deviceName) {
      close()
      const s = connect(baseUrl())
      sock = s; code = c
      const name = deviceName?.trim().slice(0, 40) || undefined // JoinPayload clamps too; a clean name keeps the TV's label honest
      let everConnected = false; let reported = false
      s.on('connect', () => { everConnected = true; h.onTransport(true); s.emit('join', { code: c, role: 'phone', deviceName: name }) })
      s.on('disconnect', () => { if (sock !== s) return; joined = false; h.onTransport(false) })
      s.on('connect_error', () => { if (!everConnected && !reported) { reported = true; h.onUnreachable() } })
      s.on('phone:connected', (p) => { if (p.code === c && sock === s) { joined = true; h.onJoined() } })
      s.on('session:error', (e) => {
        // A refusal of our join (or an unknown code at any time) ends this link. Anything else after joining is not a refusal.
        if (joined && e.code !== 'UNKNOWN_CODE') return
        close(); h.onRefused(e)
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
