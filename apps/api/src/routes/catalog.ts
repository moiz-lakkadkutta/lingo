import { Router } from 'express'
import { z } from 'zod'
import { Lang, Level, NEXT } from '@lingo/contracts'
import { db } from '../lib/db'
import { cdn } from '../lib/cdn'
import { ok, validate } from '../lib/http'
import { learner as resolveLearner } from '../lib/learner'
export const catalog: Router = Router()
const Query = z.object({ learning: Lang.optional(), level: Level.optional() })
const FRESH_DAYS = 7, FRESH_MAX = 10
/** Home rows (docs/plans/LING-005.md §4): Continue, Just right (learner level), A bit harder (one up; none for B2), New this week. `?learning=&level=` override the learner. */
catalog.get('/', validate(Query, (r) => r.query), async (req, res, next) => {
  try {
    const q = (req as never as { valid: z.infer<typeof Query> }).valid
    const learner = await resolveLearner(req)
    const learning = q.learning ?? learner.learning, level = q.level ?? learner.level
    const clips = await db.clip.findMany({ where: { status: 'published', sourceLang: learning }, include: { progress: { where: { learnerId: learner.id } } }, orderBy: { createdAt: 'desc' } })
    type C = (typeof clips)[number]
    const p = (c: C) => c.progress[0]
    const card = (c: C) => ({ slug: c.slug, title: c.title, level: c.level, durationS: c.durationS, posterUrl: cdn(c.posterKey), resumeS: p(c) && !p(c)!.completed ? p(c)!.positionS : null, completed: !!p(c)?.completed, attribution: c.attribution })
    const since = Date.now() - FRESH_DAYS * 86_400_000
    const done = (c: C) => (p(c)?.completed ? 1 : 0)
    ok(res, {
      continue: clips.filter((c) => p(c) && !p(c)!.completed).sort((a, b) => p(b)!.updatedAt.getTime() - p(a)!.updatedAt.getTime()).map(card),
      justRight: clips.filter((c) => c.level === level).sort((a, b) => done(a) - done(b)).map(card), // stable: createdAt desc within each group
      harder: NEXT[level] === level ? [] : clips.filter((c) => c.level === NEXT[level]).map(card),
      fresh: clips.filter((c) => c.createdAt.getTime() >= since).slice(0, FRESH_MAX).map(card),
    })
  } catch (e) { next(e) }
})
