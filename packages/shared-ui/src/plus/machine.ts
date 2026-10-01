import type { PlusStatus, VerifyResult } from '@lingo/contracts'
import type { PlusStore, PurchaseOutcome, StoreProduct } from './types'

/** The Plus screen as a pure state machine (docs/plans/LING-007.md). Any event not listed for a phase returns the same state object. */
export type PlusState =
  | { phase: 'loading' }
  | { phase: 'unavailable' }                       // mode off, or store.kind === 'none'
  | { phase: 'demo' }                              // mode demo
  | { phase: 'offer'; price: string | null; note: 'none' | 'retry' | 'restoreEmpty' }  // price null → "Price unavailable right now." and Subscribe hidden
  | { phase: 'busy'; step: 'purchasing' | 'verifying' | 'restoring'; price: string | null }
  | { phase: 'active'; renewsAt: string | null; cancelsAt: string | null }
export type PlusEvent =
  | { type: 'loaded'; status: PlusStatus; storeKind: PlusStore['kind']; product: StoreProduct | null }
  | { type: 'subscribe' } | { type: 'restore' }
  | { type: 'purchaseOutcome'; outcome: PurchaseOutcome }
  | { type: 'verified'; result: VerifyResult } | { type: 'verifyError' }
  | { type: 'restored'; results: VerifyResult[] }

export const initialPlus: PlusState = { phase: 'loading' }
const active: PlusState = { phase: 'active', renewsAt: null, cancelsAt: null }

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
      if (e.type === 'subscribe') return s.price === null ? s : { phase: 'busy', step: 'purchasing', price: s.price }
      if (e.type === 'restore') return { phase: 'busy', step: 'restoring', price: s.price }
      return s
    case 'active':
      return e.type === 'restore' ? { phase: 'busy', step: 'restoring', price: null } : s
    case 'busy': {
      const back = (note: 'none' | 'retry' | 'restoreEmpty'): PlusState => ({ phase: 'offer', price: s.price, note })
      if (s.step === 'purchasing' && e.type === 'purchaseOutcome') {
        switch (e.outcome.kind) {
          case 'purchased': return { phase: 'busy', step: 'verifying', price: s.price }
          case 'alreadyOwned': return { phase: 'busy', step: 'restoring', price: s.price }
          case 'userCancelled': return back('none')
          case 'notSupported': return { phase: 'unavailable' }
          case 'error': return back('retry')
        }
      }
      if (s.step === 'verifying' && e.type === 'verified') return e.result.plus ? active : back('retry')
      if (s.step === 'verifying' && e.type === 'verifyError') return back('retry')
      if (s.step === 'restoring' && e.type === 'restored') return e.results.some((r) => r.plus) ? active : back('restoreEmpty')
      return s
    }
    default:
      return s
  }
}
