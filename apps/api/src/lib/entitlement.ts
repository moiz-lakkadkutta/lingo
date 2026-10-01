import { FREE_SAVES_PER_DAY, PLUS_PARENT_SKU, PLUS_SKU, type PlusMode, type PlusStatus } from '@lingo/contracts'
import type { Prisma } from '@prisma/client'
import { db } from './db'
import { env } from './env'
import { logger } from './logger'
import type { RvsClient, RvsReceipt } from './rvs'

/**
 * Lingo Plus is one entitlement, computed on the server (decision 0009): demo → everyone; off → nobody;
 * iap → the learner has a Purchase whose cancelDate is null or still ahead. Learner.plus is only a cache of the last answer.
 */
const REVERIFY_MS = 24 * 60 * 60 * 1000

export function isActive(r: { cancelDate: number | Date | null }, now: Date): boolean {
  if (r.cancelDate === null) return true
  const t = r.cancelDate instanceof Date ? r.cancelDate.getTime() : r.cancelDate
  return t > now.getTime()
}

const PLUS_SKUS: ReadonlySet<string> = new Set([PLUS_PARENT_SKU, PLUS_SKU])
export function acceptsSku(r: Pick<RvsReceipt, 'productId' | 'termSku'>): boolean {
  return r.termSku === PLUS_SKU || PLUS_SKUS.has(r.productId)
}

/** Reads env.LINGO_PLUS_MODE at call time unless `mode` is given. */
export async function entitled(learnerId: string, opts: { mode?: PlusMode; now?: Date } = {}): Promise<boolean> {
  const mode = opts.mode ?? env.LINGO_PLUS_MODE
  if (mode === 'demo') return true
  if (mode === 'off') return false
  const now = opts.now ?? new Date()
  const n = await db.purchase.count({ where: { learnerId, OR: [{ cancelDate: null }, { cancelDate: { gt: now } }] } })
  return n > 0
}

/** The Purchase columns that follow an RVS answer (create and update share them). */
export function purchaseFields(receipt: RvsReceipt, now: Date) {
  return {
    productId: receipt.productId,
    termSku: receipt.termSku ?? null,
    purchaseDate: new Date(receipt.purchaseDate),
    cancelDate: receipt.cancelDate === null ? null : new Date(receipt.cancelDate),
    renewalDate: receipt.renewalDate == null ? null : new Date(receipt.renewalDate),
    testTransaction: receipt.testTransaction,
    verifiedAt: now,
    raw: receipt as unknown as Prisma.InputJsonValue,
  }
}

/** Same rule as POST /me/words: saves since local midnight. */
export function savesSince(learnerId: string, now: Date): Promise<number> {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0)
  return db.savedWord.count({ where: { learnerId, createdAt: { gte: midnight } } })
}

/** Builds PlusStatus; in iap mode a newest Purchase verified more than 24 h ago is re-verified first (a failure keeps the stored row). */
export async function plusStatus(learnerId: string, deps: { rvs: RvsClient; now: () => Date; mode?: PlusMode }): Promise<PlusStatus> {
  const mode = deps.mode ?? env.LINGO_PLUS_MODE
  const now = deps.now()
  let newest = await db.purchase.findFirst({ where: { learnerId }, orderBy: { purchaseDate: 'desc' } })
  if (mode === 'iap' && newest && now.getTime() - newest.verifiedAt.getTime() > REVERIFY_MS) {
    const r = await deps.rvs.verify(newest.amazonUserId, newest.receiptId)
    if (r.ok && r.receipt.receiptId === newest.receiptId) {
      newest = await db.purchase.update({ where: { id: newest.id }, data: purchaseFields(r.receipt, now) })
    } else if (!r.ok) {
      logger.warn({ reason: r.reason, purchaseId: newest.id }, 'iap: re-verify did not complete; keeping the stored purchase')
    }
  }
  const plus = await entitled(learnerId, { mode, now })
  await db.learner.update({ where: { id: learnerId }, data: { plus } })
  const cancelsAt = newest?.cancelDate ?? null
  const renewsAt = newest && !cancelsAt ? newest.renewalDate : null
  return {
    mode, plus, sku: PLUS_SKU,
    renewsAt: renewsAt ? renewsAt.toISOString() : null, cancelsAt: cancelsAt ? cancelsAt.toISOString() : null,
    freeSavesPerDay: FREE_SAVES_PER_DAY, savesToday: await savesSince(learnerId, now),
  }
}
