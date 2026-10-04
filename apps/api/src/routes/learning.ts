import { Router } from 'express'
import { LevelPut, ProgressPut, type Level } from '@lingo/contracts'
import { z } from 'zod'
import { db } from '../lib/db'
import { manifestUrl } from '../lib/cdn'
import { AppError, notFound, ok, validate } from '../lib/http'
import { learner as resolveLearner } from '../lib/learner'
import { levelAfterQuiz } from '../lib/levelRule'
import { toLibraryWord } from '../lib/library'
/** TV-only learner routes (LING-005), mounted at /me before the `me` router. Same learner lookup as /me (lib/learner.ts) with x-device-id only: an x-session-code is ignored here, so a paired phone can't change the TV's progress or level. */
export const learning: Router = Router()
const valid = <T>(req: unknown) => (req as { valid: T }).valid
/** Only published clips take progress and quiz attempts (review-005 M1): a draft or a clip still being prepared is a 404, as for an unknown slug. */
const publishedClip = async (slug: string) => {
  const c = await db.clip.findUnique({ where: { slug }, include: { _count: { select: { quiz: true } } } })
  if (!c || c.status !== 'published') throw notFound('Clip')
  return c
}

learning.put('/progress', validate(ProgressPut, (r) => r.body), async (req, res, next) => {
  try {
    const b = valid<z.output<typeof ProgressPut>>(req)
    const l = await resolveLearner(req)
    const c = await publishedClip(b.clipSlug)
    const p = await db.progress.upsert({ where: { learnerId_clipId: { learnerId: l.id, clipId: c.id } }, create: { learnerId: l.id, clipId: c.id, positionS: b.positionS, completed: b.completed }, update: { positionS: b.positionS, completed: b.completed } })
    ok(res, { clipSlug: c.slug, positionS: p.positionS, completed: p.completed })
  } catch (e) { next(e) }
})

/**
 * Placement and Settings set the level to the band the learner chose (LevelPut allows only A1–B2); a TV quiz records an attempt and may move up
 * one band (lib/levelRule.ts). Never down automatically. Quiz eligibility comes from the server (review-005 M1): the clip must be published and
 * the client's `total` must equal the clip's quiz item count (else 409 QUIZ_MISMATCH), so "≥ 5 items" is the server's count, never the caller's.
 */
learning.put('/level', validate(LevelPut, (r) => r.body), async (req, res, next) => {
  try {
    const b = valid<z.output<typeof LevelPut>>(req)
    const l = await resolveLearner(req)
    if (b.source !== 'quiz') {
      await db.learner.update({ where: { id: l.id }, data: { level: b.level, levelChangedAt: new Date() } })
      return ok(res, { level: b.level, changed: b.level === l.level ? null : 'set' })
    }
    const c = await publishedClip(b.clipSlug)
    const total = c._count.quiz
    if (b.total !== total) throw new AppError(409, 'QUIZ_MISMATCH', `This clip's quiz has ${total} items`)
    await db.quizAttempt.create({ data: { learnerId: l.id, clipId: c.id, correct: b.correct, total } })
    const rows = await db.quizAttempt.findMany({ where: { learnerId: l.id, ...(l.levelChangedAt ? { at: { gte: l.levelChangedAt } } : {}) }, include: { clip: { select: { level: true } } }, orderBy: [{ at: 'asc' }] })
    const r = levelAfterQuiz(l.level, rows.map((a) => ({ clipId: a.clipId, clipLevel: a.clip.level as Level, correct: a.correct, total: a.total })))
    if (r.changed === 'up') await db.learner.update({ where: { id: l.id }, data: { level: r.level, levelChangedAt: new Date() } })
    ok(res, r)
  } catch (e) { next(e) }
})

/** Saved words for the TV Words screen, due first, with the cue span to replay. */
learning.get('/library', async (req, res, next) => {
  try {
    const l = await resolveLearner(req)
    const rows = await db.savedWord.findMany({ where: { learnerId: l.id }, include: { highlight: { include: { cue: { include: { clip: true } } } } }, orderBy: { due: 'asc' } })
    const native = String(req.header('x-native') ?? 'en')
    ok(res, rows.map((r) => toLibraryWord(r, native, manifestUrl)))
  } catch (e) { next(e) }
})
