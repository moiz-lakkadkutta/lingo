import type { ClientToServerEvents, JoinPayload, ServerToClientEvents } from '@lingo/contracts'

/** What Root needs from a realtime link. The default is socket.io-client; a platform entry may inject a relay later (docs/decisions/0005-realtime-session.md). */
export interface SessionTransport {
  connect(baseUrl: string): void
  /** Fires on every (re)connect; the hook re-emits join from here (rooms are lost on a new connection). */
  onConnect(cb: () => void): () => void
  join(p: JoinPayload): void
  /** Ask the phone to run its quiz now (quiz:start into the room). */
  quizStart(p: Parameters<ClientToServerEvents['quiz:start']>[0]): void
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

/** "Quiz on your phone" from Summary: sent → the phone's quiz:result arrives → done. Kept apart from SessionState (its shape is asserted). */
export type PhoneQuizState = { status: 'idle' } | { status: 'sent'; clipSlug: string } | { status: 'done'; clipSlug: string; correct: number; total: number }
export type PhoneQuizEvent = { type: 'sent'; clipSlug: string } | { type: 'result'; correct: number; total: number } | { type: 'reset' }
export const initialPhoneQuiz: PhoneQuizState = { status: 'idle' }
/** result only applies in 'sent'; sent from any state restarts. */
export function phoneQuizReducer(s: PhoneQuizState, e: PhoneQuizEvent): PhoneQuizState {
  switch (e.type) {
    case 'sent': return { status: 'sent', clipSlug: e.clipSlug }
    case 'result': return s.status === 'sent' ? { status: 'done', clipSlug: s.clipSlug, correct: e.correct, total: e.total } : s
    case 'reset': return initialPhoneQuiz
    default: return s
  }
}
export type SessionHandle = SessionState & { phoneQuiz: PhoneQuizState; startPhoneQuiz(clipSlug: string): void }
