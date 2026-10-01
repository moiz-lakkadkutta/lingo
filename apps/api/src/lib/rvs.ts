import { z } from 'zod'
import { env } from './env'
import { logger } from './logger'
/**
 * Amazon Appstore Receipt Verification Service (RVS).
 * Cloud Sandbox: https://appstore-sdk.amazon.com/sandbox/version/1.0/verifyReceiptId/developer/{secret}/user/{userId}/receiptId/{receiptId}
 * Production:    https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId/developer/{secret}/user/{userId}/receiptId/{receiptId}
 * The sandbox secret may be any non-empty string. Vega uses the same RVS.
 * Docs: https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html ·
 * https://developer.amazon.com/docs/in-app-purchasing/iap-rvs-for-android-apps.html · https://developer.amazon.com/docs/vega/0.24/vega-rvs-overview
 */
export interface RvsReceipt {
  receiptId: string; productId: string; parentProductId?: string | null; termSku?: string | null; productType: string
  purchaseDate: number; cancelDate: number | null; renewalDate?: number | null; testTransaction: boolean; autoRenewing?: boolean
}
export type RvsResult =
  | { ok: true; receipt: RvsReceipt }
  | { ok: false; status: number; reason: 'invalid_receipt' | 'invalid_secret' | 'invalid_user' | 'rvs_error' | 'network' | 'bad_body' }
export interface RvsClient { verify(userId: string, receiptId: string): Promise<RvsResult> }

export function rvsBase(e: { RVS_ENV: 'sandbox' | 'production'; RVS_BASE?: string }): string {
  return e.RVS_BASE ?? (e.RVS_ENV === 'production' ? 'https://appstore-sdk.amazon.com' : 'https://appstore-sdk.amazon.com/sandbox')
}

const epoch = z.number().int().nonnegative()
/** passthrough: extra RVS fields (term, quantity, cancelReason…) stay on the object and land in Purchase.raw. */
const Body = z.object({
  receiptId: z.string().min(1), productId: z.string().min(1), purchaseDate: epoch,
  parentProductId: z.string().nullish(), termSku: z.string().nullish(), productType: z.string().default('UNKNOWN'),
  cancelDate: epoch.nullish().transform((v) => v ?? null), renewalDate: epoch.nullish(),
  testTransaction: z.boolean().default(false), autoRenewing: z.boolean().nullish().transform((v) => v ?? undefined),
}).passthrough()

/** Zod-parses the RVS JSON. Missing productId/receiptId/purchaseDate → null. */
export function parseRvs(body: unknown): RvsReceipt | null {
  const r = Body.safeParse(body)
  return r.success ? (r.data as RvsReceipt) : null
}

const reasonFor = (status: number): Exclude<RvsResult, { ok: true }>['reason'] =>
  status === 400 ? 'invalid_receipt' : status === 496 ? 'invalid_secret' : status === 497 ? 'invalid_user' : 'rvs_error'

/**
 * 200 → parseRvs(body); 400 → invalid_receipt; 496 → invalid_secret; 497 → invalid_user; 5xx/other → rvs_error;
 * fetch throws/timeout (5 s AbortController) → network. Segments are encodeURIComponent'd. Never throws, never logs the URL or secret.
 */
export function createRvsClient(opts: { base?: string; secret?: string; fetch?: typeof fetch; timeoutMs?: number } = {}): RvsClient {
  const base = (opts.base ?? rvsBase(env)).replace(/\/+$/, '')
  const secret = opts.secret ?? env.RVS_SHARED_SECRET
  const doFetch = opts.fetch ?? fetch
  const timeoutMs = opts.timeoutMs ?? 5000
  const enc = encodeURIComponent
  return {
    async verify(userId, receiptId) {
      const url = `${base}/version/1.0/verifyReceiptId/developer/${enc(secret)}/user/${enc(userId)}/receiptId/${enc(receiptId)}`
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        let res: Response
        try {
          res = await doFetch(url, { signal: ac.signal, headers: { accept: 'application/json' } })
        } catch (e) {
          // The error message can carry the URL (and so the secret): log only its name.
          logger.warn({ reason: 'network', error: e instanceof Error ? e.name : typeof e }, 'rvs: request did not complete')
          return { ok: false, status: 0, reason: 'network' }
        }
        if (res.status !== 200) {
          const reason = reasonFor(res.status)
          logger.warn({ status: res.status, reason }, 'rvs: receipt not verified')
          return { ok: false, status: res.status, reason }
        }
        let body: unknown
        try { body = await res.json() } catch { body = null }
        const receipt = parseRvs(body)
        if (!receipt) {
          logger.warn({ status: 200, reason: 'bad_body' }, 'rvs: unexpected body')
          return { ok: false, status: 200, reason: 'bad_body' }
        }
        return { ok: true, receipt }
      } catch (e) {
        logger.warn({ reason: 'network', error: e instanceof Error ? e.name : typeof e }, 'rvs: response not read')
        return { ok: false, status: 0, reason: 'network' }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
