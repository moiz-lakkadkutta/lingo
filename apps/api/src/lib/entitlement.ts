import { FREE_SAVES_PER_DAY, PLUS_PARENT_SKU, PLUS_SKU, type PlusMode, type PlusStatus } from '@lingo/contracts'
import type { Prisma } from '@prisma/client'
import { db } from './db'
import { startOfUtcDay } from './day'
import { env } from './env'
import { logger } from './logger'
import type { RvsClient, RvsReceipt } from './rvs'

/**
 * Lingo Plus is one entitlement, computed on the server (decision 0009): demo → everyone; off → nobody;
 * iap → the learner has an active Purchase. Learner.plus is only a cache of the last answer.
 * A row is active while its cancelDate is null or still ahead AND (renewalDate is null or renewalDate + RENEWAL_GRACE_MS is ahead):
 * a subscription that RVS never confirms again lapses one billing period (plus grace) after the last answer, even if no client asks.
 * Every active row verified more than REVERIFY_MS ago is re-verified with RVS (refreshStale) on GET /me and GET /iap/status, at most
 * once per RETRY_MS per purchase, so a cancellation reaches the server without the Plus screen and RVS never gates every request.
 */
export const REVERIFY_MS = 24 * 60 * 60 * 1000
export const RETRY_MS = 60 * 60 * 1000
export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000
const MAX_REVERIFY_PER_CALL = 5

const ms = (d: number | Date) => (d instanceof Date ? d.getTime() : d)
export function isActive(r: { cancelDate: number | Date | null; renewalDate?: number | Date | null }, now: Date): boolean {
  if (r.cancelDate !== null && ms(r.cancelDate) <= now.getTime()) return false
  if (r.renewalDate != null && ms(r.renewalDate) + RENEWAL_GRACE_MS <= now.getTime()) return false
  return true
}
/** isActive as a Prisma filter. */
const activeWhere = (now: Date): Prisma.PurchaseWhereInput => ({
  AND: [
    { OR: [{ cancelDate: null }, { cancelDate: { gt: now } }] },
    { OR: [{ renewalDate: null }, { renewalDate: { gt: new Date(now.getTime() - RENEWAL_GRACE_MS) } }] },
  ],
})

const PLUS_SKUS: ReadonlySet<string> = new Set([PLUS_PARENT_SKU, PLUS_SKU])
export function acceptsSku(r: Pick<RvsReceipt, 'productId' | 'termSku'>): boolean {
  return r.termSku === PLUS_SKU || PLUS_SKUS.has(r.productId)
}

/** purchaseId → last re-verify attempt (ms). In-memory: one API process; a restart simply allows one early retry. */
const attempts = new Map<string, number>()

/**
 * Re-verifies, in parallel, up to MAX_REVERIFY_PER_CALL of the learner's not-cancelled rows that were verified more than REVERIFY_MS
 * ago and not tried in the last RETRY_MS. An RVS answer for the same receipt updates the row; anything else keeps the stored row
 * (it still lapses at renewalDate + grace). Never throws. Returns how many rows RVS was asked about.
 */
export async function refreshStale(learnerId: string, deps: { rvs: RvsClient; now: Date }): Promise<number> {
  const now = deps.now
  const rows = await db.purchase.findMany({
    where: { learnerId, verifiedAt: { lt: new Date(now.getTime() - REVERIFY_MS) }, OR: [{ cancelDate: null }, { cancelDate: { gt: now } }] },
    orderBy: { verifiedAt: 'asc' },
  })
  const due = rows.filter((r) => now.getTime() - (attempts.get(r.id) ?? -Infinity) >= RETRY_MS).slice(0, MAX_REVERIFY_PER_CALL)
  for (const r of due) attempts.set(r.id, now.getTime())
  if (attempts.size > 10_000) for (const [id, t] of attempts) if (now.getTime() - t >= RETRY_MS) attempts.delete(id)
  await Promise.all(due.map(async (row) => {
    try {
      const v = await deps.rvs.verify(row.amazonUserId, row.receiptId)
      if (v.ok && v.receipt.receiptId === row.receiptId) {
        await db.purchase.update({ where: { id: row.id }, data: purchaseFields(v.receipt, now) })
      } else if (v.ok) {
        logger.warn({ purchaseId: row.id }, 'iap: re-verify answered for another receipt; keeping the stored purchase')
      } else {
        logger.warn({ reason: v.reason, purchaseId: row.id }, 'iap: re-verify did not complete; keeping the stored purchase')
      }
    } catch (e) {
      logger.warn({ err: (e as Error).name, purchaseId: row.id }, 'iap: re-verify did not complete; keeping the stored purchase')
    }
  }))
  return due.length
}

/**
 * Reads env.LINGO_PLUS_MODE at call time unless `mode` is given. With `rvs` (GET /me, GET /iap/status) stale rows are re-verified
 * first (refreshStale); without it (the save gate, /iap/verify) only the stored rows count, so those never wait on RVS.
 */
export async function entitled(learnerId: string, opts: { mode?: PlusMode; now?: Date; rvs?: RvsClient } = {}): Promise<boolean> {
  const mode = opts.mode ?? env.LINGO_PLUS_MODE
  if (mode === 'demo') return true
  if (mode === 'off') return false
  const now = opts.now ?? new Date()
  if (opts.rvs) await refreshStale(learnerId, { rvs: opts.rvs, now })
  const n = await db.purchase.count({ where: { learnerId, ...activeWhere(now) } })
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

/** The free tier's day (POST /me/words, GET /iap/status): saves since 00:00 UTC, the same UTC day as streaks and stats (lib/day.ts). */
export function savesSince(learnerId: string, now: Date): Promise<number> {
  return db.savedWord.count({ where: { learnerId, createdAt: { gte: startOfUtcDay(now) } } })
}

/** Builds PlusStatus; in iap mode stale rows are re-verified first (refreshStale; a failure keeps the stored row). */
export async function plusStatus(learnerId: string, deps: { rvs: RvsClient; now: () => Date; mode?: PlusMode }): Promise<PlusStatus> {
  const mode = deps.mode ?? env.LINGO_PLUS_MODE
  const now = deps.now()
  const plus = await entitled(learnerId, { mode, now, ...(mode === 'iap' ? { rvs: deps.rvs } : {}) })
  await db.learner.update({ where: { id: learnerId }, data: { plus } })
  const newest = await db.purchase.findFirst({ where: { learnerId }, orderBy: { purchaseDate: 'desc' } })
  const cancelsAt = newest?.cancelDate ?? null
  const renewsAt = newest && !cancelsAt ? newest.renewalDate : null
  return {
    mode, plus, sku: PLUS_SKU,
    renewsAt: renewsAt ? renewsAt.toISOString() : null, cancelsAt: cancelsAt ? cancelsAt.toISOString() : null,
    freeSavesPerDay: FREE_SAVES_PER_DAY, savesToday: await savesSince(learnerId, now),
  }
}
