import { Router } from 'express'
import { LearnerDto, ReviewPost, SaveWord, WordSavedPayload } from '@lingo/contracts'
import { db } from '../lib/db'
import { ok, validate } from '../lib/http'
import { sm2 } from '../lib/sm2'
import { getIo } from '../lib/io'
import { logger } from '../lib/logger'
export const me: Router = Router()
const learner = async (h: unknown) => db.learner.upsert({ where: { deviceId: String(h ?? 'anon') }, create: { deviceId: String(h ?? 'anon') }, update: { lastActive: new Date() } })

me.get('/', async (req, res, next) => { try { ok(res, await learner(req.header('x-device-id'))) } catch (e) { next(e) } })
me.put('/', validate(LearnerDto.partial(), (r) => r.body), async (req, res, next) => { try { const l = await learner(req.header('x-device-id')); ok(res, await db.learner.update({ where: { id: l.id }, data: (req as never as { valid: object }).valid })) } catch (e) { next(e) } })

/** Save a word from the Explain card. Free tier: 20/day. Emits word:saved to the phone room. */
me.post('/words', validate(SaveWord, (r) => r.body), async (req, res, next) => {
  try {
    const l = await learner(req.header('x-device-id'))
    const { highlightId, sessionCode } = (req as never as { valid: { highlightId: string; sessionCode?: string } }).valid
    if (!l.plus) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const n = await db.savedWord.count({ where: { learnerId: l.id, createdAt: { gte: today } } })
      if (n >= 20) return ok(res, { limit: true, saved: null })
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
    ok(res, { limit: false, saved }, 201)
  } catch (e) { next(e) }
})
me.get('/words', async (req, res, next) => {
  try {
    const l = await learner(req.header('x-device-id'))
    const due = req.query.due === 'today'
    const rows = await db.savedWord.findMany({ where: { learnerId: l.id, ...(due ? { due: { lte: new Date() } } : {}) }, include: { highlight: true }, orderBy: { due: 'asc' } })
    ok(res, rows.map((r) => ({ savedWordId: r.id, word: r.highlight.word, gloss: r.highlight.gloss, example: r.highlight.example, due: r.due.toISOString(), reps: r.reps })))
  } catch (e) { next(e) }
})
/** Grade → SM-2 update server-side (single source of truth for TV and phone). */
me.post('/reviews', validate(ReviewPost, (r) => r.body), async (req, res, next) => {
  try {
    const { savedWordId, grade } = (req as never as { valid: { savedWordId: string; grade: 'again' | 'hard' | 'good' | 'easy' } }).valid
    const w = await db.savedWord.findUniqueOrThrow({ where: { id: savedWordId } })
    const next_ = sm2({ ease: w.ease, intervalD: w.intervalD, reps: w.reps, lapses: w.lapses }, grade)
    const due = new Date(); due.setDate(due.getDate() + next_.intervalD)
    await db.review.create({ data: { savedWordId, grade } })
    ok(res, await db.savedWord.update({ where: { id: savedWordId }, data: { ...next_, due } }))
  } catch (e) { next(e) }
})
