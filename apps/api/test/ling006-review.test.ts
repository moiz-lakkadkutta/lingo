import { randomBytes } from 'node:crypto'
import { Writable } from 'node:stream'
import pino from 'pino'
import request from 'supertest'
import { LearnerDto, SessionDto } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { learner } from '../src/lib/learner'
import { codeMisses, createMissLimiter } from '../src/lib/rateLimit'
import { newCode } from '../src/routes/sessions'

// Review findings M1, M2, M3 and M5 of LING-006 (docs/plans/LING-006.md, review-006).
const rnd = () => randomBytes(4).toString('hex')
const app = createApp()
let clipId = ''
let highlightId = ''

const tv = async () => {
  const deviceId = 'test-r6-tv-' + rnd()
  const { code } = SessionDto.parse((await request(app).post('/sessions').set('x-device-id', deviceId)).body.data)
  return { deviceId, code }
}
const unknownCode = async () => { let c = newCode(); while (await db.session.findUnique({ where: { code: c } })) c = newCode(); return c }

beforeAll(async () => {
  const clip = await db.clip.create({ data: { slug: 'test-r6-' + rnd(), title: 'R6', sourceLang: 'de', durationS: 60, level: 'A2', coverageRank: 1000, license: 'CC BY 4.0', attribution: 'test', status: 'published' } })
  clipId = clip.id
  const cue = await db.cue.create({ data: { clipId, index: 0, startMs: 0, endMs: 2000, text: 'Der Zug.', native: { en: 'The train.' } } })
  highlightId = (await db.highlight.create({ data: { cueId: cue.id, word: 'Zug', lemma: 'zug', rank: 100, gloss: 'train', grammar: 'noun', example: 'Der Zug.', level: 'A1' } })).id
})
beforeEach(() => codeMisses.reset())
afterAll(async () => {
  await db.learner.deleteMany({ where: { deviceId: { startsWith: 'test-r6-' } } })
  await db.clip.deleteMany({ where: { id: clipId } })
  await db.$disconnect()
})

describe('M1: the session code only reads and reviews', () => {
  it('M1: PUT /me with only a session code does not change the TV learner', async () => {
    const t = await tv()
    const before = await db.learner.findUniqueOrThrow({ where: { deviceId: t.deviceId } })
    const r = await request(app).put('/me').set('x-session-code', t.code).send({ learning: 'en', cueScale: 1.5 })
    expect(r.status).toBe(200)
    const after = await db.learner.findUniqueOrThrow({ where: { deviceId: t.deviceId } })
    expect({ learning: after.learning, cueScale: after.cueScale }).toEqual({ learning: before.learning, cueScale: before.cueScale })
  })
  it('M1: PUT /me/progress, PUT /me/level and POST /me/words ignore the session code', async () => {
    const t = await tv(); const phone = 'test-r6-phone-' + rnd()
    const clip = await db.clip.findUniqueOrThrow({ where: { id: clipId } })
    const h = { 'x-session-code': t.code, 'x-device-id': phone }
    expect((await request(app).put('/me/level').set(h).send({ source: 'settings', level: 'B2' })).status).toBe(200)
    expect((await request(app).put('/me/progress').set(h).send({ clipSlug: clip.slug, positionS: 10, completed: true })).status).toBe(200)
    expect((await request(app).post('/me/words').set(h).send({ highlightId })).status).toBe(201)
    const tvRow = await db.learner.findUniqueOrThrow({ where: { deviceId: t.deviceId }, include: { progress: true, words: true } })
    expect(tvRow.level).toBe('A2')
    expect(tvRow.progress).toHaveLength(0)
    expect(tvRow.words).toHaveLength(0)
  })
  it('M1: the phone routes GET /me, GET /me/words, POST /me/reviews and GET /me/stats still resolve the TV learner from the code', async () => {
    const t = await tv()
    const saved = (await request(app).post('/me/words').set('x-device-id', t.deviceId).send({ highlightId })).body.data.saved as { id: string }
    const h = { 'x-session-code': t.code }
    expect((await request(app).get('/me').set(h)).status).toBe(200)
    expect((await request(app).get('/me/words').set(h)).body.data.map((w: { savedWordId: string }) => w.savedWordId)).toEqual([saved.id])
    expect((await request(app).post('/me/reviews').set(h).send({ savedWordId: saved.id, grade: 'good' })).status).toBe(200)
    expect((await request(app).get('/me/stats').set(h)).status).toBe(200)
  })
  it('M1: a malformed and an unknown code get the same 404 UNKNOWN_CODE', async () => {
    const a = await request(app).get('/me/words').set('x-session-code', 'ABC10O')
    const b = await request(app).get('/me/words').set('x-session-code', await unknownCode())
    expect([a.status, b.status]).toEqual([404, 404])
    expect(a.body).toEqual(b.body)
  })
  it('M1: unknown-code answers are rate-limited per IP: after 20 misses even a real code answers 429 RATE_LIMITED', async () => {
    const t = await tv()
    for (let i = 0; i < 20; i++) expect((await request(app).get('/me').set('x-session-code', await unknownCode())).status).toBe(404)
    const r = await request(app).get('/me').set('x-session-code', t.code)
    expect(r.status).toBe(429)
    expect(r.body.error.code).toBe('RATE_LIMITED')
    // a device-id request from the same IP is not affected
    expect((await request(app).get('/me').set('x-device-id', t.deviceId)).status).toBe(200)
  })
  it('M1: the miss limiter counts per key and forgets misses once the window passes', async () => {
    let now = 0
    const l = createMissLimiter({ max: 2, windowMs: 1000, now: () => now })
    const req = (code: string, ip: string) => ({ ip, header: (n: string) => (n === 'x-session-code' ? code : undefined) })
    for (const ip of ['1.1.1.1', '1.1.1.1']) await expect(learner(req('ABC10O', ip), { allowCode: true, limiter: l })).rejects.toMatchObject({ code: 'UNKNOWN_CODE' })
    await expect(learner(req('ABC10O', '1.1.1.1'), { allowCode: true, limiter: l })).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' })
    await expect(learner(req('ABC10O', '2.2.2.2'), { allowCode: true, limiter: l })).rejects.toMatchObject({ code: 'UNKNOWN_CODE' })
    now = 1001
    expect(l.blocked('1.1.1.1')).toBe(false)
  })
})

describe('M2: GET /me and PUT /me answer LearnerDto only', () => {
  it('M2: GET /me through the code has no deviceId, id or internal columns', async () => {
    const t = await tv()
    const r = await request(app).get('/me').set('x-session-code', t.code)
    expect(r.status).toBe(200)
    expect(Object.keys(r.body.data).sort()).toEqual(Object.keys(LearnerDto.shape).sort())
    expect(JSON.stringify(r.body)).not.toContain(t.deviceId)
  })
  it('M2: PUT /me answers LearnerDto only', async () => {
    const d = 'test-r6-dev-' + rnd()
    const r = await request(app).put('/me').set('x-device-id', d).send({ cueScale: 1.25 })
    expect(r.status).toBe(200)
    expect(Object.keys(r.body.data).sort()).toEqual(Object.keys(LearnerDto.shape).sort())
    expect(r.body.data.cueScale).toBe(1.25)
  })
})

describe('M3: request logs', () => {
  it('M3: pino-http redacts x-session-code and x-device-id', async () => {
    const lines: string[] = []
    const sink = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb() } })
    const logged = createApp({ log: pino({ level: 'info' }, sink) })
    const t = await tv()
    await request(logged).get('/me').set('x-session-code', t.code).set('x-device-id', t.deviceId)
    const out = lines.join('')
    expect(out).toContain('"x-session-code":"[redacted]"')
    expect(out).toContain('"x-device-id":"[redacted]"')
    expect(out).not.toContain(t.code)
    expect(out).not.toContain(t.deviceId)
  })
})

describe('M5: POST /me/reviews is idempotent', () => {
  const fresh = async () => {
    const t = await tv()
    const id = ((await request(app).post('/me/words').set('x-device-id', t.deviceId).send({ highlightId })).body.data.saved as { id: string }).id
    return { ...t, id }
  }
  it('M5: the same reviewId posted twice gives one Review row and interval 1', async () => {
    const t = await fresh()
    const body = { savedWordId: t.id, grade: 'good', reviewId: 'rv-' + rnd() + rnd() }
    const a = await request(app).post('/me/reviews').set('x-session-code', t.code).send(body)
    const b = await request(app).post('/me/reviews').set('x-session-code', t.code).send(body)
    expect([a.status, b.status]).toEqual([200, 200])
    expect(b.body.data).toEqual(a.body.data)
    expect(b.body.data).toMatchObject({ reps: 1, intervalD: 1 })
    expect(await db.review.count({ where: { savedWordId: t.id } })).toBe(1)
    expect((await db.savedWord.findUniqueOrThrow({ where: { id: t.id } })).intervalD).toBe(1)
  })
  it('M5: a retry with a different grade but the same reviewId changes nothing', async () => {
    const t = await fresh()
    const reviewId = 'rv-' + rnd() + rnd()
    await request(app).post('/me/reviews').set('x-session-code', t.code).send({ savedWordId: t.id, grade: 'good', reviewId })
    const r = await request(app).post('/me/reviews').set('x-session-code', t.code).send({ savedWordId: t.id, grade: 'again', reviewId })
    expect(r.body.data).toMatchObject({ reps: 1, lapses: 0, intervalD: 1 })
    expect(await db.review.count({ where: { savedWordId: t.id } })).toBe(1)
  })
  it('M5: two concurrent posts with the same reviewId apply SM-2 once', async () => {
    const t = await fresh()
    const body = { savedWordId: t.id, grade: 'good', reviewId: 'rv-' + rnd() + rnd() }
    const rs = await Promise.all([1, 2, 3].map(() => request(app).post('/me/reviews').set('x-device-id', t.deviceId).send(body)))
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200])
    expect(await db.review.count({ where: { savedWordId: t.id } })).toBe(1)
    expect((await db.savedWord.findUniqueOrThrow({ where: { id: t.id } })).reps).toBe(1)
  })
  it('M5: a malformed reviewId is 400 VALIDATION', async () => {
    const t = await fresh()
    const r = await request(app).post('/me/reviews').set('x-device-id', t.deviceId).send({ savedWordId: t.id, grade: 'good', reviewId: 'x' })
    expect(r.status).toBe(400)
  })
})
