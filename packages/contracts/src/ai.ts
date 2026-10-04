import { z } from 'zod'
import { PreparedQuizItem } from './prepared'
import type { Pos } from './glossCard'
import { levenshtein, normGloss, sameStem, wordsOf } from './text'

/**
 * LING-002: shapes the pipeline asks Amazon Nova Lite for (gloss card, quiz plan) and the context rules a schema cannot express.
 * The quiz items themselves are built by code from the plan (see packages/pipeline/src/ai/quiz.ts).
 */
import { boundedLine, EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS, GLOSS_MAX_CHARS, GLOSS_MAX_WORDS, GRAMMAR_MAX_CHARS, GRAMMAR_MAX_WORDS } from './text'
export { EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS, GLOSS_MAX_CHARS, GLOSS_MAX_WORDS, GRAMMAR_MAX_CHARS, GRAMMAR_MAX_WORDS } from './text'
export const QUIZ_MEANING_ITEMS = 6, QUIZ_CLOZE_ITEMS = 4, QUIZ_MIN_HIGHLIGHTS = 4

/** Names used in prompts; unknown codes fall back to the upper-cased code. */
export const LANGUAGE_NAMES: Record<string, string> = { de: 'German', en: 'English', tr: 'Turkish', ar: 'Arabic', uk: 'Ukrainian', fr: 'French', es: 'Spanish', it: 'Italian', pl: 'Polish', ru: 'Russian' }

const line = boundedLine

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
export interface QuizHighlight { id: number; cueIndex: number; word: string; lemma: string; pos: Pos; /** first gloss headword */ gloss: string; cue: string }
export interface QuizCounts { meaning: number; cloze: number }

/** H < QUIZ_MIN_HIGHLIGHTS → { meaning: 0, cloze: 0 }; else { meaning: min(6, H), cloze: min(4, H) }. */
export function quizCounts(highlightCount: number): QuizCounts {
  if (highlightCount < QUIZ_MIN_HIGHLIGHTS) return { meaning: 0, cloze: 0 }
  return { meaning: Math.min(QUIZ_MEANING_ITEMS, highlightCount), cloze: Math.min(QUIZ_CLOZE_ITEMS, highlightCount) }
}

const optionKey = (s: string) => s.trim().toLowerCase()

/**
 * LING-002-gate-c §6 distractor rules (quizPlanIssues and fallbackPlan), plus quiz v3: the same part of speech as the answer. Meaning: the distractor gloss must not share a stem with,
 * contain or be contained in the answer gloss (Schläger / Tennisschläger); cloze: the distractor word must not have the answer's lemma,
 * be at edit distance ≤ 1 from it (sale / sal), or already occur in the answer's line (Or a ____ roast. / roast). undefined = fine.
 */
export function distractorIssue(kind: 'meaning' | 'cloze', answer: QuizHighlight, d: QuizHighlight): string | undefined {
  if (answer.pos !== d.pos) return `has pos ${d.pos}, the answer "${answer.word}" is a ${answer.pos}; choose a distractor of the same part of speech`
  if (kind === 'meaning') {
    const a = normGloss(answer.gloss), g = normGloss(d.gloss)
    const contains = (x: string, y: string) => y.length >= 4 && x.includes(y)
    if (a && g && (sameStem(a, g) || contains(a, g) || contains(g, a))) return `gloss "${d.gloss}" overlaps the answer gloss "${answer.gloss}"; choose a clearly different meaning`
    return undefined
  }
  const a = answer.word.toLowerCase(), w = d.word.toLowerCase()
  if (d.lemma.toLowerCase() === answer.lemma.toLowerCase() || levenshtein(a, w) <= 1) return `word "${d.word}" is too close to the answer "${answer.word}" (same lemma or one letter apart)`
  const others = wordsOf(answer.cue)
  const at = others.indexOf(a)
  if (others.some((x, i) => i !== at && x === w)) return `word "${d.word}" is already in the line of "${answer.word}"`
  return undefined
}

/** Peers of h: other highlights (another lemma) with the same part of speech. */
const samePosPeers = (H: QuizHighlight[], h: QuizHighlight) => H.filter((x) => x.id !== h.id && x.pos === h.pos && x.lemma.toLowerCase() !== h.lemma.toLowerCase())
/** Quiz v3: a highlight can be tested only when at least 3 other highlights share its part of speech (same-pos distractors). */
export function quizEligible(H: QuizHighlight[]): QuizHighlight[] {
  return H.filter((h) => samePosPeers(H, h).length >= 3)
}

/** The clip's cue range, for the spread rules. */
export interface QuizSpread { cueMin: number; cueMax: number }
export const QUIZ_WINDOW_CUES = 10, QUIZ_MAX_PER_WINDOW = 2
/** 10 cues; on a clip shorter than 50 cues a fifth of it (at least 1), so a short clip can still have a full quiz. */
export function quizWindow(s: QuizSpread): number {
  return Math.max(1, Math.min(QUIZ_WINDOW_CUES, Math.floor((s.cueMax - s.cueMin + 1) / 5)))
}
/** Which third of the clip's cue range a cue is in (0, 1, 2). */
export function quizThird(cueIndex: number, s: QuizSpread): number {
  const n = s.cueMax - s.cueMin + 1
  return Math.min(2, Math.max(0, Math.floor((3 * (cueIndex - s.cueMin)) / n)))
}
/**
 * Spread rules (quiz v3): the items' cues touch every third of the clip that has a testable highlight, and no window of quizWindow()
 * consecutive cues holds more than 2 items. `itemCues` = the cue index of each item (meaning and cloze together).
 */
export function spreadIssues(itemCues: number[], eligible: QuizHighlight[], s: QuizSpread): string[] {
  const issues: string[] = []
  const want = new Set(eligible.map((h) => quizThird(h.cueIndex, s))).size
  const got = new Set(itemCues.map((c) => quizThird(c, s))).size
  if (got < Math.min(3, want)) issues.push(`items cover ${got} of the clip's thirds; spread them over all ${Math.min(3, want)} thirds (cue ${s.cueMin}–${s.cueMax})`)
  const w = quizWindow(s)
  for (const start of [...new Set(itemCues)].sort((a, b) => a - b)) {
    const n = itemCues.filter((c) => c >= start && c <= start + w - 1).length
    if (n > QUIZ_MAX_PER_WINDOW) { issues.push(`${n} items within cues ${start}–${start + w - 1}; at most ${QUIZ_MAX_PER_WINDOW} items in any ${w} consecutive cues`); break }
  }
  return issues
}

/**
 * [] when acceptable. Checks: every id < H.length; distractorIds distinct and ≠ highlightId; exactly counts.meaning 'meaning' and
 * counts.cloze 'cloze' items; no highlightId repeated within a kind; meaning: the 3 distractor glosses and the correct gloss are pairwise
 * distinct (case-insensitive, trimmed); cloze: the 3 distractor words and the correct word are pairwise distinct (case-insensitive).
 */
export function quizPlanIssues(plan: QuizPlan, H: QuizHighlight[], counts: QuizCounts, opts: { spread?: QuizSpread; min?: QuizCounts } = {}): string[] {
  const { spread, min } = opts
  const issues: string[] = []
  const max = H.length - 1
  for (const kind of ['meaning', 'cloze'] as const) {
    const n = plan.items.filter((it) => it.kind === kind).length
    if (!min && n !== counts[kind]) issues.push(`expected exactly ${counts[kind]} "${kind}" items, got ${n}`)
    if (min && (n < min[kind] || n > counts[kind])) issues.push(`expected ${min[kind] === counts[kind] ? `exactly ${counts[kind]}` : `${min[kind]}–${counts[kind]}`} "${kind}" items, got ${n}`)
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
    if (samePosPeers(H, H[it.highlightId]!).length < 3) issues.push(`${at}: highlightId ${it.highlightId} has fewer than 3 other highlights of its part of speech (${H[it.highlightId]!.pos}); it cannot be tested`)
    for (const id of it.distractorIds) {
      const why = id === it.highlightId ? undefined : distractorIssue(it.kind, H[it.highlightId]!, H[id]!)
      if (why) issues.push(`${at}: distractor ${id} ${why}`)
    }
  })
  if (spread && plan.items.every((it) => it.highlightId < H.length)) issues.push(...spreadIssues(plan.items.map((it) => H[it.highlightId]!.cueIndex), quizEligible(H), spread))
  return issues
}

/** `fallback`: the items come from fallbackPlan (the model's plan failed twice, or Bedrock failed); not stored in clip.json. */
export const QuizSet = z.object({ items: z.array(PreparedQuizItem), fallback: z.boolean().optional() })
export type QuizSet = z.infer<typeof QuizSet>
