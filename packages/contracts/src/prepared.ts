import { z } from 'zod'
import { Lang, Level } from './base'

/**
 * Output of `packages/pipeline` prepare(): one `clip.json` per clip, consumed by the API worker (DB rows) and by LING-002 (glosses/quiz).
 * Cue timestamps are milliseconds; `text` is already wrapped (≤ 2 lines × 42 chars); native lines share the cue's timestamps by construction.
 */
export const PreparedToken = z.object({ word: z.string(), lemma: z.string(), rank: z.number().int().positive().nullable(), name: z.boolean(), sentenceInitial: z.boolean() })
export const PreparedCue = z
  .object({
    index: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    text: z.string().min(1), // target language, already wrapped with '\n' (≤ 2 lines × 42)
    native: z.record(z.string(), z.string()), // { en: '…', tr: '…' } same timestamps by construction
    tokens: z.array(PreparedToken),
  })
  .refine((c) => c.endMs > c.startMs, { message: 'endMs must be greater than startMs', path: ['endMs'] })
export const PreparedHighlight = z.object({ cueIndex: z.number().int().nonnegative(), word: z.string(), lemma: z.string(), rank: z.number().int().positive(), gloss: z.string().optional(), grammar: z.string().optional(), example: z.string().optional() }) // gloss/grammar/example absent when prepared with --no-ai
export const PreparedQuizItem = z.object({ kind: z.enum(['meaning', 'cloze']), prompt: z.string(), options: z.array(z.string()).length(4), answer: z.number().int().min(0).max(3), cueIndex: z.number().int().nullable() })
/** Bedrock spend for the clip; filled by LING-002, optional so LING-001 fixtures need no schema change. */
export const PreparedCost = z.object({ calls: z.number().int(), cachedCalls: z.number().int(), inputTokens: z.number().int(), outputTokens: z.number().int(), usd: z.number() })
export const PreparedClip = z.object({
  version: z.literal(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sourceLang: Lang,
  natives: z.array(z.string().min(2).max(5)).min(1),
  level: Level,
  coverageRank: z.number().int().positive(), // smallest rank r with ≥ 95 % of the ranked tokens ranked ≤ r (over ranked tokens; 99999 when none is ranked)
  durationS: z.number().positive(),
  cues: z.array(PreparedCue).min(1),
  highlights: z.array(PreparedHighlight),
  quiz: z.array(PreparedQuizItem).optional(), // empty in LING-001 fixtures; LING-002 fills; absent when prepared with --no-ai
  tracks: z.object({ manifest: z.string(), vtt: z.record(z.string(), z.string()) }), // relative to the published prefix: 'master.m3u8', { de: 'vtt/de.vtt', en: 'vtt/en.vtt' }
  publishedBase: z.string().url().nullable(), // https://{CLOUDFRONT_DOMAIN}/published/{slug} or null when not published
  source: z.object({ uri: z.string(), transcribeJob: z.string().nullable() }),
  generated: z.object({ at: z.string().datetime(), pipeline: z.string(), lemmatizer: z.string(), ai: z.boolean().optional() }), // 'lingo-pipeline@0.1.0', 'simplemma@2.0.0' | 'table'; ai false = Bedrock gloss/quiz skipped (--no-ai)
  warnings: z.array(z.string()),
  cost: PreparedCost.optional(),
})
export type PreparedClip = z.infer<typeof PreparedClip>
export type PreparedCue = z.infer<typeof PreparedCue>
export type PreparedHighlight = z.infer<typeof PreparedHighlight>
export type PreparedToken = z.infer<typeof PreparedToken>
export type PreparedQuizItem = z.infer<typeof PreparedQuizItem>
export type PreparedCost = z.infer<typeof PreparedCost>
