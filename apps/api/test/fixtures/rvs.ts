/**
 * RVS JSON bodies as the Cloud Sandbox returns them for a subscription (dates are epoch ms). Field names from
 * https://developer.amazon.com/docs/in-app-purchasing/iap-rvs-for-android-apps.html (search excerpt; the page itself was not reachable here).
 * Functions, not constants: receiptId is unique in the DB, so every test makes its own.
 */
const DAY = 24 * 60 * 60 * 1000
export const rvsActive = (receiptId: string, now = Date.now()) => ({
  autoRenewing: true, betaProduct: false, cancelDate: null, cancelReason: null, deferredDate: null, deferredSku: null, freeTrialEndDate: null,
  gracePeriodEndDate: null, parentProductId: null, productId: 'lingo.plus', productType: 'SUBSCRIPTION', purchaseDate: now - 10 * DAY,
  quantity: null, receiptId, renewalDate: now + 20 * DAY, term: '1 Month', termSku: 'lingo.plus.monthly', testTransaction: true,
})
export const rvsCancelled = (receiptId: string, now = Date.now()) => ({ ...rvsActive(receiptId, now), autoRenewing: false, cancelDate: now - DAY, cancelReason: 0 })
export const rvsOtherSku = (receiptId: string, now = Date.now()) => ({ ...rvsActive(receiptId, now), productId: 'other.plus', termSku: 'other.plus.monthly' })
