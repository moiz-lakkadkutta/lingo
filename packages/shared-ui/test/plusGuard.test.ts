import { restoreFlow, type Api } from '../src/plus/flow'
import { guardStore, RETRY_AFTER_MS, StoreUnavailableError } from '../src/plus/guard'
import type { PlusStore, StoreReceipt } from '../src/plus/types'

const receipt: StoreReceipt = { receiptId: 'r1', userId: 'amzn-1', sku: 'lingo.plus.monthly', termSku: 'lingo.plus.monthly', cancelled: false }

/** initFails: true fails every init; a number fails only the first n. */
function fakeStore(initFails: boolean | number) {
  const calls = { init: 0, product: 0, purchase: 0, restore: 0, fulfil: 0, dispose: 0 }
  const store: PlusStore = {
    kind: 'amazon-fireos',
    init: async () => { calls.init++; if (initFails === true || (typeof initFails === 'number' && calls.init <= initFails)) throw Object.assign(new Error('Failed to initialize billing connection'), { code: 'init-connection' }) },
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

  it('when init fails: tries the connection once, caches unavailable, and never calls the inner store again within the cooldown', async () => {
    const { store, calls } = fakeStore(true)
    const g = guardStore(store, { now: () => 0 })
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
  describe('retry on an explicit user action after a cooldown (review M2)', () => {
    it('the boot failure is cached; a user action before the cooldown does not reconnect; after it, one retry; success then works', async () => {
      let t = 0
      const { store, calls } = fakeStore(1) // a transient failure: the second connection attempt succeeds
      const g = guardStore(store, { now: () => t })
      await expect(g.init()).rejects.toBeInstanceOf(StoreUnavailableError) // boot
      expect(RETRY_AFTER_MS).toBe(30_000)
      t = RETRY_AFTER_MS - 1
      await expect(g.init()).rejects.toBeInstanceOf(StoreUnavailableError) // init() (boot / Plus mount) never retries
      expect(await g.product('lingo.plus.monthly')).toBeNull()
      expect(await g.purchase('lingo.plus.monthly')).toEqual({ kind: 'notSupported' })
      await expect(g.restore()).rejects.toBeInstanceOf(StoreUnavailableError)
      expect(calls.init).toBe(1)
      t = RETRY_AFTER_MS
      await expect(g.init()).rejects.toBeInstanceOf(StoreUnavailableError) // still cached for the silent path
      expect(calls.init).toBe(1)
      expect(await g.product('lingo.plus.monthly')).toEqual({ sku: 'lingo.plus.monthly', price: '2,99 €', title: 'Lingo Plus' }) // Plus screen mount
      expect(calls.init).toBe(2)
      expect(g.unavailable).toBe(false)
      expect(await g.purchase('lingo.plus.monthly')).toEqual({ kind: 'purchased', receipt })
      expect(await g.restore()).toEqual([receipt])
      await g.init()
      expect(calls.init).toBe(2)
    })
    it('a failed retry waits a whole new cooldown and never unlocks Plus; concurrent actions share one retry', async () => {
      let t = 0
      const { store, calls } = fakeStore(true)
      const g = guardStore(store, { now: () => t })
      await g.init().catch(() => {})
      t = RETRY_AFTER_MS
      const [p, b] = await Promise.all([g.product('x'), g.purchase('x')])
      expect([p, b]).toEqual([null, { kind: 'notSupported' }])
      expect(calls.init).toBe(2)
      t = RETRY_AFTER_MS * 2 - 1
      expect(await g.restore().catch((e: unknown) => e)).toBeInstanceOf(StoreUnavailableError)
      expect(calls.init).toBe(2)
      t = RETRY_AFTER_MS * 2
      const api = vi.fn() as unknown as Api
      expect(await restoreFlow(g, api)).toEqual([{ type: 'restoreError' }]) // a user-triggered restore retries once, fails calmly
      expect(api).not.toHaveBeenCalled()
      expect(calls).toMatchObject({ init: 3, product: 0, purchase: 0, restore: 0 })
    })
  })
})
