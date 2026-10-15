import { restoreFlow, type Api } from '../src/plus/flow'
import { guardStore, StoreUnavailableError } from '../src/plus/guard'
import type { PlusStore, StoreReceipt } from '../src/plus/types'

const receipt: StoreReceipt = { receiptId: 'r1', userId: 'amzn-1', sku: 'lingo.plus.monthly', termSku: 'lingo.plus.monthly', cancelled: false }

function fakeStore(initFails: boolean) {
  const calls = { init: 0, product: 0, purchase: 0, restore: 0, fulfil: 0, dispose: 0 }
  const store: PlusStore = {
    kind: 'amazon-fireos',
    init: async () => { calls.init++; if (initFails) throw Object.assign(new Error('Failed to initialize billing connection'), { code: 'init-connection' }) },
    product: async (sku) => { calls.product++; return { sku, price: '2,99 €', title: 'Lingo Plus' } },
    purchase: async () => { calls.purchase++; return { kind: 'purchased', receipt } },
    restore: async () => { calls.restore++; return [receipt] },
    fulfil: async () => { calls.fulfil++ },
    dispose: () => { calls.dispose++ },
  }
  return { store, calls }
}

describe('guardStore (QA #14)', () => {
  beforeEach(() => { vi.spyOn(console, 'debug').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  it('when init fails: tries the connection once, caches unavailable, and never calls the inner store again', async () => {
    const { store, calls } = fakeStore(true)
    const g = guardStore(store)
    expect(g.kind).toBe('amazon-fireos')
    expect(g.unavailable).toBe(false)
    await expect(g.init()).rejects.toBeInstanceOf(StoreUnavailableError)
    expect(g.unavailable).toBe(true)
    await expect(g.init()).rejects.toBeInstanceOf(StoreUnavailableError)
    expect(await g.product('lingo.plus.monthly')).toBeNull()
    expect(await g.purchase('lingo.plus.monthly')).toEqual({ kind: 'notSupported' })
    await expect(g.restore()).rejects.toBeInstanceOf(StoreUnavailableError)
    await expect(g.fulfil('r1')).rejects.toBeInstanceOf(StoreUnavailableError)
    expect(calls).toEqual({ init: 1, product: 0, purchase: 0, restore: 0, fulfil: 0, dispose: 0 })
  })

  it('concurrent first calls share one connection attempt', async () => {
    const { store, calls } = fakeStore(true)
    const g = guardStore(store)
    const [p, b] = await Promise.all([g.product('x'), g.purchase('x'), g.init().catch(() => 'failed')])
    expect(p).toBeNull()
    expect(b).toEqual({ kind: 'notSupported' })
    expect(calls.init).toBe(1)
  })

  it('a failed store never unlocks Plus: the startup restore reports restoreError and calls no verify', async () => {
    const { store } = fakeStore(true)
    const g = guardStore(store)
    const api = vi.fn() as unknown as Api
    expect(await restoreFlow(g, api)).toEqual([{ type: 'restoreError' }])
    expect(api).not.toHaveBeenCalled()
  })

  it('when init succeeds: connects once and passes calls through', async () => {
    const { store, calls } = fakeStore(false)
    const g = guardStore(store)
    await g.init()
    expect(await g.product('lingo.plus.monthly')).toEqual({ sku: 'lingo.plus.monthly', price: '2,99 €', title: 'Lingo Plus' })
    expect(await g.purchase('lingo.plus.monthly')).toEqual({ kind: 'purchased', receipt })
    expect(await g.restore()).toEqual([receipt])
    await g.fulfil('r1')
    g.dispose()
    expect(g.unavailable).toBe(false)
    expect(calls).toEqual({ init: 1, product: 1, purchase: 1, restore: 1, fulfil: 1, dispose: 1 })
  })
})
