import { z } from 'zod'
/**
 * Lingo Plus (LING-007, decision 0009). Amazon subscriptions are a non-buyable parent SKU plus buyable term SKUs; the receipt
 * carries both (sku = parent, termSku = term): https://developer.amazon.com/docs/in-app-purchasing/iap-create-and-submit-iap-items.html
 */
export const PLUS_PARENT_SKU = 'lingo.plus' as const
export const PLUS_SKU = 'lingo.plus.monthly' as const
export const FREE_SAVES_PER_DAY = 20
export const PlusMode = z.enum(['iap', 'demo', 'off'])
export const IapStore = z.enum(['amazon-fireos', 'amazon-vega'])
/** POST /iap/verify body. receiptId/userId are opaque Amazon strings; length-capped because they become URL path segments. */
export const VerifyReceipt = z.object({
  store: IapStore,
  receiptId: z.string().min(1).max(512),
  userId: z.string().min(1).max(256),
  sku: z.enum([PLUS_PARENT_SKU, PLUS_SKU]),
})
export const VerifyResult = z.object({
  plus: z.boolean(),
  /** 'active' | 'cancelled' (valid receipt, cancelDate passed) | 'invalid' (RVS 400/497 or wrong SKU) | 'unavailable' (RVS 5xx/network/496, or mode !== 'iap') */
  outcome: z.enum(['active', 'cancelled', 'invalid', 'unavailable']),
  /** true → the client must notifyFulfillment(FULFILLED); false → do not fulfil (retry later) */
  fulfil: z.boolean(),
})
export const PlusStatus = z.object({
  mode: PlusMode, plus: z.boolean(), sku: z.literal(PLUS_SKU),
  /** null unless an RVS row exists */
  renewsAt: z.string().datetime().nullable(), cancelsAt: z.string().datetime().nullable(),
  freeSavesPerDay: z.number().int(), savesToday: z.number().int().min(0),
})
export type PlusMode = z.infer<typeof PlusMode>; export type IapStore = z.infer<typeof IapStore>
export type VerifyReceipt = z.infer<typeof VerifyReceipt>; export type VerifyResult = z.infer<typeof VerifyResult>; export type PlusStatus = z.infer<typeof PlusStatus>
