import type { PrismaClient } from '@prisma/client'
import { BANDS, LEVELS, type Level, type PreparedClip } from '@lingo/contracts'

export interface SeedOptions {
  /** Defaults to the prepared clip's slug. */
  slug?: string
  title: string
  /** Relative to MEDIA_BASE_URL (or CloudFront), e.g. `demo-de/master.m3u8`. */
  manifestKey: string
  license: string
  attribution: string
}
export interface SeedResult { clipId: string; slug: string; cues: number; highlights: number; quiz: number; created: boolean }

/** CEFR band of a frequency rank (BANDS); ranks past the B2 band count as B2. */
export function levelForRank(rank: number): Level {
  return LEVELS.find((l) => rank < BANDS[l][1]) ?? 'B2'
}

/**
 * Publishes a prepared clip (`clip.json`) to the DB for local development: clip, cues, highlights and quiz items, status `published`.
 * Idempotent: re-running with the same input changes nothing (rows are matched by slug, cue index and highlight word + lemma), so the
 * ids that saved words point at survive a re-seed. Highlights the input no longer has are removed unless a learner saved them.
 */
export async function seedClip(db: PrismaClient, prepared: PreparedClip, o: SeedOptions): Promise<SeedResult> {
  const slug = o.slug ?? prepared.slug
  return db.$transaction(async (tx) => {
    const before = await tx.clip.findUnique({ where: { slug }, select: { id: true } })
    const data = {
      title: o.title, sourceLang: prepared.sourceLang, durationS: prepared.durationS, level: prepared.level, coverageRank: prepared.coverageRank,
      license: o.license, attribution: o.attribution, manifestKey: o.manifestKey, status: 'published',
    }
    const clip = await tx.clip.upsert({ where: { slug }, create: { slug, ...data }, update: data })
    const indexes = prepared.cues.map((c) => c.index)
    await tx.cue.deleteMany({ where: { clipId: clip.id, index: { notIn: indexes } } })
    let highlights = 0
    for (const c of prepared.cues) {
      const cueData = { startMs: c.startMs, endMs: c.endMs, text: c.text, native: c.native }
      const cue = await tx.cue.upsert({ where: { clipId_index: { clipId: clip.id, index: c.index } }, create: { clipId: clip.id, index: c.index, ...cueData }, update: cueData })
      const want = prepared.highlights.filter((h) => h.cueIndex === c.index)
      const have = await tx.highlight.findMany({ where: { cueId: cue.id }, include: { _count: { select: { saved: true } } } })
      for (const h of want) {
        const row = { word: h.word, lemma: h.lemma, rank: h.rank, gloss: h.gloss ?? '', grammar: h.grammar ?? '', example: h.example ?? '', level: levelForRank(h.rank) }
        const match = have.find((x) => x.word === h.word && x.lemma === h.lemma)
        if (match) await tx.highlight.update({ where: { id: match.id }, data: row })
        else await tx.highlight.create({ data: { cueId: cue.id, ...row } })
        highlights++
      }
      const stale = have.filter((x) => x._count.saved === 0 && !want.some((h) => h.word === x.word && h.lemma === x.lemma))
      if (stale.length) await tx.highlight.deleteMany({ where: { id: { in: stale.map((x) => x.id) } } })
    }
    const cueIds = new Map((await tx.cue.findMany({ where: { clipId: clip.id }, select: { id: true, index: true } })).map((c) => [c.index, c.id]))
    await tx.quizItem.deleteMany({ where: { clipId: clip.id } })
    const quiz = prepared.quiz ?? []
    if (quiz.length) {
      await tx.quizItem.createMany({ data: quiz.map((q) => ({ clipId: clip.id, kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer, cueId: q.cueIndex === null ? null : cueIds.get(q.cueIndex) ?? null })) })
    }
    return { clipId: clip.id, slug, cues: prepared.cues.length, highlights, quiz: quiz.length, created: !before }
  }, { timeout: 30_000 })
}
