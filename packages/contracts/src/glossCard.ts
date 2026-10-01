import { z } from 'zod'
import type { Lang } from './base'
import { boundedLine, EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS } from './text'

/**
 * Gloss card v3 (docs/plans/LING-002-gate-c.md §3–4, docs/decisions/0009 decisions 3–4): what Nova returns for one highlight. Code
 * renders the app's `Gloss` from it (packages/pipeline/src/ai/grammar.ts) and checks it with glossCardIssues().
 */
export const POS = z.enum(['noun', 'verb', 'adjective', 'adverb', 'other'])
export const REGISTER = z.enum(['neutral', 'informal', 'formal', 'dated', 'slang'])
export type Pos = z.infer<typeof POS>
export type Register = z.infer<typeof REGISTER>

const form = z.string().trim().min(1).max(40)

/** Nova sometimes returns "" or null for an unused optional field, or one gloss as a plain string: normalised before parsing. */
function tidy(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v
  const o = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== '' && x !== null && x !== undefined))
  if (typeof o.gloss === 'string') o.gloss = o.gloss.split(/\s*[;,]\s*/).filter(Boolean)
  return o
}

const CardObject = z.object({
  sense: boundedLine(100, 12),
  pos: POS,
  gloss: z.array(boundedLine(40, 4)).min(1).max(2),
  register: REGISTER,
  article: z.enum(['der', 'die', 'das']).optional(),
  plural: form.optional(),
  past: form.optional(),
  participle: form.optional(),
  separable: z.string().trim().min(1).max(10).optional(),
  comparative: form.optional(),
  example: boundedLine(EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS),
}).strict()

export const GlossCard = z.preprocess(tidy, CardObject)
export type GlossCard = z.infer<typeof CardObject>

const FIELDS_BY_POS: Record<Pos, Array<keyof GlossCard>> = {
  noun: ['article', 'plural'],
  verb: ['past', 'participle', 'separable'],
  adjective: ['comparative'],
  adverb: [],
  other: [],
}
const FORM_FIELDS = ['article', 'plural', 'past', 'participle', 'separable', 'comparative'] as const

/**
 * Fields that do not belong to card.pos are removed (never rendered, never an issue): a "comparative" on a noun cannot reach the note.
 * With `lang`, German-only fields (article, separable) are also removed from an English card.
 */
export function pruneCard(c: GlossCard, lang?: Lang): GlossCard {
  const keep = new Set<string>(FIELDS_BY_POS[c.pos])
  if (lang === 'en') { keep.delete('article'); keep.delete('separable') }
  const out: Record<string, unknown> = { ...c }
  for (const f of FORM_FIELDS) if (!keep.has(f)) delete out[f]
  return out as GlossCard
}

export interface CardContext { word: string; lemma: string; cue: string; nativeCue?: string; lang: Lang; native: string }

const sentenceKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[\p{P}\s]+$/u, '')

const SOFT = ['X-USES', 'F-ART-de', 'F-PLURAL-de', 'F-COMP-de', 'F-VERB-de']
/** X-USES and every F-*-de rule: they trigger the one retry, and an answer whose only issues are soft is accepted with a warning. */
export function isSoftCardIssue(issue: string): boolean {
  return SOFT.some((id) => issue.startsWith(`${id}:`))
}

/** [] = acceptable. Each string names the rule id first ("G-LEN: …") and is fed back to the model on the retry. */
export function glossCardIssues(card: GlossCard, ctx: CardContext): string[] {
  const c = pruneCard(card, ctx.lang)
  const issues: string[] = []
  const word = ctx.word.toLowerCase(), lemma = ctx.lemma.toLowerCase()
  for (const g of c.gloss) {
    const bare = g.trim().replace(/\.+$/, '').toLowerCase()
    if (bare === word || bare === lemma) issues.push(`G-COPY: gloss "${g}" copies the word; give a translation, or add a short clarifier in parentheses if it is spelled the same`)
  }
  if (sentenceKey(c.example) === sentenceKey(ctx.cue)) issues.push('X-CUE: example must be a new sentence, not the subtitle line')
  const ex = c.example.toLowerCase()
  if (!ex.includes(word) && !ex.includes(lemma)) issues.push(`X-USES: example must use the word "${ctx.word}" or its base form "${ctx.lemma}"`)
  return issues
}

