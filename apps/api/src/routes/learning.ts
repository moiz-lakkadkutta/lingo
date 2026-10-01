import { Router } from 'express'
import { LevelPut, ProgressPut, type Level } from '@lingo/contracts'
import { z } from 'zod'
import { db } from '../lib/db'
import { manifestUrl } from '../lib/cdn'
import { notFound, ok, validate } from '../lib/http'
import { learner as resolveLearner } from '../lib/learner'
import { levelAfterQuiz } from '../lib/levelRule'
import { toLibraryWord } from '../lib/library'
/** TV-only learner routes (LING-005), mounted at /me before the `me` router. Same learner lookup as /me (lib/learner.ts): the TV sends x-device-id; an x-session-code resolves to the paired TV's learner. */
export const learning: Router = Router()
const valid = <T>(req: unknown) => (req as { valid: T }).valid

learning.put('/progress', validate(ProgressPut, (r) => r.body), async (req, res, next) => {
  try {
    const b = valid<z.output<typeof ProgressPut>>(req)
    const l = await resolveLearner(req)
    const c = await db.clip.findUnique({ where: { slug: b.clipSlug } })
    if (!c) throw notFound('Clip')
    const p = await db.progress.upsert({ where: { learnerId_clipId: { learnerId: l.id, clipId: c.id } }, create: { learnerId: l.id, clipId: c.id, positionS: b.positionS, completed: b.completed }, update: { positionS: b.positionS, completed: b.completed } })
    ok(res, { clipSlug: c.slug, positionS: p.positionS, completed: p.completed })
  } catch (e) { next(e) }
})

/** Placement and Settings set the level; a TV quiz records an attempt and may move up one band (lib/levelRule.ts). Never down automatically. */
learning.put('/level', validate(LevelPut, (r) => r.body), async (req, res, next) => {
  try {
    const b = valid<z.output<typeof LevelPut>>(req)
    const l = await resolveLearner(req)
    if (b.source !== 'quiz') {
      await db.learner.update({ where: { id: l.id }, data: { level: b.level, levelChangedAt: new Date() } })
      return ok(res, { level: b.level, changed: b.level === l.level ? null : 'set' })
    }
    const c = await db.clip.findUnique({ where: { slug: b.clipSlug } })
    if (!c) throw notFound('Clip')
    await db.quizAttempt.create({ data: { learnerId: l.id, clipId: c.id, correct: b.correct, total: b.total } })
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
