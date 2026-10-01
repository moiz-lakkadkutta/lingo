// Lingo Plus on Vega: @amazon-devices/keplerscript-appstore-iap-lib ~2.13.0, used directly (as in AmazonAppDev/vega-video-sample).
// Not 2.12.13: every IAP call returns FAILED there:
// https://community.amazondeveloper.com/t/using-amazon-devices-keplerscript-appstore-iap-lib-2-12-13-causes-in-app-purchases-to-fail/24746
// API checked against the published 2.13.0 type definitions (dist/types/IAPTypes.d.ts, dist/PurchasingService.d.ts):
// getProductData → { productData: Map<string, Product>, responseCode }, Product.price.priceStr; purchase → { receipt, userData.userId,
// responseCode }; getPurchaseUpdates({ reset }) → { receiptList, hasMore, userData, responseCode }; notifyFulfillment({ receiptId,
// fulfillmentResult }). Response codes are numeric enums (PurchaseResponseCode.SUCCESSFUL is 0), so they go through explicit switches,
// never Enum[code].
// Docs: https://developer.amazon.com/docs/vega/0.22/vega-iap-overview.html · https://developer.amazon.com/docs/vega/0.22/appstore-integrations-overview.html
import {
  FulfillmentResult, NotifyFulfillmentResponseCode, ProductDataResponseCode, PurchaseResponseCode, PurchaseUpdatesResponseCode, PurchasingService,
} from '@amazon-devices/keplerscript-appstore-iap-lib'
import { mapVegaPurchase, mapVegaUpdates, type PlusStore, type StoreReceipt, type VegaCode } from '@lingo/shared-ui'

/** Pages of getPurchaseUpdates before giving up (a guard against a store that keeps answering hasMore). */
const MAX_PAGES = 20

function purchaseCode(code: PurchaseResponseCode): VegaCode {
  switch (code) {
    case PurchaseResponseCode.SUCCESSFUL: return 'SUCCESSFUL'
    case PurchaseResponseCode.ALREADY_PURCHASED: return 'ALREADY_PURCHASED'
    case PurchaseResponseCode.INVALID_SKU: return 'INVALID_SKU'
    case PurchaseResponseCode.NOT_SUPPORTED: return 'NOT_SUPPORTED'
    case PurchaseResponseCode.FAILED: return 'FAILED'
    default: return 'UNKNOWN'
  }
}

function updatesCode(code: PurchaseUpdatesResponseCode): VegaCode {
  switch (code) {
    case PurchaseUpdatesResponseCode.SUCCESSFUL: return 'SUCCESSFUL'
    case PurchaseUpdatesResponseCode.NOT_SUPPORTED: return 'NOT_SUPPORTED'
    case PurchaseUpdatesResponseCode.FAILED: return 'FAILED'
    default: return 'UNKNOWN'
  }
}

export function createVegaStore(): PlusStore {
  return {
    kind: 'amazon-vega',
    async init() {},
    async product(sku) {
      const r = await PurchasingService.getProductData({ skus: [sku] })
      if (r.responseCode !== ProductDataResponseCode.SUCCESSFUL) return null
      const p = r.productData?.get(sku)
      return p ? { sku: p.sku, price: p.price.priceStr, title: p.title } : null
    },
    async purchase(sku) {
      try {
        const r = await PurchasingService.purchase({ sku })
        return mapVegaPurchase({ code: purchaseCode(r.responseCode), userId: r.userData?.userId, receipt: r.receipt })
      } catch (e) {
        return { kind: 'error', detail: String(e) }
      }
    },
    async restore() {
      const out: StoreReceipt[] = []
      let reset = true
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await PurchasingService.getPurchaseUpdates({ reset })
        out.push(...mapVegaUpdates({ code: updatesCode(r.responseCode), userId: r.userData?.userId, receipts: r.receiptList ?? [], hasMore: r.hasMore }))
        if (r.responseCode !== PurchaseUpdatesResponseCode.SUCCESSFUL || !r.hasMore) break
        reset = false
      }
      return out
    },
    async fulfil(receiptId) {
      const r = await PurchasingService.notifyFulfillment({ receiptId, fulfillmentResult: FulfillmentResult.FULFILLED })
      if (r.responseCode !== NotifyFulfillmentResponseCode.SUCCESSFUL) throw new Error(`notifyFulfillment answered ${String(r.responseCode)}`)
    },
    dispose() {},
  }
}
