import { Router } from 'express'
import { DueWord, FREE_SAVES_PER_DAY, LearnerDto, LearnerSettingsPatch, ProgressStats, ReviewPost, ReviewResult, SaveWord, WordSavedPayload } from '@lingo/contracts'
import { Prisma, type SavedWord } from '@prisma/client'
import { db } from '../lib/db'
import { entitled, savesSince } from '../lib/entitlement'
import { notFound, ok, validate } from '../lib/http'
import { sm2 } from '../lib/sm2'
import { getIo } from '../lib/io'
import { logger } from '../lib/logger'
import { learner } from '../lib/learner'
import type { RvsClient } from '../lib/rvs'
import { DAY_MS, startOfNextUtcDay } from '../lib/day'
import { touchStreak } from '../lib/streak'
import { toDueWord } from '../lib/words'
import { computeStats } from '../lib/stats'
/** /me routes. deps.rvs lets GET /me re-verify stale purchases (lib/entitlement.ts refreshStale), so Plus ends without the Plus screen. */
export function meRouter(deps: { rvs: RvsClient; now?: () => Date }): Router {
  const me = Router()
  const clock = deps.now ?? (() => new Date())

  /** The phone's read and review routes accept x-session-code (lib/learner.ts allowCode); every other route uses x-device-id only. */
  const PHONE = { allowCode: true } as const
  /** LearnerDto only: deviceId, id and internal columns never leave the server (a code holder must not learn the TV's device id). */
  const learnerOut = async (l: Parameters<typeof LearnerDto.parse>[0] & { id: string }, refresh = false) =>
    LearnerDto.parse({ ...l, plus: await entitled(l.id, { now: clock(), ...(refresh ? { rvs: deps.rvs } : {}) }) })

  me.get('/', async (req, res, next) => { try { ok(res, await learnerOut(await learner(req, PHONE), true)) } catch (e) { next(e) } })
  /** Settings only (LearnerSettingsPatch): plus, level, streak and knownRank are never client-writable here. x-device-id only: a session code never changes the TV's settings. */
  me.put('/', validate(LearnerSettingsPatch, (r) => r.body), async (req, res, next) => { try { const l = await learner(req); const u = await db.learner.update({ where: { id: l.id }, data: (req as never as { valid: object }).valid }); ok(res, await learnerOut(u)) } catch (e) { next(e) } })

  /** Save a word from the Explain card. Free tier: 20 per UTC day (savesSince). Emits word:saved to the phone room. */
  me.post('/words', validate(SaveWord, (r) => r.body), async (req, res, next) => {
    try {
      const l = await learner(req)
      const { highlightId, sessionCode } = (req as never as { valid: { highlightId: string; sessionCode?: string } }).valid
      if (!(await entitled(l.id, { now: clock() }))) {
        if ((await savesSince(l.id, new Date())) >= FREE_SAVES_PER_DAY) return ok(res, { limit: true, saved: null })
      }
      const saved = await db.savedWord.upsert({ where: { learnerId_highlightId: { learnerId: l.id, highlightId } }, create: { learnerId: l.id, highlightId }, update: {}, include: { highlight: { include: { cue: { include: { clip: true } } } } } })
      if (sessionCode) {
        // The only place word:saved originates: the save is real once the row exists and the limit is checked (docs/decisions/0005-realtime-session.md).
        // The row is already written, so the emit must never decide the HTTP result: a bad payload is logged, not thrown.
        const h = saved.highlight
        const payload = WordSavedPayload.safeParse({ code: sessionCode, savedWordId: saved.id, highlightId: h.id, word: h.word, lemma: h.lemma, gloss: h.gloss, example: h.example, level: h.level, clipSlug: h.cue.clip.slug, clipTitle: h.cue.clip.title, savedAt: saved.createdAt.toISOString() })
        if (payload.success) getIo()?.to(sessionCode).emit('word:saved', payload.data)
        else logger.error({ issues: payload.error.issues, savedWordId: saved.id }, 'word:saved payload invalid; saved but not emitted')
      }
      await touchStreak(l, new Date())
      ok(res, { limit: false, saved }, 201)
    } catch (e) { next(e) }
  })
  /** Saved words with their cue and clip, earliest due first. due=today → due before the next UTC midnight (the phone's review deck). */
  me.get('/words', async (req, res, next) => {
    try {
      const l = await learner(req, PHONE); const now = new Date()
      const rows = await db.savedWord.findMany({
        where: { learnerId: l.id, ...(req.query.due === 'today' ? { due: { lt: startOfNextUtcDay(now) } } : {}) },
        include: { highlight: { include: { cue: { include: { clip: { select: { slug: true, title: true } } } } } } },
        orderBy: [{ due: 'asc' }, { createdAt: 'asc' }],
      })
      ok(res, DueWord.array().parse(rows.map((r) => toDueWord(r, l.native))))
    } catch (e) { next(e) }
  })
  const reviewOut = (w: SavedWord) => ReviewResult.parse({ savedWordId: w.id, ease: w.ease, intervalD: w.intervalD, reps: w.reps, lapses: w.lapses, due: w.due.toISOString() })
  const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  /**
   * Grade → SM-2 update server-side (single source of truth for TV and phone). Another learner's word is a 404 and nothing is written.
   * Idempotent: a reviewId already recorded for this word returns the current schedule unchanged; the update is also conditional on
   * the schedule it was computed from, so two racing posts apply SM-2 once and the loser gets the current schedule (200).
   */
  me.post('/reviews', validate(ReviewPost, (r) => r.body), async (req, res, next) => {
    try {
      const l = await learner(req, PHONE)
      const { savedWordId, grade, reviewId } = (req as never as { valid: ReviewPost }).valid
      const w = await db.savedWord.findFirst({ where: { id: savedWordId, learnerId: l.id } })
      if (!w) throw notFound('Saved word')
      if (reviewId && (await db.review.findUnique({ where: { savedWordId_reviewId: { savedWordId, reviewId } } }))) return ok(res, reviewOut(w))
      const now = new Date()
      const n = sm2({ ease: w.ease, intervalD: w.intervalD, reps: w.reps, lapses: w.lapses }, grade)
      const due = new Date(now.getTime() + n.intervalD * DAY_MS)
      let applied = false
      try {
        applied = await db.$transaction(async (tx) => {
          const u = await tx.savedWord.updateMany({ where: { id: savedWordId, ease: w.ease, intervalD: w.intervalD, reps: w.reps, lapses: w.lapses }, data: { ...n, due } })
          if (u.count === 0) return false
          await tx.review.create({ data: { savedWordId, grade, reviewId: reviewId ?? null } })
          return true
        })
      } catch (e) { if (!isUniqueViolation(e)) throw e }
      if (!applied) return ok(res, reviewOut(await db.savedWord.findUniqueOrThrow({ where: { id: savedWordId } })))
      await touchStreak(l, now)
      ok(res, ReviewResult.parse({ savedWordId, ...n, due: due.toISOString() }))
    } catch (e) { next(e) }
  })
  /** Progress screen: words known per approximate band, clips watched, streak (missed day → welcomeBack), what is due now and tomorrow. */
  me.get('/stats', async (req, res, next) => {
    try {
      const l = await learner(req, PHONE)
      const words = await db.savedWord.findMany({ where: { learnerId: l.id }, select: { intervalD: true, reps: true, lapses: true, due: true, highlight: { select: { level: true } } } })
      const clipsWatched = await db.progress.count({ where: { learnerId: l.id, completed: true } })
      ok(res, ProgressStats.parse(computeStats({ level: l.level, words: words.map((w) => ({ ...w, level: w.highlight.level })), clipsWatched, streak: { streak: l.streak, lastStudyDay: l.lastStudyDay }, now: new Date() })))
    } catch (e) { next(e) }
  })
  return me
}
