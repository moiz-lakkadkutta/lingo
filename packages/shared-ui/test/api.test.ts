import { ApiError, NetworkError, createApi } from '../src/api/client'

const okRes = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response
const make = (fetchImpl: typeof fetch, native = { v: 'en' }) => createApi({ baseUrl: 'http://api', deviceId: 'dev-1', getNative: () => native.v, fetchImpl })

describe('createApi', () => {
  it('sends x-device-id, x-native and json content type on every call', async () => {
    const f = vi.fn(async () => okRes({ success: true, data: 1 }))
    await make(f as never)('/me', { method: 'PUT', body: '{}' })
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit]
    expect(url).toBe('http://api/me')
    expect(init.method).toBe('PUT')
    expect(init.headers).toMatchObject({ 'content-type': 'application/json', 'x-device-id': 'dev-1', 'x-native': 'en' })
  })
  it('reads x-native per call so a changed language is used at once', async () => {
    const f = vi.fn(async () => okRes({ success: true, data: 1 }))
    const native = { v: 'en' }
    const api = make(f as never, native)
    await api('/a'); native.v = 'tr'; await api('/b')
    expect((f.mock.calls[1]! as unknown as [string, RequestInit])[1].headers).toMatchObject({ 'x-native': 'tr' })
  })
  it('unwraps the success envelope', async () => {
    expect(await make((async () => okRes({ success: true, data: { a: 1 } })) as never)('/x')).toEqual({ a: 1 })
  })
  it('throws ApiError with status and code for an error envelope', async () => {
    const p = make((async () => okRes({ success: false, error: { code: 'NOT_FOUND', message: 'Clip not found' } }, 404)) as never)('/clips/x')
    await expect(p).rejects.toBeInstanceOf(ApiError)
    await expect(p).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Clip not found' })
  })
  it('throws NetworkError when fetch rejects', async () => {
    await expect(make((async () => { throw new TypeError('Network request failed') }) as never)('/x')).rejects.toBeInstanceOf(NetworkError)
  })
  it('throws ApiError BAD_BODY for a non-JSON body', async () => {
    const res = { status: 502, ok: false, json: async () => { throw new SyntaxError('Unexpected token <') } } as unknown as Response
    await expect(make((async () => res) as never)('/x')).rejects.toMatchObject({ status: 502, code: 'BAD_BODY' })
  })
})
