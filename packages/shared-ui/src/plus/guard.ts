import type { PlusStore } from './types'

/** Thrown by a guarded store's init / restore / fulfil once the store connection has failed. Carries the first failure. */
export class StoreUnavailableError extends Error {
  constructor(readonly reason: unknown) { super('store unavailable'); this.name = 'StoreUnavailableError' }
}

/** A failed connection may be tried again by an explicit user action once this long has passed since the last failure (review M2). */
export const RETRY_AFTER_MS = 30_000

export interface GuardOptions { /** injectable clock (ms) for tests */ now?: () => number; retryAfterMs?: number }

/**
 * QA #14: a store whose connection failed (Fire OS app not installed from the Amazon Appstore / App Tester) must never
 * interrupt unrelated features. A failed init() is cached as "unavailable":
 * - init() (the silent boot restore and the Plus screen's own init) never retries: it rejects with StoreUnavailableError,
 * - fulfil rejects with StoreUnavailableError,
 * - product / purchase / restore are explicit user actions (Plus screen mount, Subscribe, Restore purchase; Root's boot restore
 *   only calls restore after init() succeeded). Once retryAfterMs has passed since the last failure, one of them tries the
 *   connection once more (concurrent calls share that attempt); otherwise, or if the retry fails too, product → null,
 *   purchase → notSupported (the Plus screen's calm "unavailable" state), restore rejects (never reported as "no purchases").
 * Never retried in a loop: each retry needs a user action and a fresh cooldown. Plus is never unlocked by a failure:
 * entitlement only comes from the server's /iap/verify.
 */
export function guardStore(inner: PlusStore, opts: GuardOptions = {}): PlusStore & { readonly unavailable: boolean } {
  const now = opts.now ?? Date.now
  const retryAfterMs = opts.retryAfterMs ?? RETRY_AFTER_MS
  let attempt: Promise<void> | null = null
  let failure: StoreUnavailableError | null = null
  let failedAt = 0
  const connect = () => {
    attempt ??= inner.init().catch((e: unknown) => {
      failure = new StoreUnavailableError(e)
      failedAt = now()
      console.debug('[lingo] plus: store unavailable', e)
      throw failure
    })
    return attempt
  }
  /** Silent path: a cached failure is final. */
  const init = () => (failure ? Promise.reject(failure) : connect())
  /** User action: after the cooldown, forget the failure and connect once more. */
  const ready = async () => {
    if (failure) {
      if (now() - failedAt < retryAfterMs) throw failure
      failure = null
      attempt = null
    }
    await connect()
  }
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
    async fulfil(receiptId) { await init(); return inner.fulfil(receiptId) },
    dispose() { inner.dispose() },
  }
}
