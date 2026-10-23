import { extractSessionCode } from '@lingo/contracts'
import { ApiError, type PhoneApi } from './api'

/** The code to join on boot: a code in the opening URL (/join/<CODE>) wins over the TV remembered from last time,
 *  so a stale remembered code never reaches /me before the new one is joined (device test 2026-10-23, shot 06b). */
export function bootCode(remembered: string | null, initialUrl: string | null): string | null {
  const fromUrl = initialUrl ? extractSessionCode(initialUrl) : null
  return fromUrl ?? remembered
}

/** Wraps every call so an UNKNOWN_CODE answer forgets the TV — but only when the code the request carried is still the
 *  code being joined. A late refusal for a code the phone has already moved away from is ignored (the error still rejects). */
export function guardApi(raw: PhoneApi, sentCode: () => string | null, currentCode: () => string | null, onUnknown: () => void): PhoneApi {
  const guard = <T,>(call: () => Promise<T>): Promise<T> => {
    const sent = sentCode()
    return call().catch((e: unknown) => {
      if (e instanceof ApiError && e.code === 'UNKNOWN_CODE' && sent !== null && sent === currentCode()) onUnknown()
      throw e
    })
  }
  return {
    me: () => guard(() => raw.me()),
    dueWords: () => guard(() => raw.dueWords()),
    review: (id, g, rid) => guard(() => raw.review(id, g, rid)),
    stats: () => guard(() => raw.stats()),
  }
}
