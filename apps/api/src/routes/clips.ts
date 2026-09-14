import { Router } from 'express'
import { db } from '../lib/db'
import { env } from '../lib/env'
import { notFound, ok } from '../lib/http'
export const clips: Router = Router()
clips.get('/:slug', async (req, res, next) => {
  try {
    const c = await db.clip.findUnique({ where: { slug: req.params.slug }, include: { cues: { orderBy: { index: 'asc' }, include: { highlights: true } }, quiz: true } })
    if (!c || c.status !== 'published') throw notFound('Clip')
    const native = String(req.header('x-native') ?? 'en')
    ok(res, {
      slug: c.slug, title: c.title, level: c.level, durationS: c.durationS, posterUrl: c.posterKey ? `https://${env.CLOUDFRONT_DOMAIN}/${c.posterKey}` : null, resumeS: null,
      attribution: c.attribution, sourceLang: c.sourceLang, manifestUrl: `https://${env.CLOUDFRONT_DOMAIN}/${c.manifestKey}`,
      cues: c.cues.map((q) => ({ index: q.index, startS: q.startMs / 1000, endS: q.endMs / 1000, text: q.text, native: (q.native as Record<string, string>)[native] ?? (q.native as Record<string, string>).en ?? '', highlights: q.highlights })),
      quiz: c.quiz.map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer, cueIndex: c.cues.find((x) => x.id === q.cueId)?.index ?? null })),
      wordsYoullMeet: c.cues.flatMap((q) => q.highlights).slice(0, 8),
    })
  } catch (e) { next(e) }
})
