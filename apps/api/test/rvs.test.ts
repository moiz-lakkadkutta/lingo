import { createRvsClient, parseRvs, rvsBase } from '../src/lib/rvs'
import { logger } from '../src/lib/logger'
import { rvsActive } from './fixtures/rvs'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const fakeFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => vi.fn(impl) as unknown as typeof fetch & ReturnType<typeof vi.fn>

describe('RVS client', () => {
  it('builds the sandbox URL with encoded secret, user and receipt segments', async () => {
    const f = fakeFetch(async () => json(200, rvsActive('r?1')))
    const c = createRvsClient({ base: rvsBase({ RVS_ENV: 'sandbox' }), secret: 'se/cr et', fetch: f })
    await c.verify('user/1', 'r?1')
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0]![0]).toBe('https://appstore-sdk.amazon.com/sandbox/version/1.0/verifyReceiptId/developer/se%2Fcr%20et/user/user%2F1/receiptId/r%3F1')
  })

  it('uses the production base when RVS_ENV is production and RVS_BASE overrides both', () => {
    expect(rvsBase({ RVS_ENV: 'production' })).toBe('https://appstore-sdk.amazon.com')
    expect(rvsBase({ RVS_ENV: 'sandbox' })).toBe('https://appstore-sdk.amazon.com/sandbox')
    expect(rvsBase({ RVS_ENV: 'production', RVS_BASE: 'http://localhost:8080/RVSSandbox' })).toBe('http://localhost:8080/RVSSandbox')
    expect(rvsBase({ RVS_ENV: 'sandbox', RVS_BASE: 'http://localhost:8080/RVSSandbox' })).toBe('http://localhost:8080/RVSSandbox')
  })

  it('maps 200 with a valid body to ok and parses epoch-ms dates', async () => {
    const body = rvsActive('r1', Date.UTC(2026, 9, 1))
    const c = createRvsClient({ base: 'http://rvs.test', secret: 's', fetch: fakeFetch(async () => json(200, body)) })
    const r = await c.verify('u', 'r1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.receipt).toMatchObject({ receiptId: 'r1', productId: 'lingo.plus', termSku: 'lingo.plus.monthly', cancelDate: null, testTransaction: true, purchaseDate: body.purchaseDate, renewalDate: body.renewalDate })
    expect(new Date(r.receipt.purchaseDate).toISOString()).toBe('2026-09-21T00:00:00.000Z')
    expect((r.receipt as unknown as { term: string }).term).toBe('1 Month') // extra fields are kept for Purchase.raw
  })

  it('maps 400 to invalid_receipt, 496 to invalid_secret, 497 to invalid_user, 500 to rvs_error', async () => {
    const at = (status: number) => createRvsClient({ base: 'http://rvs.test', secret: 's', fetch: fakeFetch(async () => json(status, {})) }).verify('u', 'r')
    expect(await at(400)).toEqual({ ok: false, status: 400, reason: 'invalid_receipt' })
    expect(await at(496)).toEqual({ ok: false, status: 496, reason: 'invalid_secret' })
    expect(await at(497)).toEqual({ ok: false, status: 497, reason: 'invalid_user' })
    expect(await at(500)).toEqual({ ok: false, status: 500, reason: 'rvs_error' })
    expect(await at(503)).toEqual({ ok: false, status: 503, reason: 'rvs_error' })
  })

  it('maps a thrown fetch and a timeout to network', async () => {
    const thrown = createRvsClient({ base: 'http://rvs.test', secret: 's', fetch: fakeFetch(async () => { throw new TypeError('fetch failed') }) })
    expect(await thrown.verify('u', 'r')).toEqual({ ok: false, status: 0, reason: 'network' })
    const hang = fakeFetch((_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
    const slow = createRvsClient({ base: 'http://rvs.test', secret: 's', fetch: hang, timeoutMs: 20 })
    expect(await slow.verify('u', 'r')).toEqual({ ok: false, status: 0, reason: 'network' })
  })

  it('returns bad_body when a 200 body has no receiptId or productId', async () => {
    const { receiptId: _r, ...noReceipt } = rvsActive('r1')
    const { productId: _p, ...noProduct } = rvsActive('r1')
    for (const body of [noReceipt, noProduct, 'not json at all']) {
      const c = createRvsClient({ base: 'http://rvs.test', secret: 's', fetch: fakeFetch(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })) })
      expect(await c.verify('u', 'r1')).toEqual({ ok: false, status: 200, reason: 'bad_body' })
    }
    expect(parseRvs(noProduct)).toBeNull()
    expect(parseRvs({ ...rvsActive('r1'), purchaseDate: undefined })).toBeNull()
    expect(parseRvs(rvsActive('r1'))).not.toBeNull()
  })

  it('never includes the shared secret in a thrown error or log line', async () => {
    const secret = 'TOP-SECRET-42'
    const lines: string[] = []
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(logger, m).mockImplementation(((...a: unknown[]) => { lines.push(JSON.stringify(a, (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}` : v))) }) as never))
    const cons = (['log', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')) }))
    try {
      const echo = fakeFetch(async (url) => { throw new Error(`connect ECONNREFUSED ${url}`) })
      const results = [
        await createRvsClient({ base: 'http://rvs.test', secret, fetch: echo }).verify('u', 'r'),
        await createRvsClient({ base: 'http://rvs.test', secret, fetch: fakeFetch(async () => json(500, { message: `bad ${secret}` })) }).verify('u', 'r'),
        await createRvsClient({ base: 'http://rvs.test', secret, fetch: fakeFetch(async () => json(496, {})) }).verify('u', 'r'),
        await createRvsClient({ base: 'http://rvs.test', secret, fetch: fakeFetch(async () => json(200, { nope: true })) }).verify('u', 'r'),
      ]
      expect(results.map((r) => (r.ok ? 'ok' : r.reason))).toEqual(['network', 'rvs_error', 'invalid_secret', 'bad_body'])
      expect(JSON.stringify(results)).not.toContain(secret)
      expect(lines.length).toBeGreaterThan(0)
      for (const l of lines) expect(l).not.toContain(secret)
    } finally {
      for (const s of [...spies, ...cons]) s.mockRestore()
    }
  })
})
