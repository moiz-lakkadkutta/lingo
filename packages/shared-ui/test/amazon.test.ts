import { isPlusReceipt, mapFireOsError, mapFireOsPurchase, mapVegaPurchase, mapVegaUpdates } from '../src/plus/amazon'

const vegaReceipt = { receiptId: 'v-r1', sku: 'lingo.plus', termSku: 'lingo.plus.monthly', isCancelled: false, cancelDate: null }

describe('Amazon response mappers', () => {
  it('mapVegaPurchase turns SUCCESSFUL with a receipt into purchased with userId and termSku', () => {
    expect(mapVegaPurchase({ code: 'SUCCESSFUL', userId: 'amzn-1', receipt: vegaReceipt })).toEqual({
      kind: 'purchased', receipt: { receiptId: 'v-r1', userId: 'amzn-1', sku: 'lingo.plus', termSku: 'lingo.plus.monthly', cancelled: false },
    })
    // SUCCESSFUL without what RVS needs is not a purchase the server can verify
    expect(mapVegaPurchase({ code: 'SUCCESSFUL', userId: null, receipt: vegaReceipt }).kind).toBe('error')
    expect(mapVegaPurchase({ code: 'SUCCESSFUL', userId: 'amzn-1', receipt: null }).kind).toBe('error')
  })

  it('mapVegaPurchase maps ALREADY_PURCHASED, NOT_SUPPORTED, INVALID_SKU and FAILED', () => {
    expect(mapVegaPurchase({ code: 'ALREADY_PURCHASED' })).toEqual({ kind: 'alreadyOwned' })
    expect(mapVegaPurchase({ code: 'NOT_SUPPORTED' })).toEqual({ kind: 'notSupported' })
    expect(mapVegaPurchase({ code: 'INVALID_SKU' })).toMatchObject({ kind: 'error' })
    expect(mapVegaPurchase({ code: 'FAILED' })).toMatchObject({ kind: 'error' })
    expect(mapVegaPurchase({ code: 'UNKNOWN' })).toMatchObject({ kind: 'error' })
  })

  it('mapVegaUpdates keeps only Plus receipts and marks cancelled ones', () => {
    const receipts = [
      vegaReceipt,
      { receiptId: 'v-r2', sku: 'lingo.plus', termSku: 'lingo.plus.monthly', isCancelled: true },
      { receiptId: 'v-r3', sku: 'lingo.plus', termSku: 'lingo.plus.monthly', cancelDate: new Date('2026-09-01') },
      { receiptId: 'v-r4', sku: 'coins.100', termSku: null },
    ]
    expect(mapVegaUpdates({ code: 'SUCCESSFUL', userId: 'amzn-1', receipts, hasMore: false })).toEqual([
      { receiptId: 'v-r1', userId: 'amzn-1', sku: 'lingo.plus', termSku: 'lingo.plus.monthly', cancelled: false },
      { receiptId: 'v-r2', userId: 'amzn-1', sku: 'lingo.plus', termSku: 'lingo.plus.monthly', cancelled: true },
      { receiptId: 'v-r3', userId: 'amzn-1', sku: 'lingo.plus', termSku: 'lingo.plus.monthly', cancelled: true },
    ])
    expect(mapVegaUpdates({ code: 'FAILED', userId: 'amzn-1', receipts, hasMore: false })).toEqual([])
    expect(mapVegaUpdates({ code: 'SUCCESSFUL', userId: null, receipts, hasMore: false })).toEqual([])
  })

  it('mapFireOsPurchase uses purchaseToken as receiptId and userIdAmazon as userId, and returns null without them', () => {
    expect(mapFireOsPurchase({ productId: 'lingo.plus.monthly', purchaseToken: 'f-r1', userIdAmazon: 'amzn-2', store: 'amazon', purchaseState: 'purchased' })).toEqual({
      receiptId: 'f-r1', userId: 'amzn-2', sku: 'lingo.plus.monthly', termSku: 'lingo.plus.monthly', cancelled: false,
    })
    expect(mapFireOsPurchase({ productId: 'lingo.plus', ids: ['lingo.plus', 'lingo.plus.monthly'], purchaseToken: 'f-r2', userIdAmazon: 'amzn-2' })).toMatchObject({ sku: 'lingo.plus', termSku: 'lingo.plus.monthly' })
    expect(mapFireOsPurchase({ productId: 'lingo.plus', purchaseToken: 'f-r3', userIdAmazon: 'amzn-2' })).toMatchObject({ sku: 'lingo.plus', termSku: null })
    expect(mapFireOsPurchase({ productId: 'lingo.plus.monthly', purchaseToken: null, userIdAmazon: 'amzn-2' })).toBeNull()
    expect(mapFireOsPurchase({ productId: 'lingo.plus.monthly', purchaseToken: 'f-r1' })).toBeNull()
    expect(mapFireOsPurchase({ productId: 'lingo.plus.monthly', purchaseToken: '', userIdAmazon: '' })).toBeNull()
  })

  it('mapFireOsError maps user-cancelled, already-owned and not-available codes', () => {
    expect(mapFireOsError({ code: 'user-cancelled' })).toEqual({ kind: 'userCancelled' })
    expect(mapFireOsError({ code: 'already-owned' })).toEqual({ kind: 'alreadyOwned' })
    for (const code of ['feature-not-supported', 'iap-not-available', 'billing-unavailable', 'service-unavailable']) expect(mapFireOsError({ code })).toEqual({ kind: 'notSupported' })
    expect(mapFireOsError({ code: 'network-error', message: 'offline' })).toEqual({ kind: 'error', detail: 'network-error: offline' })
    expect(mapFireOsError({})).toMatchObject({ kind: 'error' })
  })

  it('isPlusReceipt accepts lingo.plus and lingo.plus.monthly as sku or termSku', () => {
    expect(isPlusReceipt({ sku: 'lingo.plus' })).toBe(true)
    expect(isPlusReceipt({ sku: 'lingo.plus.monthly' })).toBe(true)
    expect(isPlusReceipt({ sku: 'other', termSku: 'lingo.plus.monthly' })).toBe(true)
    expect(isPlusReceipt({ sku: 'other', termSku: 'lingo.plus' })).toBe(true)
    expect(isPlusReceipt({ sku: 'other', termSku: null })).toBe(false)
    expect(isPlusReceipt({ sku: 'lingo.plus.yearly' })).toBe(false)
  })
})
