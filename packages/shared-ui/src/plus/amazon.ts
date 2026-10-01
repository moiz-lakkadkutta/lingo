/**
 * Pure mappers from Amazon store responses to PlusStore shapes. The platform stores (apps/expo/src/fireosStore.ts,
 * apps/vega/src/iap/vegaStore.ts) are thin wrappers over these, so the device-only code paths stay tested.
 * Vega IAP lib 2.13.0 types (PurchaseResponseCode, Receipt.isCancelled/cancelDate, userData.userId):
 * https://developer.amazon.com/docs/vega/0.22/vega-iap-overview.html
 * react-native-iap 16.7.x (Amazon flavour): purchaseToken is the Amazon receiptId, userIdAmazon the RVS user id.
 * The FAILED code name below is an Amazon response code, not learner-facing copy.
 */
import { PLUS_PARENT_SKU, PLUS_SKU } from '@lingo/contracts'
import type { PurchaseOutcome, StoreReceipt } from './types'

export type VegaCode = 'SUCCESSFUL' | 'ALREADY_PURCHASED' | 'INVALID_SKU' | 'FAILED' | 'NOT_SUPPORTED' | 'UNKNOWN' // lint-words-allow: Amazon response code
export interface VegaReceiptLike { receiptId: string; sku: string; termSku?: string | null; isCancelled?: boolean; cancelDate?: unknown }
export interface VegaPurchaseLike { code: VegaCode; userId?: string | null; receipt?: VegaReceiptLike | null }
export interface VegaUpdatesLike { code: VegaCode; userId?: string | null; receipts: VegaReceiptLike[]; hasMore: boolean }

const PLUS_SKUS: ReadonlySet<string> = new Set([PLUS_PARENT_SKU, PLUS_SKU])
/** sku or termSku ∈ { PLUS_PARENT_SKU, PLUS_SKU } */
export function isPlusReceipt(r: { sku: string; termSku?: string | null }): boolean {
  return PLUS_SKUS.has(r.sku) || (r.termSku != null && PLUS_SKUS.has(r.termSku))
}

const vegaReceipt = (r: VegaReceiptLike, userId: string): StoreReceipt => ({
  receiptId: r.receiptId, userId, sku: r.sku, termSku: r.termSku || null,
  cancelled: r.isCancelled === true || r.cancelDate != null,
})

/**
 * SUCCESSFUL+receipt+userId → purchased; ALREADY_PURCHASED → alreadyOwned; NOT_SUPPORTED → notSupported; INVALID_SKU/FAILED/UNKNOWN → error.
 * The Vega lib has no separate user-cancel code: a dismissed dialog reports FAILED, so the machine returns to the offer with the
 * neutral retry line.
 */
export function mapVegaPurchase(r: VegaPurchaseLike): PurchaseOutcome {
  switch (r.code) {
    case 'SUCCESSFUL':
      if (r.receipt?.receiptId && r.userId) return { kind: 'purchased', receipt: vegaReceipt(r.receipt, r.userId) }
      return { kind: 'error', detail: 'SUCCESSFUL without receipt or userId' }
    case 'ALREADY_PURCHASED': return { kind: 'alreadyOwned' }
    case 'NOT_SUPPORTED': return { kind: 'notSupported' }
    default: return { kind: 'error', detail: r.code }
  }
}

/** SUCCESSFUL → receipts mapped (cancelled = isCancelled === true || cancelDate != null), filtered by isPlusReceipt; other codes → []. */
export function mapVegaUpdates(r: VegaUpdatesLike): StoreReceipt[] {
  if (r.code !== 'SUCCESSFUL' || !r.userId) return []
  const userId = r.userId
  return r.receipts.filter((x) => !!x.receiptId && isPlusReceipt(x)).map((x) => vegaReceipt(x, userId))
}

export interface FireOsPurchaseLike { productId: string; purchaseToken?: string | null; userIdAmazon?: string | null; store?: string; purchaseState?: string; ids?: string[] | null }
/** purchaseToken (= Amazon receiptId) and userIdAmazon required → receipt (sku = productId, termSku = PLUS_SKU when ids/productId contain it); else null. */
export function mapFireOsPurchase(p: FireOsPurchaseLike): StoreReceipt | null {
  if (!p.purchaseToken || !p.userIdAmazon) return null
  const skus = [p.productId, ...(p.ids ?? [])]
  return { receiptId: p.purchaseToken, userId: p.userIdAmazon, sku: p.productId, termSku: skus.includes(PLUS_SKU) ? PLUS_SKU : null, cancelled: false }
}

const NOT_AVAILABLE: ReadonlySet<string> = new Set(['feature-not-supported', 'iap-not-available', 'billing-unavailable', 'service-unavailable'])
/** react-native-iap ErrorCode strings: user-cancelled → userCancelled; already-owned → alreadyOwned; not-available codes → notSupported; else error. */
export function mapFireOsError(e: { code?: string; message?: string }): PurchaseOutcome {
  if (e.code === 'user-cancelled') return { kind: 'userCancelled' }
  if (e.code === 'already-owned') return { kind: 'alreadyOwned' }
  if (e.code && NOT_AVAILABLE.has(e.code)) return { kind: 'notSupported' }
  return { kind: 'error', detail: `${e.code ?? 'unknown'}: ${e.message ?? ''}`.trim() }
}
