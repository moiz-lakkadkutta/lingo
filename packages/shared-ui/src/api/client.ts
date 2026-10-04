/** Envelope-unwrapping fetch for the Lingo API (`{ success, data }` / `{ success: false, error: { code, message } }`). */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'ApiError' }
}
export class NetworkError extends Error {
  constructor(message = 'network') { super(message); this.name = 'NetworkError' }
}
export type Api = <T>(path: string, init?: RequestInit) => Promise<T>

/** Headers: content-type json, x-device-id, x-native (read via getNative() per call, so a language change applies at once). */
export function createApi(o: { baseUrl: string; deviceId: string; getNative(): string; fetchImpl?: typeof fetch }): Api {
  return async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const f = o.fetchImpl ?? fetch
    let res: Response
    try {
      res = await f(o.baseUrl + path, { ...init, headers: { 'content-type': 'application/json', 'x-device-id': o.deviceId, 'x-native': o.getNative(), ...((init?.headers as Record<string, string> | undefined) ?? {}) } })
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : String(e))
    }
    let body: unknown
    try { body = await res.json() } catch { throw new ApiError(res.status, 'BAD_BODY', 'Response was not JSON') }
    const b = body as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null
    if (b && b.success === true) return b.data as T
    throw new ApiError(res.status, b?.error?.code ?? 'BAD_BODY', b?.error?.message ?? 'Unexpected response')
  }
}
