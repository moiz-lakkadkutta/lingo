import { PLUS_SKU, type VerifyReceipt, type VerifyResult } from '@lingo/contracts'
import { isPlusReceipt } from './amazon'
import type { PlusEvent } from './machine'
import type { PlusStore, StoreReceipt } from './types'

/** Root's api<T>(path, init): JSON envelope unwrapped, throws on a non-success answer. */
export type Api = <T>(path: string, init?: RequestInit) => Promise<T>

const UNAVAILABLE: VerifyResult = { plus: false, outcome: 'unavailable', fulfil: false }

/** Verify, then fulfil (decision 0009 §4): the store is told FULFILLED only after the server answers fulfil: true. */
async function verifyThenFulfil(store: PlusStore, api: Api, r: StoreReceipt): Promise<VerifyResult> {
  if (store.kind === 'none') return UNAVAILABLE
  const sku = isPlusReceipt({ sku: r.sku }) ? r.sku : r.termSku ?? r.sku
  const body = { store: store.kind, receiptId: r.receiptId, userId: r.userId, sku } as VerifyReceipt
  const result = await api<VerifyResult>('/iap/verify', { method: 'POST', body: JSON.stringify(body) })
  if (result.fulfil) {
    try { await store.fulfil(r.receiptId) } catch (e) {
      // Not fulfilled → Amazon re-delivers the receipt on the next restore; the server already has it, so nothing is lost.
      console.debug('[lingo] plus: fulfil did not complete', e)
    }
  }
  return result
}

/** store.purchase(PLUS_SKU) → if purchased: POST /iap/verify → if result.fulfil: store.fulfil(receiptId). Events in order. Never throws.
 *  alreadyOwned continues as restoreFlow, so the machine (now busy restoring) receives its restored event. */
export async function purchaseFlow(store: PlusStore, api: Api): Promise<PlusEvent[]> {
  let outcome
  try { outcome = await store.purchase(PLUS_SKU) } catch (e) { outcome = { kind: 'error' as const, detail: String(e) } }
  const events: PlusEvent[] = [{ type: 'purchaseOutcome', outcome }]
  if (outcome.kind === 'alreadyOwned') return [...events, ...(await restoreFlow(store, api))]
  if (outcome.kind !== 'purchased') return events
  try {
    events.push({ type: 'verified', result: await verifyThenFulfil(store, api, outcome.receipt) })
  } catch {
    events.push({ type: 'verifyError' })
  }
  return events
}

/** store.restore() → verify each receipt (sequentially) → fulfil where result.fulfil → [{ type: 'restored', results }]. Never throws;
 *  a verify error counts as { plus:false, outcome:'unavailable', fulfil:false }; a store that throws gives [{ type: 'restoreError' }]. */
export async function restoreFlow(store: PlusStore, api: Api): Promise<PlusEvent[]> {
  let receipts: StoreReceipt[]
  try { receipts = await store.restore() } catch (e) { console.debug('[lingo] plus: restore did not complete', e); return [{ type: 'restoreError' }] }
  const results: VerifyResult[] = []
  for (const r of receipts) {
    try { results.push(await verifyThenFulfil(store, api, r)) } catch { results.push(UNAVAILABLE) }
  }
  return [{ type: 'restored', results }]
}
