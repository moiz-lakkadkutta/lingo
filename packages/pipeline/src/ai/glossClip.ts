import { siblingConflicts, type Gloss, type GlossCard, type Lang, type Level } from '@lingo/contracts'
import type { GlossFn, GlossOutcome } from './gloss'
import type { QuizCueInput } from './quiz'

/**
 * Clip-level glossing (docs/plans/LING-002-gate-c.md §5, docs/decisions/0009 decision 5): gloss every item, then re-ask once, with a hint,
 * each accepted item whose gloss overlaps a sibling's in the same cue (tennis/racket → "Tennisschläger"); still overlapping → 'conflict'.
 * One code path for prepare and the spot check.
 */
export interface ClipGlossItem { cueIndex: number; word: string; lemma: string; rank: number; cue: string; nativeCue?: string }
interface Meta { /** attempts of the final answer (1 = accepted first time); 0 when never asked */ attempts: number; cached: boolean; /** asked again with a sibling hint */ reasked: boolean }
export type AcceptedGloss = ClipGlossItem & Meta & { status: 'ok' | 'soft'; card: GlossCard; gloss: Gloss; issues: string[] }
export type FailedGloss = ClipGlossItem & Meta & { status: 'rejected' | 'conflict'; issues: string[]; card?: GlossCard; lastOutput?: unknown }
export type ClipGlossResult = AcceptedGloss | FailedGloss

const toResult = (it: ClipGlossItem, o: GlossOutcome, reasked: boolean): ClipGlossResult =>
  o.status === 'rejected'
    ? { ...it, status: 'rejected', issues: o.issues, lastOutput: o.lastOutput, attempts: o.attempts, cached: false, reasked }
    : { ...it, status: o.status, card: o.card, gloss: o.gloss, issues: o.issues, attempts: o.attempts, cached: o.cached, reasked }

const accepted = (r: ClipGlossResult) => (r.status === 'ok' || r.status === 'soft' ? r.card.gloss : undefined)

/** The hint of §5 step 3, naming the sibling and its gloss. */
export function siblingHint(word: string, sibling: { word: string; gloss: string[] }): string {
  const g = sibling.gloss.join(', ')
  return `Another word of this line, "${sibling.word}", was glossed "${g}". Gloss only [[${word}]]; if "${g}" translates "${sibling.word}", do not use it.`
}

export async function glossClip(ai: { gloss: GlossFn }, items: ClipGlossItem[], lang: Lang, native: string, level: Level, log: (m: string) => void): Promise<ClipGlossResult[]> {
  const ask = (it: ClipGlossItem, hint?: string) =>
    ai.gloss({ word: it.word, lemma: it.lemma, cue: it.cue, ...(it.nativeCue !== undefined ? { nativeCue: it.nativeCue } : {}), lang, native, level, ...(hint ? { hint } : {}) })
  // 1. every item, sequentially
  const results: ClipGlossResult[] = []
  for (const it of items) results.push(toResult(it, await ask(it), false))
  // 2–3. one re-ask per conflicting item, with a hint built from the first-round glosses
  const conflicts = siblingConflicts(results.map((r) => ({ cueIndex: r.cueIndex, lemma: r.lemma, gloss: accepted(r) })))
  const partner = new Map<number, number>()
  for (const [i, j] of conflicts) { if (!partner.has(i)) partner.set(i, j); if (!partner.has(j)) partner.set(j, i) }
  const hints = new Map([...partner].map(([i, j]) => [i, siblingHint(results[i]!.word, { word: results[j]!.word, gloss: accepted(results[j]!)! })]))
  for (const [i, hint] of hints) results[i] = toResult(items[i]!, await ask(items[i]!, hint), true)
  // 4. still overlapping → conflict
  const snap = results.map(accepted)
  for (const [i, j] of siblingConflicts(results.map((r, k) => ({ cueIndex: r.cueIndex, lemma: r.lemma, gloss: snap[k] })))) {
    for (const [a, b] of [[i, j], [j, i]] as const) {
      const r = results[a]!
      if (r.status !== 'ok' && r.status !== 'soft') continue
      const other = results[b]!
      results[a] = { ...r, status: 'conflict', issues: [`SIBLING: gloss "${r.card.gloss.join(', ')}" overlaps "${other.word}"'s gloss "${snap[b]?.join(', ') ?? ''}"`], card: r.card }
    }
  }
  // 5. one log line per non-ok item
  for (const r of results) if (r.status !== 'ok') log(`gloss: ${r.status} "${r.word}" (cue ${r.cueIndex}): ${r.issues.join('; ')}`)
  return results
}

/**
 * The quiz input of LING-002-gate-c §6, shared by prepare and the spot check: only status-ok cards (soft, rejected and conflict never),
 * with the card's lemma, pos and first gloss headword (shorter, cleaner options).
 */
export function quizInput(cues: Array<{ index: number; text: string; native: string }>, results: ClipGlossResult[]): QuizCueInput[] {
  return cues.map((c) => ({
    index: c.index, text: c.text, native: c.native,
    highlights: results.filter((r) => r.cueIndex === c.index).flatMap((r) => (r.status === 'ok' ? [{ word: r.word, lemma: r.lemma, pos: r.card.pos, gloss: r.card.gloss[0]! }] : [])),
  }))
}
