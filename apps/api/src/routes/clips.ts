import { Router } from 'express'
import { highlightFloor } from '@lingo/contracts'
import { db } from '../lib/db'
import { cdn, manifestUrl } from '../lib/cdn'
import { notFound, ok } from '../lib/http'
import { learner as resolveLearner } from '../lib/learner'
export const clips: Router = Router()
const ETA_MIN = 3, MEET_MAX = 8
/** Clip page + player data. Unpublished → status preparing. Highlights filtered per learner (decision 0007 M5): rank ≥ floor of the band above the learner level. */
clips.get('/:slug', async (req, res, next) => {
  try {
    const c = await db.clip.findUnique({ where: { slug: req.params.slug }, include: { cues: { orderBy: { index: 'asc' }, include: { highlights: true } }, quiz: true } })
    if (!c) throw notFound('Clip')
    const learner = await resolveLearner(req)
    const p = await db.progress.findUnique({ where: { learnerId_clipId: { learnerId: learner.id, clipId: c.id } } })
    const card = { slug: c.slug, title: c.title, level: c.level, durationS: c.durationS, posterUrl: cdn(c.posterKey), resumeS: p && !p.completed ? p.positionS : null, completed: !!p?.completed, attribution: c.attribution }
    if (c.status !== 'published') return ok(res, { ...card, status: 'preparing', etaMin: ETA_MIN })
    const native = String(req.header('x-native') ?? 'en')
    const floor = highlightFloor(learner.level)
    const cues = c.cues.map((q) => ({
      index: q.index, startS: q.startMs / 1000, endS: q.endMs / 1000, text: q.text,
      native: (q.native as Record<string, string>)[native] ?? (q.native as Record<string, string>).en ?? '',
      highlights: q.highlights.filter((h) => h.rank >= floor).map((h) => ({ id: h.id, word: h.word, lemma: h.lemma, rank: h.rank, gloss: h.gloss, grammar: h.grammar, example: h.example, level: h.level })),
    }))
    const seen = new Set<string>()
    const wordsYoullMeet = cues.flatMap((q) => q.highlights).filter((h) => !seen.has(h.lemma) && seen.add(h.lemma)).slice(0, MEET_MAX)
    ok(res, {
      ...card, status: 'ready', sourceLang: c.sourceLang, manifestUrl: manifestUrl(c.manifestKey) ?? `http://localhost/${c.slug}`,
      cues,
      quiz: c.quiz.map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer, cueIndex: c.cues.find((x) => x.id === q.cueId)?.index ?? null })),
      wordsYoullMeet,
    })
  } catch (e) { next(e) }
})
