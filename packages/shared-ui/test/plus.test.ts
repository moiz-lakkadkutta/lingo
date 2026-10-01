import type { PlusStatus, VerifyResult } from '@lingo/contracts'
import { purchaseFlow, restoreFlow, type Api } from '../src/plus/flow'
import { initialPlus, reducePlus, type PlusEvent, type PlusState } from '../src/plus/machine'
import type { PlusStore, PurchaseOutcome, StoreReceipt } from '../src/plus/types'

const status = (over: Partial<PlusStatus> = {}): PlusStatus => ({ mode: 'iap', plus: false, sku: 'lingo.plus.monthly', renewsAt: null, cancelsAt: null, freeSavesPerDay: 20, savesToday: 0, ...over })
const product = { sku: 'lingo.plus.monthly', price: '2,99 €', title: 'Lingo Plus' }
const loaded = (over: Partial<PlusStatus> = {}, storeKind: PlusStore['kind'] = 'amazon-fireos', p: typeof product | null = product): PlusEvent => ({ type: 'loaded', status: status(over), storeKind, product: p })
const run = (events: PlusEvent[], from: PlusState = initialPlus) => events.reduce(reducePlus, from)
const offer: PlusState = { phase: 'offer', price: '2,99 €', note: 'none' }
const receipt = (id: string, over: Partial<StoreReceipt> = {}): StoreReceipt => ({ receiptId: id, userId: 'amzn-1', sku: 'lingo.plus.monthly', termSku: 'lingo.plus.monthly', cancelled: false, ...over })
const ok = (plus: boolean, fulfil = true): VerifyResult => ({ plus, outcome: plus ? 'active' : 'cancelled', fulfil })

describe('reducePlus', () => {
  it('loaded goes to unavailable in off mode or without a store, demo in demo mode, active when plus, offer otherwise', () => {
    expect(initialPlus).toEqual({ phase: 'loading' })
    expect(run([loaded({ mode: 'off' })])).toEqual({ phase: 'unavailable' })
    expect(run([loaded({}, 'none')])).toEqual({ phase: 'unavailable' })
    expect(run([loaded({ mode: 'demo', plus: true })])).toEqual({ phase: 'demo' })
    expect(run([loaded({ mode: 'demo', plus: true }, 'none')])).toEqual({ phase: 'demo' })
    expect(run([loaded({ plus: true, renewsAt: '2026-10-20T00:00:00.000Z' })])).toEqual({ phase: 'active', renewsAt: '2026-10-20T00:00:00.000Z', cancelsAt: null })
    expect(run([loaded()])).toEqual(offer)
    expect(run([loaded({}, 'amazon-vega', null)])).toEqual({ phase: 'offer', price: null, note: 'none' })
  })

  it('offer without a price ignores subscribe', () => {
    const noPrice: PlusState = { phase: 'offer', price: null, note: 'none' }
    expect(reducePlus(noPrice, { type: 'subscribe' })).toBe(noPrice)
    expect(reducePlus(offer, { type: 'subscribe' })).toEqual({ phase: 'busy', step: 'purchasing', price: '2,99 €' })
    expect(reducePlus(noPrice, { type: 'restore' })).toEqual({ phase: 'busy', step: 'restoring', price: null })
  })

  it('a purchased outcome moves to verifying and a plus verify result to active', () => {
    const s1 = reducePlus(offer, { type: 'subscribe' })
    const s2 = reducePlus(s1, { type: 'purchaseOutcome', outcome: { kind: 'purchased', receipt: receipt('r1') } })
    expect(s2).toEqual({ phase: 'busy', step: 'verifying', price: '2,99 €' })
    expect(reducePlus(s2, { type: 'verified', result: ok(true) })).toEqual({ phase: 'active', renewsAt: null, cancelsAt: null })
    expect(reducePlus(s2, { type: 'verified', result: ok(false) })).toEqual({ ...offer, note: 'retry' })
    expect(reducePlus(s2, { type: 'verifyError' })).toEqual({ ...offer, note: 'retry' })
  })

  it('user cancel returns to the offer with no note; an error returns with the retry note', () => {
    const busy = reducePlus({ ...offer, note: 'retry' }, { type: 'subscribe' })
    expect(reducePlus(busy, { type: 'purchaseOutcome', outcome: { kind: 'userCancelled' } })).toEqual(offer)
    expect(reducePlus(busy, { type: 'purchaseOutcome', outcome: { kind: 'error', detail: 'x' } })).toEqual({ ...offer, note: 'retry' })
    expect(reducePlus(busy, { type: 'purchaseOutcome', outcome: { kind: 'notSupported' } })).toEqual({ phase: 'unavailable' })
  })

  it('alreadyOwned starts a restore and an empty restore shows restoreEmpty', () => {
    const busy = reducePlus(offer, { type: 'subscribe' })
    const restoring = reducePlus(busy, { type: 'purchaseOutcome', outcome: { kind: 'alreadyOwned' } })
    expect(restoring).toEqual({ phase: 'busy', step: 'restoring', price: '2,99 €' })
    expect(reducePlus(restoring, { type: 'restored', results: [] })).toEqual({ ...offer, note: 'restoreEmpty' })
    expect(reducePlus(restoring, { type: 'restored', results: [ok(false), { plus: false, outcome: 'unavailable', fulfil: false }] })).toEqual({ ...offer, note: 'restoreEmpty' })
    expect(reducePlus(restoring, { type: 'restored', results: [ok(false), ok(true)] })).toEqual({ phase: 'active', renewsAt: null, cancelsAt: null })
    const active: PlusState = { phase: 'active', renewsAt: null, cancelsAt: null }
    expect(reducePlus(active, { type: 'restore' })).toEqual({ phase: 'busy', step: 'restoring', price: null })
  })

  it('events that do not apply to the phase return the same state object', () => {
    const states: PlusState[] = [initialPlus, { phase: 'unavailable' }, { phase: 'demo' }, offer, { phase: 'busy', step: 'purchasing', price: 'p' }, { phase: 'busy', step: 'verifying', price: 'p' }, { phase: 'busy', step: 'restoring', price: 'p' }, { phase: 'active', renewsAt: null, cancelsAt: null }]
    const events: PlusEvent[] = [loaded(), { type: 'subscribe' }, { type: 'restore' }, { type: 'purchaseOutcome', outcome: { kind: 'userCancelled' } }, { type: 'verified', result: ok(true) }, { type: 'verifyError' }, { type: 'restored', results: [] }]
    const applies: Record<string, string[]> = {
      loading: ['loaded'], unavailable: [], demo: [], offer: ['subscribe', 'restore'], active: ['restore'],
      'busy:purchasing': ['purchaseOutcome'], 'busy:verifying': ['verified', 'verifyError'], 'busy:restoring': ['restored'],
    }
    for (const s of states) {
      const key = s.phase === 'busy' ? `busy:${s.step}` : s.phase
      for (const e of events) {
        const next = reducePlus(s, e)
        if (applies[key]!.includes(e.type)) expect(next, `${key} + ${e.type}`).not.toBe(s)
        else expect(next, `${key} + ${e.type}`).toBe(s)
      }
    }
  })
})

/** A store whose calls are recorded in one log with the api's, so order is checkable. */
const fakeStore = (log: string[], over: { purchase?: PurchaseOutcome; restore?: StoreReceipt[] | Error } = {}): PlusStore => ({
  kind: 'amazon-vega',
  init: vi.fn(async () => {}),
  product: vi.fn(async () => product),
  purchase: vi.fn(async (sku: string): Promise<PurchaseOutcome> => { log.push(`purchase ${sku}`); return over.purchase ?? { kind: 'purchased', receipt: receipt('r1') } }),
  restore: vi.fn(async () => { log.push('restore'); if (over.restore instanceof Error) throw over.restore; return over.restore ?? [] }),
  fulfil: vi.fn(async (id: string) => { log.push(`fulfil ${id}`) }),
  dispose: vi.fn(),
})
const fakeApi = (log: string[], answer: (body: { receiptId: string }) => VerifyResult | Error): Api => (async (path: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? '{}')) as { receiptId: string; store: string; userId: string; sku: string }
  log.push(`${init?.method ?? 'GET'} ${path} ${body.receiptId} ${body.store} ${body.sku}`)
  const a = answer(body)
  if (a instanceof Error) throw a
  return a
}) as Api

describe('flows', () => {
  it('purchaseFlow verifies before it fulfils and does not fulfil when the server says fulfil false', async () => {
    const log: string[] = []
    const events = await purchaseFlow(fakeStore(log), fakeApi(log, () => ok(true)))
    expect(log).toEqual(['purchase lingo.plus.monthly', 'POST /iap/verify r1 amazon-vega lingo.plus.monthly', 'fulfil r1'])
    expect(events).toEqual([{ type: 'purchaseOutcome', outcome: { kind: 'purchased', receipt: receipt('r1') } }, { type: 'verified', result: ok(true) }])

    const log2: string[] = []
    const unavailable: VerifyResult = { plus: false, outcome: 'unavailable', fulfil: false }
    const e2 = await purchaseFlow(fakeStore(log2), fakeApi(log2, () => unavailable))
    expect(log2.some((l) => l.startsWith('fulfil'))).toBe(false)
    expect(e2.at(-1)).toEqual({ type: 'verified', result: unavailable })

    const log3: string[] = []
    const e3 = await purchaseFlow(fakeStore(log3), fakeApi(log3, () => new Error('offline')))
    expect(log3.some((l) => l.startsWith('fulfil'))).toBe(false)
    expect(e3.at(-1)).toEqual({ type: 'verifyError' })

    const log4: string[] = []
    expect(await purchaseFlow(fakeStore(log4, { purchase: { kind: 'userCancelled' } }), fakeApi(log4, () => ok(true)))).toEqual([{ type: 'purchaseOutcome', outcome: { kind: 'userCancelled' } }])
    expect(log4).toEqual(['purchase lingo.plus.monthly'])

    // alreadyOwned continues as a restore, so the machine (busy restoring) gets its restored event
    const log5: string[] = []
    const e5 = await purchaseFlow(fakeStore(log5, { purchase: { kind: 'alreadyOwned' }, restore: [receipt('r9')] }), fakeApi(log5, () => ok(true)))
    expect(e5.map((e) => e.type)).toEqual(['purchaseOutcome', 'restored'])
    expect(log5).toEqual(['purchase lingo.plus.monthly', 'restore', 'POST /iap/verify r9 amazon-vega lingo.plus.monthly', 'fulfil r9'])
  })

  it('restoreFlow verifies each receipt in order and survives a verify error', async () => {
    const log: string[] = []
    const store = fakeStore(log, { restore: [receipt('a'), receipt('b', { sku: 'lingo.plus' }), receipt('c', { cancelled: true })] })
    const events = await restoreFlow(store, fakeApi(log, (b) => (b.receiptId === 'b' ? new Error('500') : b.receiptId === 'c' ? ok(false) : ok(true))))
    expect(log).toEqual([
      'restore',
      'POST /iap/verify a amazon-vega lingo.plus.monthly', 'fulfil a',
      'POST /iap/verify b amazon-vega lingo.plus',
      'POST /iap/verify c amazon-vega lingo.plus.monthly', 'fulfil c',
    ])
    expect(events).toEqual([{ type: 'restored', results: [ok(true), { plus: false, outcome: 'unavailable', fulfil: false }, ok(false)] }])

    const empty: string[] = []
    expect(await restoreFlow(fakeStore(empty, { restore: new Error('store down') }), fakeApi(empty, () => ok(true)))).toEqual([{ type: 'restored', results: [] }])
  })
})
