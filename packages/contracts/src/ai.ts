import { z } from 'zod'
import { PreparedQuizItem } from './prepared'

/**
 * LING-002: shapes the pipeline asks Amazon Nova Lite for (gloss card, quiz plan) and the context rules a schema cannot express.
 * The quiz items themselves are built by code from the plan (see packages/pipeline/src/ai/quiz.ts).
 */
export const GLOSS_MAX_WORDS = 6, GLOSS_MAX_CHARS = 60
export const GRAMMAR_MAX_WORDS = 14, GRAMMAR_MAX_CHARS = 90
export const EXAMPLE_MAX_WORDS = 12, EXAMPLE_MAX_CHARS = 120
export const QUIZ_MEANING_ITEMS = 6, QUIZ_CLOZE_ITEMS = 4, QUIZ_MIN_HIGHLIGHTS = 4

/** Names used in prompts; unknown codes fall back to the upper-cased code. */
export const LANGUAGE_NAMES: Record<string, string> = { de: 'German', en: 'English', tr: 'Turkish', ar: 'Arabic', uk: 'Ukrainian', fr: 'French', es: 'Spanish', it: 'Italian', pl: 'Polish', ru: 'Russian' }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const line = (max: number, maxWords: number) =>
  z.string().trim().min(1).max(max)
    .refine((s) => !/[\r\n]/.test(s), 'single line')
    .refine((s) => words(s) <= maxWords, `≤ ${maxWords} words`)

/** Shape of one explanation (what Nova returns and what PreparedHighlight carries). Context checks live in glossIssues(). */
export const Gloss = z.object({ gloss: line(GLOSS_MAX_CHARS, GLOSS_MAX_WORDS), grammar: line(GRAMMAR_MAX_CHARS, GRAMMAR_MAX_WORDS), example: line(EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS) }).strict()
export type Gloss = z.infer<typeof Gloss>
export interface GlossContext { word: string; lemma: string; cue: string }

const sentenceKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[\p{P}\s]+$/u, '')

const EXAMPLE_WORD_ISSUE = 'example must use the word'

/**
 * Soft issues are a nudge for the one retry, not a reason to reject: an example with an irregular form ("gibt"/"geben" → "Er gab …")
 * is a good card that a substring check cannot recognise. The pipeline accepts a retry answer whose only issues are soft (and logs a warning).
 */
export function isSoftGlossIssue(issue: string): boolean {
  return issue.startsWith(EXAMPLE_WORD_ISSUE)
}

/** Context rules a schema cannot express. Returns [] when acceptable. Each string is fed back to the model on retry. */
export function glossIssues(g: Gloss, ctx: GlossContext): string[] {
  const issues: string[] = []
  const word = ctx.word.toLowerCase(), lemma = ctx.lemma.toLowerCase()
  const gloss = g.gloss.trim().replace(/\.+$/, '').trim().toLowerCase()
  if (gloss === word || gloss === lemma) issues.push('gloss must be a translation, not a copy of the word; if the word is the same in both languages add a clarifier in parentheses')
  const example = g.example.toLowerCase()
  if (!example.includes(word) && !example.includes(lemma)) issues.push(`${EXAMPLE_WORD_ISSUE} "${ctx.word}" or its base form "${ctx.lemma}"`)
  if (sentenceKey(g.example) === sentenceKey(ctx.cue)) issues.push('example must be a new sentence, not the subtitle line')
  return issues
}

/** What Nova returns for a quiz: a plan over highlight ids; the pipeline builds the items. */
export const QuizPlanItem = z.object({ kind: z.enum(['meaning', 'cloze']), highlightId: z.number().int().nonnegative(), distractorIds: z.array(z.number().int().nonnegative()).length(3) }).strict()
export const QuizPlan = z.object({ items: z.array(QuizPlanItem).min(1).max(QUIZ_MEANING_ITEMS + QUIZ_CLOZE_ITEMS) }).strict()
export type QuizPlan = z.infer<typeof QuizPlan>
export type QuizPlanItem = z.infer<typeof QuizPlanItem>
export interface QuizHighlight { id: number; cueIndex: number; word: string; gloss: string; cue: string }
export interface QuizCounts { meaning: number; cloze: number }

/** H < QUIZ_MIN_HIGHLIGHTS → { meaning: 0, cloze: 0 }; else { meaning: min(6, H), cloze: min(4, H) }. */
export function quizCounts(highlightCount: number): QuizCounts {
  if (highlightCount < QUIZ_MIN_HIGHLIGHTS) return { meaning: 0, cloze: 0 }
  return { meaning: Math.min(QUIZ_MEANING_ITEMS, highlightCount), cloze: Math.min(QUIZ_CLOZE_ITEMS, highlightCount) }
}

const optionKey = (s: string) => s.trim().toLowerCase()

/**
 * [] when acceptable. Checks: every id < H.length; distractorIds distinct and ≠ highlightId; exactly counts.meaning 'meaning' and
 * counts.cloze 'cloze' items; no highlightId repeated within a kind; meaning: the 3 distractor glosses and the correct gloss are pairwise
 * distinct (case-insensitive, trimmed); cloze: the 3 distractor words and the correct word are pairwise distinct (case-insensitive).
 */
export function quizPlanIssues(plan: QuizPlan, H: QuizHighlight[], counts: QuizCounts): string[] {
  const issues: string[] = []
  const max = H.length - 1
  for (const kind of ['meaning', 'cloze'] as const) {
    const n = plan.items.filter((it) => it.kind === kind).length
    if (n !== counts[kind]) issues.push(`expected exactly ${counts[kind]} "${kind}" items, got ${n}`)
  }
  const seen = { meaning: new Set<number>(), cloze: new Set<number>() }
  plan.items.forEach((it, i) => {
    const at = `item ${i} (${it.kind}, highlightId ${it.highlightId})`
    const ids = [it.highlightId, ...it.distractorIds]
    const outOfRange = ids.filter((id) => id > max)
    if (outOfRange.length) issues.push(`${at}: id ${outOfRange.join(', ')} is out of range (valid ids 0–${max})`)
    if (seen[it.kind].has(it.highlightId)) issues.push(`${at}: highlightId ${it.highlightId} is repeated within "${it.kind}"`)
    seen[it.kind].add(it.highlightId)
    if (it.distractorIds.includes(it.highlightId)) issues.push(`${at}: distractorIds must not contain the highlightId itself`)
    if (new Set(it.distractorIds).size !== it.distractorIds.length) issues.push(`${at}: distractorIds must be 3 different ids`)
    if (outOfRange.length) return
    const field = it.kind === 'meaning' ? 'gloss' : 'word'
    const values = ids.map((id) => optionKey(H[id]![field]))
    const dup = values.find((v, j) => values.indexOf(v) !== j)
    if (dup !== undefined && new Set(ids).size === ids.length) issues.push(`${at}: options repeat the ${field} "${dup}"; choose distractors with different ${field}s`)
  })
  return issues
}

export const QuizSet = z.object({ items: z.array(PreparedQuizItem) })
export type QuizSet = z.infer<typeof QuizSet>
