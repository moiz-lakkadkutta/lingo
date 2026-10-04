import { Router } from 'express'
import { VerifyReceipt, type VerifyResult } from '@lingo/contracts'
import { db } from '../lib/db'
import { acceptsSku, entitled, isActive, plusStatus, purchaseFields } from '../lib/entitlement'
import { env } from '../lib/env'
import { AppError, ok, validate } from '../lib/http'
import { learner } from '../lib/learner'
import { logger } from '../lib/logger'
import type { RvsClient } from '../lib/rvs'

/**
 * Lingo Plus over Amazon IAP (LING-007, decision 0009). The learner is x-device-id only (lib/learner.ts): a session code never buys or reads Plus.
 * The client sends the receipt here and fulfils only when `fulfil` is true,
 * so an unverified receipt comes back on the next getPurchaseUpdates.
 * https://developer.amazon.com/docs/in-app-purchasing/iap-implement-iap.html · https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html
 * https://developer.amazon.com/docs/vega/0.22/rvs-cloud.html
 */

export function iapRouter(deps: { rvs: RvsClient; now: () => Date }): Router {
  const r = Router()

  r.post('/verify', validate(VerifyReceipt, (q) => q.body), async (req, res, next) => {
    try {
      const body = (req as never as { valid: VerifyReceipt }).valid
      // A receipt always belongs to a device: without x-device-id it would land on the shared 'anon' learner (review-007 L3).
      if (!req.header('x-device-id')?.trim()) throw new AppError(400, 'VALIDATION', 'x-device-id: required')
      const l = await learner(req)
      const now = deps.now()
      const answer = async (outcome: VerifyResult['outcome'], fulfil: boolean) => {
        const plus = await entitled(l.id, { now })
        if (plus !== l.plus) await db.learner.update({ where: { id: l.id }, data: { plus } })
        const out: VerifyResult = { plus, outcome, fulfil }
        return ok(res, out)
      }
      if (env.LINGO_PLUS_MODE !== 'iap') return await answer('unavailable', false)

      const v = await deps.rvs.verify(body.userId, body.receiptId)
      if (!v.ok) return await answer(v.reason === 'invalid_receipt' || v.reason === 'invalid_user' ? 'invalid' : 'unavailable', false)
      const receipt = v.receipt
      if (receipt.receiptId !== body.receiptId || !acceptsSku(receipt)) {
        logger.warn({ productId: receipt.productId, termSku: receipt.termSku ?? null }, 'iap: receipt is not for Lingo Plus')
        return await answer('invalid', false)
      }
      if (env.RVS_ENV === 'production' && receipt.testTransaction) {
        logger.warn({ productId: receipt.productId }, 'iap: test transaction rejected in production')
        return await answer('invalid', false)
      }
      // The newest learner to post a receipt takes it over: one Amazon account maps to one Lingo learner at a time.
      const fields = purchaseFields(receipt, now)
      await db.purchase.upsert({
        where: { receiptId: body.receiptId },
        create: { learnerId: l.id, store: body.store, receiptId: body.receiptId, amazonUserId: body.userId, ...fields },
        update: { learnerId: l.id, store: body.store, amazonUserId: body.userId, ...fields },
      })
      // A cancelled receipt is still fulfilled so Amazon stops re-delivering it; plus follows the rows.
      return await answer(isActive(receipt, now) ? 'active' : 'cancelled', true)
    } catch (e) { next(e) }
  })

  r.get('/status', async (req, res, next) => {
    try {
      const l = await learner(req)
      ok(res, await plusStatus(l.id, deps))
    } catch (e) { next(e) }
  })

  return r
}
