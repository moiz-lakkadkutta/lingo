import { Router } from 'express'
import { db } from '../lib/db'
import { env } from '../lib/env'
import { ok } from '../lib/http'
export const catalog: Router = Router()
const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
const cdn = (k: string | null) => (k && env.CLOUDFRONT_DOMAIN ? `https://${env.CLOUDFRONT_DOMAIN}/${k}` : null)
/** Rows by level: "Just right for you" = learner level; "A bit harder" = one up. */
catalog.get('/', async (req, res, next) => {
  try {
    const deviceId = String(req.header('x-device-id') ?? 'anon')
    const learner = await db.learner.upsert({ where: { deviceId }, create: { deviceId }, update: {} })
    const clips = await db.clip.findMany({ where: { status: 'published', sourceLang: learner.learning }, include: { progress: { where: { learnerId: learner.id } } }, orderBy: { createdAt: 'desc' } })
    const card = (c: (typeof clips)[number]) => ({ slug: c.slug, title: c.title, level: c.level, durationS: c.durationS, posterUrl: cdn(c.posterKey), resumeS: c.progress[0]?.positionS ?? null })
    const li = LEVELS.indexOf(learner.level)
    ok(res, {
      continue: clips.filter((c) => c.progress[0] && !c.progress[0].completed).map(card),
      justRight: clips.filter((c) => c.level === learner.level).map(card),
      harder: clips.filter((c) => c.level === LEVELS[Math.min(li + 1, 3)]).map(card),
      fresh: clips.slice(0, 6).map(card),
    })
  } catch (e) { next(e) }
})
