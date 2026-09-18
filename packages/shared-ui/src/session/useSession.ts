import { useEffect, useReducer, useRef } from 'react'
import { SessionDto } from '@lingo/contracts'
import { createSocketTransport } from './socketTransport'
import { initialSession, sessionReducer, type SessionState, type SessionTransport } from './types'

export interface UseSessionOptions {
  /** Root's api(): envelope-unwrapping fetch. Identity may change (learner.native); the session is still created once per mount. */
  api: <T>(path: string, init?: RequestInit) => Promise<T>
  apiBaseUrl: string
  /** false until /me succeeded and not offline. */
  enabled: boolean
  transport?: SessionTransport
  /** Called once when POST /sessions failed twice: Root flips its offline state so Pair never sits on "Getting a code…" forever. */
  onOffline?: () => void
}

export const SESSION_RETRY_MS = 3000
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** POST /sessions with one bounded retry after SESSION_RETRY_MS. null when both attempts fail or the body is not a SessionDto. Pure apart from `post`/`wait`, so it is unit-tested without a renderer. */
export async function postSessionWithRetry(post: () => Promise<unknown>, wait: (ms: number) => Promise<void> = sleep): Promise<SessionDto | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return SessionDto.parse(await post()) } catch { if (attempt === 0) await wait(SESSION_RETRY_MS) }
  }
  return null
}

/** POST /sessions once, join the room as 'tv' on every (re)connect, mirror phone presence. word:saved is not consumed here: Root already knows what it saved. */
export function useSession({ api, apiBaseUrl, enabled, transport, onOffline }: UseSessionOptions): SessionState {
  const [state, dispatch] = useReducer(sessionReducer, initialSession)
  const apiRef = useRef(api); apiRef.current = api
  const onOfflineRef = useRef(onOffline); onOfflineRef.current = onOffline
  const transportRef = useRef<SessionTransport | null>(null)
  if (!transportRef.current) transportRef.current = transport ?? createSocketTransport()
  const t = transportRef.current

  // No "started" guard: the effect runs once per enabled/apiBaseUrl change and its cleanup tears everything down, so a second start cannot overlap the first.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubs: Array<() => void> = []
    const wait = (ms: number) => new Promise<void>((r) => { timer = setTimeout(r, ms) })
    postSessionWithRetry(() => apiRef.current<unknown>('/sessions', { method: 'POST', body: '{}' }), wait).then((dto) => {
      if (cancelled) return
      if (!dto) { onOfflineRef.current?.(); return } // Root goes offline; when it recovers, enabled flips and this effect starts again
      dispatch({ type: 'created', code: dto.code, joinUrl: dto.joinUrl })
      unsubs.push(t.on('session:state', (p) => dispatch({ type: 'state', phone: p.phone })))
      unsubs.push(t.on('phone:connected', (p) => dispatch({ type: 'phone:connected', phoneName: p.phoneName })))
      unsubs.push(t.on('phone:disconnected', () => dispatch({ type: 'phone:disconnected' })))
      unsubs.push(t.onConnect(() => { dispatch({ type: 'transport', live: true }); t.join({ code: dto.code, role: 'tv' }) }))
      t.connect(apiBaseUrl)
    })
    // Cleanup on unmount or enabled → false: drop the socket and allow a later enable to start again (POST /sessions is idempotent per device, so the code is stable).
    return () => { cancelled = true; if (timer) clearTimeout(timer); for (const u of unsubs) u(); t.disconnect(); dispatch({ type: 'transport', live: false }) }
  }, [enabled, apiBaseUrl, t]) // api, onOffline and transport are refs on purpose: their identity must not re-create the session

  return state
}
