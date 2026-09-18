import type { JoinPayload, ServerToClientEvents } from '@lingo/contracts'

/** What Root needs from a realtime link. The default is socket.io-client; a platform entry may inject a relay later (docs/decisions/0005-realtime-session.md). */
export interface SessionTransport {
  connect(baseUrl: string): void
  /** Fires on every (re)connect; the hook re-emits join from here (rooms are lost on a new connection). */
  onConnect(cb: () => void): () => void
  join(p: JoinPayload): void
  on<E extends keyof ServerToClientEvents>(event: E, cb: ServerToClientEvents[E]): () => void
  disconnect(): void
}

export interface SessionState { code: string | null; joinUrl: string | null; phone: string | null; live: boolean }

export type SessionEvent =
  | { type: 'created'; code: string; joinUrl: string }
  | { type: 'transport'; live: boolean }
  | { type: 'state'; phone: string | null }
  | { type: 'phone:connected'; phoneName: string }
  | { type: 'phone:disconnected' }

export const initialSession: SessionState = { code: null, joinUrl: null, phone: null, live: false }

/** Pure; phone presence is whatever the server last said (session:state on join, then connected/disconnected events). */
export function sessionReducer(s: SessionState, e: SessionEvent): SessionState {
  switch (e.type) {
    case 'created': return { ...s, code: e.code, joinUrl: e.joinUrl }
    case 'transport': return { ...s, live: e.live }
    case 'state': return { ...s, phone: e.phone }
    case 'phone:connected': return { ...s, phone: e.phoneName }
    case 'phone:disconnected': return { ...s, phone: null }
    default: return s
  }
}
