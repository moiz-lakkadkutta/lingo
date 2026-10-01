import { randomBytes } from 'node:crypto'
import request from 'supertest'
import type { PlusStatus, VerifyResult } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { env } from '../src/lib/env'
import type { RvsClient, RvsResult } from '../src/lib/rvs'
import { parseRvs } from '../src/lib/rvs'
import { rvsActive, rvsCancelled, rvsOtherSku } from './fixtures/rvs'

// POST /iap/verify and GET /iap/status against Postgres with a fake RVS (no call ever leaves the process).
const rnd = () => randomBytes(4).toString('hex')
const HOUR = 60 * 60 * 1000
const devices: string[] = []
const device = () => { const d = 'test-iap-' + rnd(); devices.push(d); return d }

/** receiptId → what RVS answers. Unknown receipts are a 400 (invalid_receipt), as on the real service. */
const answers = new Map<string, RvsResult>()
const rvs: RvsClient & { verify: ReturnType<typeof vi.fn> } = { verify: vi.fn(async (_userId: string, receiptId: string): Promise<RvsResult> => answers.get(receiptId) ?? { ok: false, status: 400, reason: 'invalid_receipt' as const }) }
const okBody = (body: unknown): RvsResult => ({ ok: true, receipt: parseRvs(body)! })
let clock = Date.now()
const app = createApp({ rvs, now: () => new Date(clock) })

const verify = (deviceId: string, receiptId: string, over: object = {}) =>
  request(app).post('/iap/verify').set('x-device-id', deviceId).send({ store: 'amazon-fireos', receiptId, userId: 'amzn-user-1', sku: 'lingo.plus.monthly', ...over })
const status = async (deviceId: string) => { const r = await request(app).get('/iap/status').set('x-device-id', deviceId); expect(r.status).toBe(200); return r.body.data as PlusStatus }
const me = async (deviceId: string) => (await request(app).get('/me').set('x-device-id', deviceId)).body.data as { plus: boolean }
const learnerRow = (deviceId: string) => db.learner.findUniqueOrThrow({ where: { deviceId } })
const withMode = async (mode: typeof env.LINGO_PLUS_MODE, fn: () => Promise<void>) => {
  const before = env.LINGO_PLUS_MODE
  env.LINGO_PLUS_MODE = mode
  try { await fn() } finally { env.LINGO_PLUS_MODE = before }
}

let clipId = ''
let highlightIds: string[] = []
beforeAll(async () => {
  const clip = await db.clip.create({ data: { slug: 'test-iap-' + rnd(), title: 'IAP test clip', sourceLang: 'de', durationS: 60, level: 'A2', coverageRank: 1000, license: 'CC BY 4.0', attribution: 'test', status: 'ready' } })
  clipId = clip.id
  const cue = await db.cue.create({ data: { clipId, index: 0, startMs: 0, endMs: 2000, text: 'Viele Wörter.', native: { en: 'Many words.' } } })
  highlightIds = []
  for (let i = 0; i < 22; i++) {
    const h = await db.highlight.create({ data: { cueId: cue.id, word: `w${i}`, lemma: `w${i}`, rank: 1000 + i, gloss: 'g', grammar: '', example: '', level: 'A2' } })
    highlightIds.push(h.id)
  }
})
beforeEach(() => { clock = Date.now(); rvs.verify.mockClear(); env.LINGO_PLUS_MODE = 'iap' })
afterAll(async () => {
  await db.learner.deleteMany({ where: { deviceId: { in: devices } } })
  await db.clip.deleteMany({ where: { id: clipId } })
  await db.$disconnect()
})

describe('POST /iap/verify', () => {
  it('POST /iap/verify with an active sandbox receipt sets plus and asks the client to fulfil', async () => {
    const d = device(); const receiptId = 'r-active-' + rnd()
    answers.set(receiptId, okBody(rvsActive(receiptId, clock)))
    const r = await verify(d, receiptId)
    expect(r.status).toBe(200)
    expect(r.body.data as VerifyResult).toEqual({ plus: true, outcome: 'active', fulfil: true })
    expect(rvs.verify).toHaveBeenCalledWith('amzn-user-1', receiptId)
    expect((await learnerRow(d)).plus).toBe(true)
    const p = await db.purchase.findUniqueOrThrow({ where: { receiptId } })
    expect(p).toMatchObject({ store: 'amazon-fireos', amazonUserId: 'amzn-user-1', productId: 'lingo.plus', termSku: 'lingo.plus.monthly', cancelDate: null, testTransaction: true })
    expect((p.raw as { term: string }).term).toBe('1 Month')
    expect((await me(d)).plus).toBe(true)
  })

  it('POST /iap/verify with a cancelled receipt stores it, clears plus and still asks the client to fulfil', async () => {
    const d = device(); const receiptId = 'r-cancel-' + rnd()
    answers.set(receiptId, okBody(rvsCancelled(receiptId, clock)))
    await db.learner.create({ data: { deviceId: d, plus: true } }) // a stale cache from an earlier verify
    const r = await verify(d, receiptId)
    expect(r.body.data).toEqual({ plus: false, outcome: 'cancelled', fulfil: true })
    expect((await db.purchase.findUniqueOrThrow({ where: { receiptId } })).cancelDate).not.toBeNull()
    expect((await learnerRow(d)).plus).toBe(false)
  })

  it('POST /iap/verify does not grant plus for a receipt of another SKU', async () => {
    const d = device(); const receiptId = 'r-other-' + rnd()
    answers.set(receiptId, okBody(rvsOtherSku(receiptId, clock)))
    const r = await verify(d, receiptId)
    expect(r.body.data).toEqual({ plus: false, outcome: 'invalid', fulfil: false })
    expect(await db.purchase.findUnique({ where: { receiptId } })).toBeNull()
    expect((await me(d)).plus).toBe(false)
  })

  it('POST /iap/verify answers unavailable without fulfil when RVS is down, and plus is unchanged', async () => {
    const d = device(); const good = 'r-good-' + rnd(); const down = 'r-down-' + rnd()
    answers.set(good, okBody(rvsActive(good, clock)))
    await verify(d, good)
    answers.set(down, { ok: false, status: 0, reason: 'network' })
    expect((await verify(d, down)).body.data).toEqual({ plus: true, outcome: 'unavailable', fulfil: false })
    answers.set(down, { ok: false, status: 503, reason: 'rvs_error' })
    expect((await verify(d, down)).body.data).toEqual({ plus: true, outcome: 'unavailable', fulfil: false })
    const fresh = device()
    expect((await verify(fresh, down)).body.data).toEqual({ plus: false, outcome: 'unavailable', fulfil: false })
    expect(await db.purchase.findUnique({ where: { receiptId: down } })).toBeNull()
    // RVS 400 → invalid, not fulfilled (the store keeps the receipt)
    expect((await verify(fresh, 'r-unknown-' + rnd())).body.data).toEqual({ plus: false, outcome: 'invalid', fulfil: false })
  })

  it('POST /iap/verify rejects a body with an unknown sku or an overlong receiptId with 400', async () => {
    const d = device()
    expect((await verify(d, 'r1', { sku: 'other.plus' })).status).toBe(400)
    expect((await verify(d, 'x'.repeat(513))).status).toBe(400)
    expect((await verify(d, 'r1', { store: 'google' })).status).toBe(400)
    expect((await verify(d, 'r1', { userId: '' })).status).toBe(400)
    expect(rvs.verify).not.toHaveBeenCalled()
  })

  it('POST /iap/verify is idempotent for the same receiptId', async () => {
    const d = device(); const receiptId = 'r-idem-' + rnd()
    answers.set(receiptId, okBody(rvsActive(receiptId, clock)))
    const a = await verify(d, receiptId)
    const b = await verify(d, receiptId)
    expect(a.body.data).toEqual(b.body.data)
    expect(await db.purchase.count({ where: { receiptId } })).toBe(1)
    // a second learner posting the same receipt takes it over (one Amazon account → one learner at a time)
    const other = device()
    expect((await verify(other, receiptId)).body.data).toMatchObject({ plus: true })
    expect(await db.purchase.count({ where: { receiptId } })).toBe(1)
    expect((await me(d)).plus).toBe(false)
  })
})

describe('GET /iap/status', () => {
  it('GET /iap/status reports mode, plus, renewsAt and savesToday', async () => {
    const d = device()
    const empty = await status(d)
    expect(empty).toEqual({ mode: 'iap', plus: false, sku: 'lingo.plus.monthly', renewsAt: null, cancelsAt: null, freeSavesPerDay: 20, savesToday: 0 })
    const receiptId = 'r-status-' + rnd()
    const body = rvsActive(receiptId, clock)
    answers.set(receiptId, okBody(body))
    await verify(d, receiptId)
    for (const highlightId of highlightIds.slice(0, 3)) expect((await request(app).post('/me/words').set('x-device-id', d).send({ highlightId })).status).toBe(201)
    const s = await status(d)
    expect(s).toMatchObject({ mode: 'iap', plus: true, renewsAt: new Date(body.renewalDate).toISOString(), cancelsAt: null, savesToday: 3 })
    expect(rvs.verify).toHaveBeenCalledTimes(1) // fresh row: no re-verify
  })

  it('GET /iap/status re-verifies a purchase last verified more than 24 hours ago and drops plus when RVS now shows a cancelDate', async () => {
    const d = device(); const receiptId = 'r-stale-' + rnd()
    answers.set(receiptId, okBody(rvsActive(receiptId, clock)))
    await verify(d, receiptId)
    clock += 23 * HOUR
    expect((await status(d)).plus).toBe(true)
    expect(rvs.verify).toHaveBeenCalledTimes(1)
    // cancelled in the meantime; RVS now says so
    const cancelDate = clock - HOUR
    answers.set(receiptId, okBody({ ...rvsActive(receiptId, clock), cancelDate }))
    clock += 2 * HOUR
    const s = await status(d)
    expect(rvs.verify).toHaveBeenCalledTimes(2)
    expect(s.plus).toBe(false)
    expect(s.cancelsAt).toBe(new Date(cancelDate).toISOString())
    expect(s.renewsAt).toBeNull()
    expect((await learnerRow(d)).plus).toBe(false)
    // an RVS failure on re-verify keeps the stored row
    const d2 = device(); const r2 = 'r-stale2-' + rnd()
    answers.set(r2, okBody(rvsActive(r2, clock)))
    await verify(d2, r2)
    answers.set(r2, { ok: false, status: 0, reason: 'network' })
    clock += 25 * HOUR
    expect((await status(d2)).plus).toBe(true)
  })

  it('demo mode grants plus without any purchase and off mode denies it even with an active purchase', async () => {
    const nobody = device(); const buyer = device(); const receiptId = 'r-mode-' + rnd()
    answers.set(receiptId, okBody(rvsActive(receiptId, clock)))
    await verify(buyer, receiptId)
    await withMode('demo', async () => {
      expect(await status(nobody)).toMatchObject({ mode: 'demo', plus: true })
      expect((await me(nobody)).plus).toBe(true)
      expect((await verify(nobody, receiptId)).body.data).toEqual({ plus: true, outcome: 'unavailable', fulfil: false })
    })
    await withMode('off', async () => {
      expect(await status(buyer)).toMatchObject({ mode: 'off', plus: false })
      expect((await me(buyer)).plus).toBe(false)
      expect((await verify(buyer, receiptId)).body.data).toEqual({ plus: false, outcome: 'unavailable', fulfil: false })
    })
    expect(rvs.verify).toHaveBeenCalledTimes(1) // no RVS call outside iap mode
  })
})

describe('Plus gates in /me', () => {
  it('POST /me/words stops at 20 saves a day without plus and does not stop with plus', async () => {
    const d = device()
    const save = (highlightId: string) => request(app).post('/me/words').set('x-device-id', d).send({ highlightId })
    for (const id of highlightIds.slice(0, 20)) expect((await save(id)).body.data.limit).toBe(false)
    const capped = await save(highlightIds[20]!)
    expect(capped.status).toBe(200)
    expect(capped.body.data).toEqual({ limit: true, saved: null })
    const receiptId = 'r-words-' + rnd()
    answers.set(receiptId, okBody(rvsActive(receiptId, clock)))
    await verify(d, receiptId)
    const more = await save(highlightIds[20]!)
    expect(more.status).toBe(201)
    expect(more.body.data.limit).toBe(false)
    expect((await save(highlightIds[21]!)).status).toBe(201)
  })

  it('GET /me returns the computed plus, not the stored column', async () => {
    const d = device()
    await db.learner.create({ data: { deviceId: d, plus: true } })
    expect((await me(d)).plus).toBe(false)
    // and the other way round: a stale false column with an active purchase row
    const d2 = device(); const receiptId = 'r-me-' + rnd()
    const l2 = await db.learner.create({ data: { deviceId: d2, plus: false } })
    await db.purchase.create({ data: { learnerId: l2.id, store: 'amazon-vega', receiptId, amazonUserId: 'u', productId: 'lingo.plus', termSku: 'lingo.plus.monthly', purchaseDate: new Date(), testTransaction: true, verifiedAt: new Date(), raw: {} } })
    expect((await me(d2)).plus).toBe(true)
  })
})
