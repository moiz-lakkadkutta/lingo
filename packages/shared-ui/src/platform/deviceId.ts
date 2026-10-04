import { useEffect, useState } from 'react'

/**
 * Per-install TV identity (review-005 H1). The API keys a learner by `x-device-id`, so every install needs its own stable id:
 * created once on first launch, persisted by the platform entry, and passed to Root as `deviceId`.
 * The store is whatever the platform has: AsyncStorage on Fire OS (async), MMKV on Vega (sync). Both shapes are accepted.
 */
export interface IdStore {
  get(key: string): string | null | undefined | Promise<string | null | undefined>
  set(key: string, value: string): void | Promise<void>
}
export const DEVICE_ID_KEY = 'lingo.deviceId'
const ID_RE = /^tv-[0-9a-f-]{16,}$/

/** RFC 4122 v4 from crypto.getRandomValues when the runtime has it; Math.random otherwise (not a secret, only has to be unique per install). */
export function randomUuid(): string {
  const b = new Uint8Array(16)
  const c = (globalThis as { crypto?: { getRandomValues?(a: Uint8Array): Uint8Array } }).crypto
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * The stored id, or a new `tv-<uuid>` saved for next time. A store that cannot be read or written still yields an id for this run
 * (the app works; the next launch will be a new learner), rather than falling back to a shared constant.
 */
export async function loadDeviceId(store: IdStore, newUuid: () => string = randomUuid): Promise<string> {
  let stored: string | null | undefined
  try { stored = await store.get(DEVICE_ID_KEY) } catch { stored = undefined }
  if (stored && ID_RE.test(stored)) return stored
  const id = `tv-${newUuid().toLowerCase()}`
  try { await store.set(DEVICE_ID_KEY, id) } catch { /* see above */ }
  return id
}

/** `loadDeviceId` for a platform entry: null until the id is known, then the id. Render Root only once it is a string. */
export function useDeviceId(store: IdStore, newUuid?: () => string): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadDeviceId(store, newUuid).then((v) => { if (live) setId(v) })
    return () => { live = false }
  }, [store, newUuid])
  return id
}
