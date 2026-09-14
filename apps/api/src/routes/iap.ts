import { Router } from 'express'
import { z } from 'zod'
import { db } from '../lib/db'
import { ok, validate } from '../lib/http'
export const iap: Router = Router()
const Receipt = z.object({ receiptId: z.string(), userId: z.string(), sku: z.literal('lingo.plus.monthly') })
/**
 * Amazon Appstore Receipt Verification Service (RVS). Sandbox: http://localhost:8080/RVSSandbox/version/1.0/verifyReceiptId/developer/{secret}/user/{userId}/receiptId/{receiptId}
 * Production: https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId/developer/{secret}/user/{userId}/receiptId/{receiptId}
 * Vega uses the same RVS. Verify server-side, then flip learner.plus.
 */
iap.post('/verify', validate(Receipt, (r) => r.body), async (req, res, next) => {
  try {
    const { receiptId, userId } = (req as never as { valid: z.infer<typeof Receipt> }).valid
    const base = process.env.RVS_BASE ?? 'http://localhost:8080/RVSSandbox'
    const r = await fetch(`${base}/version/1.0/verifyReceiptId/developer/${process.env.RVS_SECRET ?? 'sandbox'}/user/${userId}/receiptId/${receiptId}`)
    if (!r.ok) return ok(res, { plus: false, reason: `rvs ${r.status}` })
    const l = await db.learner.upsert({ where: { deviceId: String(req.header('x-device-id') ?? 'anon') }, create: { deviceId: String(req.header('x-device-id') ?? 'anon'), plus: true }, update: { plus: true } })
    ok(res, { plus: l.plus })
  } catch (e) { next(e) }
})
