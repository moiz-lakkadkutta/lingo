import type { PlusStore } from './types'

/** Thrown by a guarded store's init / restore / fulfil once the store connection has failed. Carries the first failure. */
export class StoreUnavailableError extends Error {
  constructor(readonly reason: unknown) { super('store unavailable'); this.name = 'StoreUnavailableError' }
}

/**
 * QA #14: a store whose connection failed (Fire OS app not installed from the Amazon Appstore / App Tester) must never
 * interrupt unrelated features. The wrapped store's init() runs at most once per app run; a failure is cached as
 * "unavailable" and never retried. After that, without calling the inner store again:
 * - init / restore / fulfil reject with StoreUnavailableError (restore still never reports an error as "no purchases"),
 * - product → null, purchase → notSupported (the Plus screen's calm "unavailable" state).
 * Plus is never unlocked by a failure: entitlement only comes from the server's /iap/verify.
 */
export function guardStore(inner: PlusStore): PlusStore & { readonly unavailable: boolean } {
  let attempt: Promise<void> | null = null
  let failure: StoreUnavailableError | null = null
  const init = () => {
    attempt ??= inner.init().catch((e: unknown) => {
      failure = new StoreUnavailableError(e)
      console.debug('[lingo] plus: store unavailable', e)
      throw failure
    })
    return attempt
  }
  const ready = async () => { if (failure) throw failure; await init() }
  return {
    get kind() { return inner.kind },
    get unavailable() { return failure !== null },
    init,
    async product(sku) {
      try { await ready() } catch { return null }
      return inner.product(sku)
    },
    async purchase(sku) {
      try { await ready() } catch { return { kind: 'notSupported' } }
      return inner.purchase(sku)
    },
    async restore() { await ready(); return inner.restore() },
    async fulfil(receiptId) { await ready(); return inner.fulfil(receiptId) },
    dispose() { inner.dispose() },
  }
}
