import { SESSION_CODE_RE } from '@lingo/contracts'
/** Device id, remembered TV and server address, over AsyncStorage (any KV in tests). */
export interface KV { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }
export const KEYS = { deviceId: 'lingo.deviceId', tv: 'lingo.tv', apiUrl: 'lingo.apiUrl' } as const
export interface Store {
  deviceId(): Promise<string>            // created once: 'phone-' + newId(), then stable
  tv(): Promise<string | null>           // stored value that fails SESSION_CODE_RE → null
  setTv(code: string): Promise<void>; forgetTv(): Promise<void>
  apiUrl(): Promise<string | null>; setApiUrl(u: string | null): Promise<void>
}
export function createStore(kv: KV, newId: () => string): Store {
  let id: Promise<string> | null = null // one id even when two callers ask before the first write lands
  return {
    deviceId: () => (id ??= (async () => {
      const have = await kv.getItem(KEYS.deviceId)
      if (have) return have
      const fresh = 'phone-' + newId()
      await kv.setItem(KEYS.deviceId, fresh)
      return fresh
    })()),
    tv: async () => { const v = await kv.getItem(KEYS.tv); return v && SESSION_CODE_RE.test(v) ? v : null },
    setTv: (code) => kv.setItem(KEYS.tv, code),
    forgetTv: () => kv.removeItem(KEYS.tv),
    apiUrl: () => kv.getItem(KEYS.apiUrl),
    setApiUrl: (u) => (u === null ? kv.removeItem(KEYS.apiUrl) : kv.setItem(KEYS.apiUrl, u)),
  }
}
/** Trim; add 'http://' when there is no scheme; drop trailing '/'; must parse with new URL() and be http(s) → else null. */
export function normaliseApiUrl(input: string): string | null {
  let s = input.trim()
  if (!s) return null
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(s)) s = 'http://' + s
  s = s.replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/?#]+/i.test(s)) return null
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname) return null
  } catch { return null }
  return s
}
