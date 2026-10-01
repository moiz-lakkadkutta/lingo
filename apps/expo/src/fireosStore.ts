import * as Iap from 'react-native-iap'
import { isPlusReceipt, mapFireOsError, mapFireOsPurchase, type FireOsPurchaseLike, type PlusStore, type PurchaseOutcome, type StoreProduct, type StoreReceipt } from '@lingo/shared-ui'

/**
 * Lingo Plus on Fire OS: react-native-iap 16.7.x (OpenIAP) built against the Amazon Appstore SDK (openiapStore=amazon, set by
 * plugins/withAmazonIap.js). All response shaping goes through the tested mappers in @lingo/shared-ui.
 * On the Amazon flavour purchaseToken is the Appstore receiptId and userIdAmazon the RVS user id; finishTransaction is
 * notifyFulfillment(FULFILLED). https://developer.amazon.com/docs/in-app-purchasing/iap-implement-iap.html ·
 * https://developer.amazon.com/docs/appstore-sdk/integrate-appstore-sdk.html · https://openiap.dev/docs/apis/finish-transaction
 */
const PURCHASE_TIMEOUT_MS = 60_000

export function createFireOsStore(): PlusStore {
  let connecting: Promise<void> | null = null
  let subs: Iap.EventSubscription[] = []
  let settle: ((o: PurchaseOutcome) => void) | null = null
  /** The last Purchase object per receiptId: finishTransaction needs the object, not the id. */
  const kept = new Map<string, Iap.Purchase>()
  const keep = (p: Iap.Purchase): StoreReceipt | null => {
    const r = mapFireOsPurchase(p as unknown as FireOsPurchaseLike)
    if (r) kept.set(r.receiptId, p)
    return r
  }
  const answer = (o: PurchaseOutcome) => settle?.(o)
  const onPurchase = (p: Iap.Purchase) => {
    const r = keep(p)
    // A purchase delivered with no purchase() waiting (e.g. on start) is picked up by Root's startup restore.
    if (!settle) return
    settle(r && isPlusReceipt(r) ? { kind: 'purchased', receipt: r } : { kind: 'error', detail: 'purchase without an Amazon receipt or user id' })
  }

  const store: PlusStore = {
    kind: 'amazon-fireos',
    init() {
      connecting ??= (async () => {
        await Iap.initConnection()
        subs = [
          Iap.purchaseUpdatedListener(onPurchase),
          Iap.purchaseErrorListener((e) => answer(mapFireOsError({ code: e.code, message: e.message }))),
        ]
      })().catch((e: unknown) => { connecting = null; throw e })
      return connecting
    },
    async product(sku) {
      await store.init()
      const list = (await Iap.fetchProducts({ skus: [sku], type: 'subs' })) ?? []
      const p = (list as Array<{ id: string; displayPrice: string; title: string }>).find((x) => x.id === sku) ?? list[0] as { id: string; displayPrice: string; title: string } | undefined
      return p ? ({ sku: p.id, price: p.displayPrice, title: p.title } satisfies StoreProduct) : null
    },
    async purchase(sku) {
      try { await store.init() } catch (e) { return mapFireOsError(e as { code?: string; message?: string }) }
      if (settle) return { kind: 'error', detail: 'a purchase is already open' }
      const outcome = new Promise<PurchaseOutcome>((resolve) => {
        const timer = setTimeout(() => done({ kind: 'error', detail: 'no answer from the Appstore within 60 s' }), PURCHASE_TIMEOUT_MS)
        const done = (o: PurchaseOutcome) => { clearTimeout(timer); settle = null; resolve(o) }
        settle = done
      })
      try {
        const res = await Iap.requestPurchase({ request: { google: { skus: [sku] } }, type: 'subs' })
        // Some builds return the purchase here as well as through the listener; whichever comes first settles.
        for (const p of Array.isArray(res) ? res : res ? [res] : []) onPurchase(p)
      } catch (e) {
        answer(mapFireOsError(e as { code?: string; message?: string }))
      }
      return outcome
    },
    async restore() {
      await store.init()
      const all = await Iap.getAvailablePurchases()
      return all.map(keep).filter((r): r is StoreReceipt => r !== null && isPlusReceipt(r))
    },
    async fulfil(receiptId) {
      await store.init()
      if (!kept.has(receiptId)) (await Iap.getAvailablePurchases()).forEach(keep)
      const purchase = kept.get(receiptId)
      if (!purchase) return // nothing to fulfil; Amazon re-delivers on the next restore
      await Iap.finishTransaction({ purchase, isConsumable: false })
      kept.delete(receiptId)
    },
    dispose() {
      subs.forEach((s) => s.remove())
      subs = []
      settle = null
      if (connecting) void Iap.endConnection().catch(() => {})
      connecting = null
    },
  }
  return store
}
