import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { startOfUtcDay } from '../src/lib/day'
import { RENEWAL_GRACE_MS, savesSince } from '../src/lib/entitlement'
import { assertPlusSafe, env, plusSafetyProblems } from '../src/lib/env'
import type { RvsClient, RvsResult } from '../src/lib/rvs'
import { parseRvs } from '../src/lib/rvs'
import { rvsActive, rvsCancelled } from './fixtures/rvs'

// Review findings H1, M2, M5 and L3 of LING-007 (review-007), with a fake RVS: no call leaves the process.
const rnd = () => randomBytes(4).toString('hex')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const devices: string[] = []
const device = () => { const d = 'test-r7-' + rnd(); devices.push(d); return d }

const answers = new Map<string, RvsResult>()
const rvs: RvsClient & { verify: ReturnType<typeof vi.fn> } = { verify: vi.fn(async (_u: string, receiptId: string): Promise<RvsResult> => answers.get(receiptId) ?? { ok: false, status: 0, reason: 'network' as const }) }
const okBody = (body: unknown): RvsResult => ({ ok: true, receipt: parseRvs(body)! })
let clock = Date.now()
const app = createApp({ rvs, now: () => new Date(clock) })
const me = async (d: string) => { const r = await request(app).get('/me').set('x-device-id', d); expect(r.status).toBe(200); return r.body.data as { plus: boolean } }

/** A stored purchase as /iap/verify would have written it, verified `ageMs` ago. */
const purchase = async (learnerId: string, o: { ageMs: number; purchaseDate?: number; cancelDate?: number | null; renewalDate?: number | null }) => {
  const receiptId = 'r7-' + rnd()
  await db.purchase.create({ data: {
    learnerId, store: 'amazon-fireos', receiptId, amazonUserId: 'amzn-r7', productId: 'lingo.plus', termSku: 'lingo.plus.monthly',
    purchaseDate: new Date(o.purchaseDate ?? clock - 10 * DAY), cancelDate: o.cancelDate == null ? null : new Date(o.cancelDate),
    renewalDate: o.renewalDate === undefined ? new Date(clock + 20 * DAY) : o.renewalDate === null ? null : new Date(o.renewalDate),
    testTransaction: true, verifiedAt: new Date(clock - o.ageMs), raw: {},
  } })
  return receiptId
}
const learnerFor = async () => { const d = device(); const l = await db.learner.create({ data: { deviceId: d } }); return { d, id: l.id } }
const askedFor = () => rvs.verify.mock.calls.map((c) => c[1] as string)

let highlightId = ''
let clipId = ''
beforeAll(async () => {
  const clip = await db.clip.create({ data: { slug: 'test-r7-' + rnd(), title: 'R7', sourceLang: 'de', durationS: 60, level: 'A2', coverageRank: 1000, license: 'CC BY 4.0', attribution: 'test', status: 'ready' } })
  clipId = clip.id
  const cue = await db.cue.create({ data: { clipId, index: 0, startMs: 0, endMs: 2000, text: 'Wort.', native: { en: 'Word.' } } })
  highlightId = (await db.highlight.create({ data: { cueId: cue.id, word: 'Wort', lemma: 'wort', rank: 100, gloss: 'word', grammar: '', example: '', level: 'A1' } })).id
})
beforeEach(() => { clock = Date.now(); rvs.verify.mockClear(); answers.clear(); env.LINGO_PLUS_MODE = 'iap' })
afterAll(async () => {
  await db.learner.deleteMany({ where: { deviceId: { in: devices } } })
  await db.clip.deleteMany({ where: { id: clipId } })
  await db.$disconnect()
})

describe('H1: Plus lapses on the server without the client', () => {
  it('H1: GET /me with a row verified 25 h ago, where RVS now returns a cancelDate, gives plus false', async () => {
    const l = await learnerFor()
    const r = await purchase(l.id, { ageMs: 25 * HOUR })
    answers.set(r, okBody(rvsCancelled(r, clock)))
    expect((await me(l.d)).plus).toBe(false)
    expect(askedFor()).toEqual([r])
  })
  it('H1: a fresh row is not re-verified', async () => {
    const l = await learnerFor()
    await purchase(l.id, { ageMs: 23 * HOUR })
    expect((await me(l.d)).plus).toBe(true)
    expect(rvs.verify).not.toHaveBeenCalled()
  })
  it('H1: a cancelled old purchase is re-verified even when a newer row exists', async () => {
    const l = await learnerFor()
    const old = await purchase(l.id, { ageMs: 30 * DAY, purchaseDate: clock - 60 * DAY })
    const newer = await purchase(l.id, { ageMs: 2 * DAY, purchaseDate: clock - 5 * DAY, cancelDate: clock - DAY })
    answers.set(old, okBody(rvsCancelled(old, clock)))
    expect((await me(l.d)).plus).toBe(false)
    expect(askedFor()).toEqual([old]) // the newer row is already cancelled: nothing to ask
    expect(askedFor()).not.toContain(newer)
    // GET /iap/status agrees
    const s = await request(app).get('/iap/status').set('x-device-id', l.d)
    expect(s.body.data.plus).toBe(false)
  })
  it('H1: multiple active stale rows are all re-verified, and Plus stays while any one is still active', async () => {
    const l = await learnerFor()
    const a = await purchase(l.id, { ageMs: 3 * DAY })
    const b = await purchase(l.id, { ageMs: 2 * DAY })
    answers.set(a, okBody(rvsCancelled(a, clock)))
    answers.set(b, okBody(rvsActive(b, clock)))
    expect((await me(l.d)).plus).toBe(true)
    expect(askedFor().sort()).toEqual([a, b].sort())
    // a day later RVS cancels b too
    clock += 25 * HOUR
    rvs.verify.mockClear()
    answers.set(b, okBody(rvsCancelled(b, clock)))
    expect((await me(l.d)).plus).toBe(false)
    expect(askedFor()).toEqual([b])
  })
  it('H1: re-verify is throttled per purchase: a failed RVS call is not retried within an hour', async () => {
    const l = await learnerFor()
    await purchase(l.id, { ageMs: 2 * DAY }) // no answer set → network failure
    expect((await me(l.d)).plus).toBe(true)
    expect((await me(l.d)).plus).toBe(true)
    expect(rvs.verify).toHaveBeenCalledTimes(1)
    clock += 61 * 60 * 1000
    await me(l.d)
    expect(rvs.verify).toHaveBeenCalledTimes(2)
  })
  it('H1: without an RVS answer a row lapses at renewalDate plus the grace period', async () => {
    const l = await learnerFor()
    await purchase(l.id, { ageMs: 40 * DAY, renewalDate: clock - RENEWAL_GRACE_MS + HOUR })
    expect((await me(l.d)).plus).toBe(true)
    clock += 2 * HOUR
    expect((await me(l.d)).plus).toBe(false)
  })
  it('H1: POST /me/words never waits on RVS', async () => {
    const l = await learnerFor()
    await purchase(l.id, { ageMs: 5 * DAY })
    expect((await request(app).post('/me/words').set('x-device-id', l.d).send({ highlightId })).status).toBe(201)
    expect(rvs.verify).not.toHaveBeenCalled()
  })
})

describe('M2: production safety', () => {
  const ok = { LINGO_PLUS_MODE: 'iap', RVS_ENV: 'production', RVS_SHARED_SECRET: 'real-key' } as const
  const prod = { NODE_ENV: 'production', RVS_ENV: 'production', RVS_SHARED_SECRET: 'real-key' }
  it('M2: outside production nothing is refused', () => {
    expect(plusSafetyProblems({ LINGO_PLUS_MODE: 'demo', RVS_ENV: 'sandbox', RVS_SHARED_SECRET: 'sandbox' }, { NODE_ENV: 'test' })).toEqual([])
  })
  it('M2: production refuses to start with sandbox RVS, the default secret or demo mode', () => {
    expect(() => assertPlusSafe({ ...ok, RVS_ENV: 'sandbox' }, { NODE_ENV: 'production', RVS_SHARED_SECRET: 'real-key' })).toThrow(/RVS_ENV=sandbox \(default\)/)
    expect(() => assertPlusSafe({ ...ok, RVS_SHARED_SECRET: 'sandbox' }, { NODE_ENV: 'production', RVS_ENV: 'production' })).toThrow(/RVS_SHARED_SECRET/)
    expect(() => assertPlusSafe({ ...ok, LINGO_PLUS_MODE: 'demo' }, prod)).toThrow(/demo/)
  })
  it('M2: production starts with real RVS settings or with Plus off', () => {
    expect(assertPlusSafe(ok, prod)).toEqual([])
    expect(assertPlusSafe({ LINGO_PLUS_MODE: 'off', RVS_ENV: 'sandbox', RVS_SHARED_SECRET: 'sandbox' }, { NODE_ENV: 'production' })).toEqual([])
  })
  it('M2: LINGO_ALLOW_UNSAFE_PLUS=true lets it start and returns the problems to log', () => {
    const problems = assertPlusSafe({ ...ok, LINGO_PLUS_MODE: 'demo' }, { ...prod, LINGO_ALLOW_UNSAFE_PLUS: 'true' })
    expect(problems).toHaveLength(1)
  })
})

describe('M5: the free-tier day is a UTC day', () => {
  it('M5: savesSince counts from 00:00 UTC whatever the host time zone', async () => {
    const before = process.env.TZ
    process.env.TZ = 'Europe/Berlin'
    try {
      const l = await learnerFor()
      const now = new Date('2026-10-01T23:45:00.000Z') // already 2 October in Berlin
      await db.savedWord.create({ data: { learnerId: l.id, highlightId, createdAt: new Date('2026-10-01T21:30:00.000Z') } })
      expect(startOfUtcDay(now).toISOString()).toBe('2026-10-01T00:00:00.000Z')
      expect(await savesSince(l.id, now)).toBe(1) // local midnight (22:00Z) would give 0
      expect(await savesSince(l.id, new Date('2026-10-02T00:30:00.000Z'))).toBe(0)
    } finally {
      if (before === undefined) delete process.env.TZ; else process.env.TZ = before
    }
  })
})

describe('L3: /iap uses the device learner only', () => {
  it('L3: POST /iap/verify without x-device-id is 400, even with a session code', async () => {
    const body = { store: 'amazon-fireos', receiptId: 'r7-x', userId: 'u', sku: 'lingo.plus.monthly' }
    expect((await request(app).post('/iap/verify').send(body)).status).toBe(400)
    expect((await request(app).post('/iap/verify').set('x-session-code', 'ABC234').send(body)).status).toBe(400)
    expect(rvs.verify).not.toHaveBeenCalled()
  })
})
