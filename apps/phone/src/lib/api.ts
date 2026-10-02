import { DueWord, LearnerDto, ProgressStats, ReviewResult, SESSION_CODE_HEADER } from '@lingo/contracts'
import type { Grade } from '@lingo/contracts'
/** Typed REST client for the phone. With a remembered TV every call carries x-session-code, so /me/* is the TV's learner (works with the TV off). */
export interface Identity { deviceId: string; tvCode: string | null }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiError' }
}
export interface PhoneApi {
  me(): Promise<LearnerDto>                                  // GET /me
  dueWords(): Promise<DueWord[]>                             // GET /me/words?due=today
  review(savedWordId: string, grade: Grade, reviewId?: string): Promise<ReviewResult> // POST /me/reviews (reviewId makes a retry safe)
  stats(): Promise<ProgressStats>                            // GET /me/stats
}
type Parser<T> = { parse(data: unknown): T }
type Envelope = { success: true; data: unknown } | { success: false; error: { code: string; message: string } }
/** Headers on every call: content-type json, x-device-id; plus x-session-code (SESSION_CODE_HEADER) when identity().tvCode.
 *  { success: false, error } → ApiError(status, error.code, error.message); fetch throws → ApiError(0, 'NETWORK', …); data parsed with the Zod schema. */
export function createApi(baseUrl: () => string, identity: () => Identity, fetchImpl: typeof fetch = (...a) => fetch(...a)): PhoneApi {
  async function call<T>(schema: Parser<T>, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const id = identity()
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-device-id': id.deviceId }
    if (id.tvCode) headers[SESSION_CODE_HEADER] = id.tvCode
    let res: Response
    try {
      res = await fetchImpl(`${baseUrl()}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
    } catch (e) {
      throw new ApiError(0, 'NETWORK', e instanceof Error ? e.message : String(e))
    }
    let body: Envelope
    try { body = (await res.json()) as Envelope } catch { throw new ApiError(res.status, 'BAD_RESPONSE', `Not JSON (${res.status})`) }
    if (!body || body.success !== true) {
      const err = body && body.success === false ? body.error : { code: 'BAD_RESPONSE', message: `Unexpected response (${res.status})` }
      throw new ApiError(res.status, err.code, err.message)
    }
    return schema.parse(body.data)
  }
  return {
    me: () => call(LearnerDto, '/me'),
    dueWords: () => call(DueWord.array(), '/me/words?due=today'),
    review: (savedWordId, grade, reviewId) => call(ReviewResult, '/me/reviews', { method: 'POST', body: { savedWordId, grade, reviewId } }),
    stats: () => call(ProgressStats, '/me/stats'),
  }
}
