import { ApiError, createApi, type Identity } from '../src/lib/api'
import { dueWord, stats } from './fixtures'

type Call = { url: string; init: RequestInit }
const fake = (status: number, body: unknown) => {
  const calls: Call[] = []
  const f = vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return { status, ok: status < 400, json: async () => body } as Response })
  return { f: f as unknown as typeof fetch, calls }
}
const ok = (data: unknown) => ({ success: true, data })
const make = (f: typeof fetch, id: Identity = { deviceId: 'phone-1', tvCode: null }) => createApi(() => 'http://lan:4000', () => id, f)
const headers = (c: Call) => c.init.headers as Record<string, string>

describe('phone api', () => {
  it('sends x-device-id on every call and x-session-code only when a TV is remembered', async () => {
    const a = fake(200, ok(stats()))
    await make(a.f).stats()
    expect(headers(a.calls[0]!)).toEqual({ 'content-type': 'application/json', 'x-device-id': 'phone-1' })
    const b = fake(200, ok(stats()))
    await make(b.f, { deviceId: 'phone-1', tvCode: 'ABC234' }).stats()
    expect(headers(b.calls[0]!)).toEqual({ 'content-type': 'application/json', 'x-device-id': 'phone-1', 'x-session-code': 'ABC234' })
    expect(b.calls[0]!.url).toBe('http://lan:4000/me/stats')
  })
  it('dueWords calls /me/words?due=today and parses DueWord[]', async () => {
    const words = [dueWord(), dueWord()]
    const a = fake(200, ok(words))
    expect(await make(a.f).dueWords()).toEqual(words)
    expect(a.calls[0]!.url).toBe('http://lan:4000/me/words?due=today')
    expect(a.calls[0]!.init.method).toBe('GET')
  })
  it('review posts savedWordId and grade as JSON and parses ReviewResult', async () => {
    const result = { savedWordId: 's1', ease: 2.5, intervalD: 1, reps: 1, lapses: 0, due: '2026-10-02T08:00:00.000Z' }
    const a = fake(200, ok(result))
    expect(await make(a.f).review('s1', 'good')).toEqual(result)
    expect(a.calls[0]!.url).toBe('http://lan:4000/me/reviews')
    expect(a.calls[0]!.init.method).toBe('POST')
    expect(JSON.parse(a.calls[0]!.init.body as string)).toEqual({ savedWordId: 's1', grade: 'good' })
  })
  it('an error envelope becomes ApiError with status and code', async () => {
    const a = fake(400, { success: false, error: { code: 'VALIDATION', message: 'grade: Invalid enum value' } })
    const e = await make(a.f).review('s1', 'good').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 400, code: 'VALIDATION', message: 'grade: Invalid enum value' })
  })
  it('a 404 UNKNOWN_CODE surfaces as ApiError code UNKNOWN_CODE', async () => {
    const a = fake(404, { success: false, error: { code: 'UNKNOWN_CODE', message: 'No TV with that code' } })
    await expect(make(a.f, { deviceId: 'p', tvCode: 'ABC234' }).dueWords()).rejects.toMatchObject({ status: 404, code: 'UNKNOWN_CODE' })
  })
  it('a network failure becomes ApiError NETWORK', async () => {
    const f = vi.fn(async () => { throw new TypeError('Network request failed') }) as unknown as typeof fetch
    await expect(make(f).me()).rejects.toMatchObject({ status: 0, code: 'NETWORK' })
  })
  it('a response that fails the schema throws', async () => {
    const a = fake(200, ok([{ savedWordId: 's1' }]))
    const e = await make(a.f).dueWords().catch((x: unknown) => x)
    expect(e).toBeInstanceOf(Error)
    expect(e).not.toBeInstanceOf(ApiError)
    expect((e as Error).name).toBe('ZodError') // the schema refuses it; zod is not a phone dependency, so match by name
  })
})
