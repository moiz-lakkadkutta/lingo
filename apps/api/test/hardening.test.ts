import request from 'supertest'
import { ClipResponse, LearnerSettingsPatch } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { codeMisses, createRateLimiter, HTTP_LIMITS } from '../src/lib/rateLimit'
import { fixtures } from './helpers/fixtures005'

// Security hardening: bounded bodies and strings, JSON for every error, x-device-id required, per-IP limits with Retry-After.
const app = createApp()
const fx = fixtures('hardening')
beforeEach(() => codeMisses.reset())
afterAll(() => { codeMisses.reset(); return fx.cleanup() }, 30_000)

describe('settings and string bounds', () => {
  it('PUT /me accepts a NATIVE_LANGS code and rejects any other native with 400 VALIDATION', async () => {
    const dev = fx.device()
    expect((await request(app).put('/me').set('x-device-id', dev).send({ native: 'tr' })).body.data.native).toBe('tr')
    for (const native of ['xx', '__proto__', 'a'.repeat(5000), '']) {
      const r = await request(app).put('/me').set('x-device-id', dev).send({ native })
      expect(r.status).toBe(400)
      expect(r.body.error.code).toBe('VALIDATION')
    }
    expect((await db.learner.findUniqueOrThrow({ where: { deviceId: dev } })).native).toBe('tr')
  })
  it('caps ids and slugs in review, word and progress bodies', async () => {
    expect(LearnerSettingsPatch.safeParse({ native: 'de' }).success).toBe(true)
    const dev = fx.device(), long = 'x'.repeat(200)
    expect((await request(app).post('/me/reviews').set('x-device-id', dev).send({ savedWordId: long, grade: 'good' })).status).toBe(400)
    expect((await request(app).post('/me/words').set('x-device-id', dev).send({ highlightId: long })).status).toBe(400)
    expect((await request(app).put('/me/progress').set('x-device-id', dev).send({ clipSlug: long, positionS: 1 })).status).toBe(400)
  })
})

describe('body parser and unknown routes', () => {
  it('a body over 16 KB answers 413 TOO_LARGE in the envelope', async () => {
    const r = await request(app).put('/me').set('x-device-id', fx.device()).set('content-type', 'application/json').send(JSON.stringify({ native: 'x'.repeat(17 * 1024) }))
    expect(r.status).toBe(413)
    expect(r.body).toEqual({ success: false, error: { code: 'TOO_LARGE', message: 'Body is too large' } })
  })
  it('malformed JSON answers 400 VALIDATION, not 500', async () => {
    const r = await request(app).put('/me').set('x-device-id', fx.device()).set('content-type', 'application/json').send('{"native":')
    expect(r.status).toBe(400)
    expect(r.body).toEqual({ success: false, error: { code: 'VALIDATION', message: 'Body is not valid JSON' } })
  })
  it('an unknown route or method answers JSON 404 NOT_FOUND', async () => {
    for (const r of [await request(app).get('/nope'), await request(app).delete('/me'), await request(app).get('/me/nope').set('x-device-id', fx.device())]) {
      expect(r.status).toBe(404)
      expect(r.headers['content-type']).toMatch(/json/)
      expect(r.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
    }
  })
})

describe('x-device-id is required wherever a learner is resolved by device', () => {
  it('GET /catalog, GET /me, POST /sessions, GET /iap/status, GET /me/library and GET /clips/:slug answer 400 VALIDATION without it', async () => {
    const c = await fx.clip()
    const calls = [request(app).get('/catalog'), request(app).get('/me'), request(app).post('/sessions'), request(app).get('/iap/status'), request(app).get('/me/library'), request(app).get('/clips/' + c.slug)]
    for (const r of await Promise.all(calls)) {
      expect(r.status).toBe(400)
      expect(r.body.error).toEqual({ code: 'VALIDATION', message: 'x-device-id: required' })
    }
    expect(await db.learner.count({ where: { deviceId: 'anon', lastActive: { gte: new Date(Date.now() - 5000) } } })).toBe(0)
  })
  it('GET /health and GET /clips/attributions need no learner and stay open', async () => {
    expect((await request(app).get('/health')).status).toBe(200)
    expect((await request(app).get('/clips/attributions')).status).toBe(200)
  })
})

describe('x-native', () => {
  it('__proto__ and unknown codes fall back to the en line instead of breaking the cue', async () => {
    const c = await fx.clip()
    await db.cue.create({ data: { clipId: c.id, index: 0, startMs: 0, endMs: 2000, text: 'Hallo', native: { en: 'Hello', tr: 'Merhaba' } } })
    const dev = fx.device()
    const line = async (native: string) => {
      const r = await request(app).get('/clips/' + c.slug).set('x-device-id', dev).set('x-native', native)
      expect(r.status).toBe(200)
      const d = ClipResponse.parse(r.body.data)
      return d.status === 'ready' ? d.cues[0]!.native : null
    }
    expect(await line('tr')).toBe('Merhaba')
    expect(await line('__proto__')).toBe('Hello')
    expect(await line('constructor')).toBe('Hello')
    expect(await line('fr')).toBe('Hello')
    const lib = await request(app).get('/me/library').set('x-device-id', dev).set('x-native', '__proto__')
    expect(lib.status).toBe(200)
  })
})

describe('per-IP rate limits', () => {
  it('the global limit answers 429 RATE_LIMITED with Retry-After and never counts /health', async () => {
    const small = createApp({ limits: { global: { max: 3, windowMs: 60_000 } } })
    const dev = fx.device()
    for (let i = 0; i < 3; i++) expect((await request(small).get('/clips/attributions').set('x-device-id', dev)).status).toBe(200)
    const r = await request(small).get('/catalog').set('x-device-id', dev)
    expect(r.status).toBe(429)
    expect(r.body.error.code).toBe('RATE_LIMITED')
    expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    expect(Number(r.headers['retry-after'])).toBeLessThanOrEqual(60)
    expect((await request(small).get('/health')).status).toBe(200)
  })
  it('POST /sessions has its own tighter limit; other routes are unaffected', async () => {
    const small = createApp({ limits: { sessions: { max: 1, windowMs: 60_000 } } })
    const dev = fx.device()
    expect((await request(small).post('/sessions').set('x-device-id', dev)).status).toBe(201)
    const r = await request(small).post('/sessions').set('x-device-id', dev)
    expect(r.status).toBe(429)
    expect(r.headers['retry-after']).toBeDefined()
    expect((await request(small).get('/catalog').set('x-device-id', dev)).status).toBe(200)
  })
  it('PUT /me and POST /iap/verify have their own limits', async () => {
    const small = createApp({ limits: { settings: { max: 1, windowMs: 60_000 }, iapVerify: { max: 0, windowMs: 60_000 } } })
    const dev = fx.device()
    expect((await request(small).put('/me').set('x-device-id', dev).send({ cueScale: 1.2 })).status).toBe(200)
    expect((await request(small).put('/me').set('x-device-id', dev).send({ cueScale: 1.3 })).status).toBe(429)
    expect((await request(small).post('/iap/verify').set('x-device-id', dev).send({})).status).toBe(429)
  })
  it('the fixed window resets and counts each key apart', () => {
    let t = 0
    const l = createRateLimiter({ max: 2, windowMs: 10_000, now: () => t })
    expect([l.hit('a'), l.hit('a'), l.hit('b')]).toEqual([0, 0, 0])
    t = 2500
    expect(l.hit('a')).toBe(8)
    t = 10_000
    expect(l.hit('a')).toBe(0)
  })
  it('the shipped limits leave room for a venue of devices behind one NAT address', () => {
    expect(HTTP_LIMITS.global.max).toBeGreaterThanOrEqual(600)
    expect(Math.min(HTTP_LIMITS.sessions.max, HTTP_LIMITS.settings.max, HTTP_LIMITS.iapVerify.max)).toBeGreaterThanOrEqual(30)
  })
  it('the pairing-code 429 now carries Retry-After too', async () => {
    for (let i = 0; i < 20; i++) await request(app).get('/me').set('x-session-code', 'ABC10O')
    const r = await request(app).get('/me').set('x-session-code', 'ABC10O')
    expect(r.status).toBe(429)
    expect(r.body.error.code).toBe('RATE_LIMITED')
    expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1)
  })
})
