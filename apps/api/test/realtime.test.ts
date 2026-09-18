import type http from 'node:http'
import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import request from 'supertest'
import { io as connect, type Socket } from 'socket.io-client'
import { SessionDto, WordSavedPayload } from '@lingo/contracts'
import type { ClientToServerEvents, ServerToClientEvents } from '@lingo/contracts'
import { db } from '../src/lib/db'
import { createServer, type LingoIo } from '../src/server'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const rnd = () => randomBytes(4).toString('hex')

let server: http.Server
let io: LingoIo
let base = ''
const deviceId = 'test-tv-' + rnd()
let clip: { id: string; slug: string; title: string }
let highlightIds: string[] = []
const clients: Client[] = []

const listen = (s: http.Server) => new Promise<number>((resolve) => s.listen(0, '127.0.0.1', () => resolve((s.address() as { port: number }).port)))
const client = (): Client => { const c: Client = connect(base, { transports: ['websocket'], forceNew: true }); clients.push(c); return c }
const once = <E extends keyof ServerToClientEvents>(s: Client, event: E, ms = 1000) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const t = setTimeout(() => { s.off(event, h as never); reject(new Error(`timeout waiting for ${event}`)) }, ms)
    const h = (p: Parameters<ServerToClientEvents[E]>[0]) => { clearTimeout(t); resolve(p) }
    s.once(event, h as never)
  })
const connected = (s: Client) => new Promise<void>((resolve) => (s.connected ? resolve() : s.once('connect', () => resolve())))
const createSession = async (id = deviceId) => { const r = await request(server).post('/sessions').set('x-device-id', id); return { status: r.status, body: r.body as { success: boolean; data: unknown } } }
const tvJoined = async (code: string) => { const tv = client(); await connected(tv); const state = once(tv, 'session:state'); tv.emit('join', { code, role: 'tv' }); await state; return tv }

beforeAll(async () => {
  const s = createServer(); server = s.server; io = s.io
  base = `http://127.0.0.1:${await listen(server)}`
  const slug = 'test-realtime-' + rnd()
  clip = await db.clip.create({ data: { slug, title: 'Realtime test clip', sourceLang: 'de', durationS: 60, level: 'A2', coverageRank: 1000, license: 'CC BY 4.0', attribution: 'test', status: 'ready' } })
  const cue = await db.cue.create({ data: { clipId: clip.id, index: 0, startMs: 0, endMs: 2000, text: 'Der Zug fährt vom Bahnhof ab.', native: { en: 'The train leaves from the station.' } } })
  const words = ['Zug', 'fährt', 'Bahnhof', 'ab', 'Der']
  for (const [i, w] of words.entries()) {
    const h = await db.highlight.create({ data: { cueId: cue.id, word: w, lemma: w.toLowerCase(), rank: 100 + i, gloss: `gloss ${w}`, grammar: 'noun', example: `Beispiel mit ${w}.`, level: 'A1' } })
    highlightIds.push(h.id)
  }
}, 30_000)

afterAll(async () => {
  for (const c of clients) c.disconnect()
  await db.learner.deleteMany({ where: { deviceId: { startsWith: 'test-tv-' } } }) // SavedWord → Highlight has no cascade: learners (and their words) go first
  if (clip) await db.clip.delete({ where: { id: clip.id } })
  await new Promise<void>((resolve) => io.close(() => resolve())) // also closes the http server: https://socket.io/docs/v4/server-api/#serverclosecallback
  await db.$disconnect()
}, 30_000)

describe('POST /sessions', () => {
  it('returns a 6-char code and joinUrl in the envelope (201)', async () => {
    const { status, body } = await createSession()
    expect(status).toBe(201)
    expect(body.success).toBe(true)
    const dto = SessionDto.parse(body.data)
    expect(dto.joinUrl.endsWith('/' + dto.code)).toBe(true)
  })
  it('is idempotent per device: second call returns the same code', async () => {
    const a = SessionDto.parse((await createSession()).body.data)
    const b = SessionDto.parse((await createSession()).body.data)
    expect(b.code).toBe(a.code)
  })
})

describe('join', () => {
  let code = ''
  beforeAll(async () => { code = SessionDto.parse((await createSession()).body.data).code })

  it('tv join gets session:state with phone null', async () => {
    const tv = client(); await connected(tv)
    const state = once(tv, 'session:state')
    tv.emit('join', { code, role: 'tv' })
    expect(await state).toEqual({ code, phone: null })
    tv.disconnect()
  })
  it('unknown code gets session:error UNKNOWN_CODE and does not crash the server', async () => {
    const s = client(); await connected(s)
    const err = once(s, 'session:error')
    s.emit('join', { code: 'ZZZZZZ', role: 'tv' })
    expect((await err).code).toBe('UNKNOWN_CODE')
    const health = await request(server).get('/health')
    expect(health.status).toBe(200)
    s.disconnect()
  })
  it('malformed payload gets session:error VALIDATION', async () => {
    const s = client(); await connected(s)
    const err = once(s, 'session:error')
    s.emit('join', { code: 'abc' } as never)
    expect((await err).code).toBe('VALIDATION')
    s.disconnect()
  })
  it('phone join → tv receives phone:connected with the device name within 1 s', async () => {
    const tv = await tvJoined(code)
    const phone = client(); await connected(phone)
    const evt = once(tv, 'phone:connected', 1000)
    phone.emit('join', { code, role: 'phone', deviceName: "Moiz's iPhone" })
    expect(await evt).toEqual({ code, phoneName: "Moiz's iPhone" })
    phone.disconnect(); tv.disconnect()
  })
  it('phone join without deviceName → phoneName "Your phone"', async () => {
    const tv = await tvJoined(code)
    const phone = client(); await connected(phone)
    const evt = once(tv, 'phone:connected')
    phone.emit('join', { code, role: 'phone' })
    expect((await evt).phoneName).toBe('Your phone')
    phone.disconnect(); tv.disconnect()
  })
  it('a tv joining after the phone learns the phone from session:state', async () => {
    const witness = await tvJoined(code)
    const phone = client(); await connected(phone)
    const joined = once(witness, 'phone:connected')
    phone.emit('join', { code, role: 'phone', deviceName: 'Pixel 8' })
    await joined
    const tv = client(); await connected(tv)
    const state = once(tv, 'session:state')
    tv.emit('join', { code, role: 'tv' })
    expect(await state).toEqual({ code, phone: 'Pixel 8' })
    phone.disconnect(); tv.disconnect(); witness.disconnect()
  })
  it('an over-long deviceName is clamped to 40 characters, not refused', async () => {
    const tv = await tvJoined(code)
    const phone = client(); await connected(phone)
    const evt = once(tv, 'phone:connected')
    phone.emit('join', { code, role: 'phone', deviceName: 'A'.repeat(41) })
    expect((await evt).phoneName).toBe('A'.repeat(40))
    phone.disconnect(); tv.disconnect()
  })
  it('a blank deviceName gets the default name', async () => {
    const tv = await tvJoined(code)
    const phone = client(); await connected(phone)
    const evt = once(tv, 'phone:connected')
    phone.emit('join', { code, role: 'phone', deviceName: '   ' })
    expect((await evt).phoneName).toBe('Your phone')
    phone.disconnect(); tv.disconnect()
  })
  it('phone disconnect → tv receives phone:disconnected; Session.phoneConnected is false', async () => {
    const tv = await tvJoined(code)
    const phone = client(); await connected(phone)
    const joined = once(tv, 'phone:connected')
    phone.emit('join', { code, role: 'phone', deviceName: 'Pixel 8' })
    await joined
    expect((await db.session.findUniqueOrThrow({ where: { code } })).phoneConnected).toBe(true)
    const gone = once(tv, 'phone:disconnected')
    phone.disconnect()
    expect(await gone).toEqual({ code })
    for (let i = 0; i < 20 && (await db.session.findUniqueOrThrow({ where: { code } })).phoneConnected; i++) await new Promise((r) => setTimeout(r, 50))
    expect((await db.session.findUniqueOrThrow({ where: { code } })).phoneConnected).toBe(false)
    tv.disconnect()
  })
  it('with two phones, the tv only hears phone:disconnected when the last one leaves', async () => {
    const tv = await tvJoined(code)
    const first = client(); await connected(first)
    let joined = once(tv, 'phone:connected')
    first.emit('join', { code, role: 'phone', deviceName: 'First' })
    await joined
    const second = client(); await connected(second)
    joined = once(tv, 'phone:connected')
    second.emit('join', { code, role: 'phone', deviceName: 'Second' })
    await joined
    const early = once(tv, 'phone:disconnected', 300)
    first.disconnect()
    await expect(early).rejects.toThrow(/timeout/)
    expect((await db.session.findUniqueOrThrow({ where: { code } })).phoneConnected).toBe(true)
    const gone = once(tv, 'phone:disconnected')
    second.disconnect()
    expect(await gone).toEqual({ code })
    tv.disconnect()
  })
})

describe('word:saved latency', () => {
  let code = ''
  let phone: Client
  beforeAll(async () => {
    code = SessionDto.parse((await createSession()).body.data).code
    const tv = await tvJoined(code)
    phone = client(); await connected(phone)
    const joined = once(tv, 'phone:connected')
    phone.emit('join', { code, role: 'phone', deviceName: 'Pixel 8' })
    await joined
  })

  it('5 saves reach the phone with the right word; each < 1000 ms; p95 < 1000 ms', async () => {
    const times: number[] = []
    for (const highlightId of highlightIds) {
      const t0 = performance.now()
      const p = once(phone, 'word:saved')
      const res = await request(server).post('/me/words').set('x-device-id', deviceId).send({ highlightId, sessionCode: code })
      expect(res.status).toBe(201)
      const w = await p
      const dt = performance.now() - t0
      times.push(dt)
      expect(w.highlightId).toBe(highlightId)
      WordSavedPayload.parse(w)
      expect(w.code).toBe(code)
      expect(w.clipTitle).toBe(clip.title)
      expect(w.clipSlug).toBe(clip.slug)
    }
    const sorted = [...times].sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1]!
    console.log(`word:saved TV→phone latency ms: [${times.map((t) => t.toFixed(1)).join(', ')}] p95=${p95.toFixed(1)}`)
    for (const t of times) expect(t).toBeLessThan(1000)
    expect(p95).toBeLessThan(1000)
  }, 15_000)

  it('does not emit when the daily limit is hit', async () => {
    const limited = 'test-tv-limited-' + rnd()
    const l = await db.learner.create({ data: { deviceId: limited } })
    // 20 saved words today for this free learner → the 21st is refused and nothing is emitted.
    const cue = await db.cue.create({ data: { clipId: clip.id, index: 1, startMs: 2000, endMs: 4000, text: 'filler', native: { en: 'filler' } } })
    const ids: string[] = []
    for (let i = 0; i < 20; i++) { const h = await db.highlight.create({ data: { cueId: cue.id, word: `w${i}`, lemma: `w${i}`, rank: 1, gloss: 'g', grammar: 'x', example: 'e', level: 'A1' } }); ids.push(h.id) }
    await db.savedWord.createMany({ data: ids.map((highlightId) => ({ learnerId: l.id, highlightId })) })
    const p = once(phone, 'word:saved', 500)
    const res = await request(server).post('/me/words').set('x-device-id', limited).send({ highlightId: highlightIds[0], sessionCode: code })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ limit: true, saved: null })
    await expect(p).rejects.toThrow(/timeout/)
  }, 15_000)

  it('rejects a malformed sessionCode before saving', async () => {
    const id = 'test-tv-badcode-' + rnd()
    const p = once(phone, 'word:saved', 300)
    const res = await request(server).post('/me/words').set('x-device-id', id).send({ highlightId: highlightIds[2], sessionCode: 'not-a-code' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
    const l = await db.learner.findUnique({ where: { deviceId: id } })
    expect(l ? await db.savedWord.count({ where: { learnerId: l.id } }) : 0).toBe(0)
    await expect(p).rejects.toThrow(/timeout/)
  })
  it('does not emit without sessionCode', async () => {
    const p = once(phone, 'word:saved', 500)
    const res = await request(server).post('/me/words').set('x-device-id', 'test-tv-nocode-' + rnd()).send({ highlightId: highlightIds[1] })
    expect(res.status).toBe(201)
    await expect(p).rejects.toThrow(/timeout/)
  })
})
