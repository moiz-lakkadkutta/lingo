import type { IapStore } from '@lingo/contracts'
/**
 * The store behind the Plus screen. shared-ui never imports a store library (eslint deny-list): apps/expo injects a
 * react-native-iap store (Amazon flavour) and apps/vega one over @amazon-devices/keplerscript-appstore-iap-lib.
 */
export interface StoreProduct { sku: string; /** localized, from the store, e.g. "2,99 €"; never hard-coded */ price: string; title: string }
export interface StoreReceipt { receiptId: string; userId: string; sku: string; termSku: string | null; cancelled: boolean }
export type PurchaseOutcome =
  | { kind: 'purchased'; receipt: StoreReceipt }
  | { kind: 'alreadyOwned' }          // → run restore
  | { kind: 'userCancelled' }         // back to the offer, no message
  | { kind: 'notSupported' }          // store absent / sandbox not set up
  | { kind: 'error'; detail: string } // detail is for logs only, never shown
export interface PlusStore {
  readonly kind: IapStore | 'none'
  /** Fire OS: initConnection + listeners. Vega: no-op. Idempotent. */
  init(): Promise<void>
  product(sku: string): Promise<StoreProduct | null>
  purchase(sku: string): Promise<PurchaseOutcome>
  /** Fire OS: getAvailablePurchases(). Vega: getPurchaseUpdates({ reset: true }) until !hasMore. Only receipts for which isPlusReceipt() holds. */
  /** Throws when the store couldn't answer (a non-successful response code): an error is never reported as "no purchases". */
  restore(): Promise<StoreReceipt[]>
  /** Fire OS: finishTransaction({ purchase, isConsumable: false }). Vega: notifyFulfillment({ receiptId, fulfillmentResult: FULFILLED }). */
  fulfil(receiptId: string): Promise<void>
  dispose(): void
}
/** kind 'none'; product → null; purchase → notSupported; restore → []; fulfil/init/dispose no-ops. */
export const noStore: PlusStore = {
  kind: 'none',
  init: async () => {},
  product: async () => null,
  purchase: async () => ({ kind: 'notSupported' }),
  restore: async () => [],
  fulfil: async () => {},
  dispose: () => {},
}
