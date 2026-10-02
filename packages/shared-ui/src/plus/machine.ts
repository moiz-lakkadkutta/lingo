import type { PlusStatus, VerifyResult } from '@lingo/contracts'
import type { PlusStore, PurchaseOutcome, StoreProduct } from './types'

/** The Plus screen as a pure state machine (docs/plans/LING-007.md). Any event not listed for a phase returns the same state object. */
export type PlusState =
  | { phase: 'loading' }
  | { phase: 'unavailable' }                       // mode off, or store.kind === 'none'
  | { phase: 'demo' }                              // mode demo
  // price null → "Price unavailable right now." and Subscribe hidden. Notes: retry = the store said no before any receipt existed;
  // pending = the store reported a purchase but verification didn't complete (never "nothing was charged"; Subscribe hidden);
  // restoreEmpty = the server answered and found no Plus; restoreError = the store or the server couldn't be asked.
  | { phase: 'offer'; price: string | null; note: OfferNote }
  // resume: a restore started from active goes back to it unless the server says there is no Plus.
  | { phase: 'busy'; step: 'purchasing' | 'verifying' | 'restoring'; price: string | null; resume?: ActiveState }
  | ActiveState
export type OfferNote = 'none' | 'retry' | 'pending' | 'restoreEmpty' | 'restoreError'
export interface ActiveState { phase: 'active'; renewsAt: string | null; cancelsAt: string | null }
export type PlusEvent =
  | { type: 'loaded'; status: PlusStatus; storeKind: PlusStore['kind']; product: StoreProduct | null }
  | { type: 'subscribe' } | { type: 'restore' }
  | { type: 'purchaseOutcome'; outcome: PurchaseOutcome }
  | { type: 'verified'; result: VerifyResult } | { type: 'verifyError' }
  | { type: 'restored'; results: VerifyResult[] }
  | { type: 'restoreError' }                       // store.restore() threw or answered a non-successful code

export const initialPlus: PlusState = { phase: 'loading' }
const active: ActiveState = { phase: 'active', renewsAt: null, cancelsAt: null }

export function reducePlus(s: PlusState, e: PlusEvent): PlusState {
  switch (s.phase) {
    case 'loading': {
      if (e.type !== 'loaded') return s
      // demo is everyone's Plus, store or not; off or no store → nothing to buy.
      if (e.status.mode === 'demo') return { phase: 'demo' }
      if (e.status.mode === 'off' || e.storeKind === 'none') return { phase: 'unavailable' }
      if (e.status.plus) return { phase: 'active', renewsAt: e.status.renewsAt, cancelsAt: e.status.cancelsAt }
      return { phase: 'offer', price: e.product?.price ?? null, note: 'none' }
    }
    case 'offer':
      // After a purchase that is still being confirmed, Subscribe is gone: a second purchase is never invited.
      if (e.type === 'subscribe') return s.price === null || s.note === 'pending' ? s : { phase: 'busy', step: 'purchasing', price: s.price }
      if (e.type === 'restore') return { phase: 'busy', step: 'restoring', price: s.price }
      return s
    case 'active':
      return e.type === 'restore' ? { phase: 'busy', step: 'restoring', price: null, resume: s } : s
    case 'busy': {
      const back = (note: OfferNote): PlusState => ({ phase: 'offer', price: s.price, note })
      if (s.step === 'purchasing' && e.type === 'purchaseOutcome') {
        switch (e.outcome.kind) {
          case 'purchased': return { phase: 'busy', step: 'verifying', price: s.price }
          case 'alreadyOwned': return { phase: 'busy', step: 'restoring', price: s.price }
          case 'userCancelled': return back('none')
          case 'notSupported': return { phase: 'unavailable' }
          case 'error': return back('retry')
        }
      }
      // The store already took the purchase: a verify that didn't confirm Plus is pending, never "nothing was charged".
      if (s.step === 'verifying' && e.type === 'verified') return e.result.plus ? active : back('pending')
      if (s.step === 'verifying' && e.type === 'verifyError') return back('pending')
      if (s.step === 'restoring' && e.type === 'restoreError') return s.resume ?? back('restoreError')
      if (s.step === 'restoring' && e.type === 'restored') {
        if (e.results.some((r) => r.plus)) return s.resume ?? active
        // A receipt the server couldn't check is not "no purchase found".
        if (e.results.some((r) => r.outcome === 'unavailable')) return s.resume ?? back('restoreError')
        // The server answered for every receipt (or the store had none): from active, no receipts keeps the server's Plus.
        if (s.resume && e.results.length === 0) return s.resume
        return back('restoreEmpty')
      }
      return s
    }
    default:
      return s
  }
}
