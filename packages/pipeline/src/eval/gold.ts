import { z } from 'zod'
import { Lang, Level, POS } from '@lingo/contracts'

/**
 * Gold sets for the gloss eval (docs/plans/LING-002-gate-c.md §9.1): one file per clip and language pair under packages/pipeline/eval/gold/.
 * accept/reject are gloss headwords, normalised like normGloss (lowercase, no article, no parentheses).
 */
export const GoldExpect = z.union([
  z.object({ excluded: z.literal(true), why: z.string() }).strict(),
  z.object({
    sense: z.string(),
    pos: z.array(POS).min(1),
    accept: z.array(z.string()).min(1),
    reject: z.array(z.string()).default([]),
    plural: z.array(z.string()).optional(),
    comparative: z.array(z.string()).optional(),
    past: z.array(z.string()).optional(),
    participle: z.array(z.string()).optional(),
    ambiguous: z.boolean().default(false),
    /** for the human reading the report, e.g. "needs human confirmation" */
    note: z.string().optional(),
  }).strict(),
])

export const GoldItem = z.object({
  id: z.string(),
  cueIndex: z.number().int(),
  cue: z.string(),
  nativeCue: z.string().optional(),
  word: z.string(),
  lemma: z.string(),
  /** Transcribe confidence of the word, when known (an excluded ASR error carries it) */
  asr: z.number().min(0).max(1).optional(),
  expect: GoldExpect,
}).strict()

export const GoldSet = z.object({ slug: z.string(), lang: Lang, native: z.string(), level: Level, source: z.string().optional(), items: z.array(GoldItem) }).strict()
export type GoldItem = z.infer<typeof GoldItem>
export type GoldSet = z.infer<typeof GoldSet>
export type GoldExpectation = Extract<GoldItem['expect'], { accept: string[] }>
export const isExcluded = (g: GoldItem): g is GoldItem & { expect: { excluded: true; why: string } } => 'excluded' in g.expect
