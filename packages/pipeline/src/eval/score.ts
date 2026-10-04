import { distractorIssue, glossCardIssues, isSoftCardIssue, normGloss, type Lang, type Pos, type PreparedQuizItem } from '@lingo/contracts'
import type { AcceptedGloss, ClipGlossResult } from '../ai/glossClip'
import { MIN_HIGHLIGHT_CONFIDENCE } from '../asr'
import { isExcluded, type GoldExpectation, type GoldItem, type GoldSet } from './gold'

/** Pure scorer of the gloss eval (docs/plans/LING-002-gate-c.md §9.2). */
export type CheckId = 'S-SENSE' | 'S-POS' | 'S-FORMS' | 'S-VALID' | 'S-FIRST' | 'S-LANG'
export interface ItemScore { id: string; pass: boolean; checks: Record<CheckId, boolean>; gloss: string; sense: string; status: string; rejectHit: boolean; ambiguous: boolean; note?: string }

const FORM_POS: Record<'plural' | 'comparative' | 'past' | 'participle', Pos> = { plural: 'noun', comparative: 'adjective', past: 'verb', participle: 'verb' }
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const NONE: Record<CheckId, boolean> = { 'S-SENSE': false, 'S-POS': false, 'S-FORMS': false, 'S-VALID': false, 'S-FIRST': false, 'S-LANG': false }

/**
 * One gold item against the clip-gloss result for that word (undefined = not glossed / not a highlight).
 * Excluded item: passes when it is not a highlight after the ASR filter (no result, and its confidence is below the floor when known).
 * Scored item: pass = S-SENSE ∧ S-POS ∧ S-FORMS ∧ S-VALID ∧ S-LANG (S-FIRST is reported only). S-VALID accepts status ok or soft with no
 * hard card issue (soft issues allowed). Forms are checked only for the fields of the card's pos.
 */
export function scoreItem(g: GoldItem, r: ClipGlossResult | undefined, set: { lang: Lang; native: string }): ItemScore {
  if (isExcluded(g)) {
    const filtered = g.asr !== undefined && g.asr < MIN_HIGHLIGHT_CONFIDENCE
    const pass = r === undefined && filtered
    return { id: g.id, pass, checks: { ...NONE, 'S-VALID': pass }, gloss: r?.card?.gloss.join(', ') ?? '', sense: '', status: r ? r.status : 'excluded', rejectHit: false, ambiguous: false, note: g.expect.why }
  }
  const e = g.expect as GoldExpectation
  const base = { id: g.id, ambiguous: e.ambiguous, ...(e.note ? { note: e.note } : {}) }
  const card = r?.card
  if (!r || !card) return { ...base, pass: false, checks: { ...NONE }, gloss: '', sense: '', status: r?.status ?? 'missing', rejectHit: false }
  const glosses = card.gloss.map(normGloss)
  const accept = new Set(e.accept.map(normGloss)), reject = new Set(e.reject.map(normGloss))
  const rejectHit = glosses.some((x) => reject.has(x))
  const issues = glossCardIssues(card, { word: g.word, lemma: g.lemma, cue: g.cue, ...(g.nativeCue ? { nativeCue: g.nativeCue } : {}), lang: set.lang, native: set.native })
  const forms = (['plural', 'comparative', 'past', 'participle'] as const).every((f) => {
    const want = e[f]
    if (!want || FORM_POS[f] !== card.pos) return true
    const got = card[f]
    return got !== undefined && want.map(norm).includes(norm(got))
  })
  const checks: Record<CheckId, boolean> = {
    'S-SENSE': glosses.some((x) => accept.has(x)) && !rejectHit,
    'S-POS': e.pos.includes(card.pos),
    'S-FORMS': forms,
    'S-VALID': (r.status === 'ok' || r.status === 'soft') && issues.every(isSoftCardIssue),
    'S-FIRST': r.attempts === 1 && !r.reasked,
    'S-LANG': !issues.some((i) => i.startsWith('X-LANG:')),
  }
  const pass = checks['S-SENSE'] && checks['S-POS'] && checks['S-FORMS'] && checks['S-VALID'] && checks['S-LANG']
  return { ...base, pass, checks, gloss: card.gloss.join(', '), sense: card.sense, status: r.status, rejectHit }
}

export type QuizCheckId = 'Q-ANSWER' | 'Q-DISTINCT' | 'Q-CLOZE-NEAR' | 'Q-MEANING-OVERLAP' | 'Q-PASSING-GLOSSES'

/**
 * Automatic quiz checks of §9.2 over the built items: the answer is the item's own gloss/word, 4 distinct options, no near-spelling or
 * same-lemma cloze distractor and no option already in the line, no meaning distractor overlapping the answer gloss, and every meaning
 * option is the first gloss of a card that passes S-SENSE. ("Plausible" stays human.)
 */
export function quizChecks(quiz: PreparedQuizItem[], results: ClipGlossResult[], scores: ItemScore[]): Record<QuizCheckId, boolean> {
  const ok = results.filter((r): r is AcceptedGloss => r.status === 'ok')
  const passingGloss = new Set(results.flatMap((r, i) => (r.card && scores[i]?.checks['S-SENSE'] ? [r.card.gloss[0]!] : [])))
  const hq = (r: (typeof ok)[number], id = 0) => ({ id, cueIndex: r.cueIndex, word: r.word, lemma: r.lemma, pos: r.card.pos, gloss: r.card.gloss[0]!, cue: r.cue })
  const c: Record<QuizCheckId, boolean> = { 'Q-ANSWER': true, 'Q-DISTINCT': true, 'Q-CLOZE-NEAR': true, 'Q-MEANING-OVERLAP': true, 'Q-PASSING-GLOSSES': true }
  for (const q of quiz) {
    if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) c['Q-DISTINCT'] = false
    if (q.kind === 'meaning') {
      const own = ok.find((r) => r.word === q.prompt)
      if (!own || q.options[q.answer] !== own.card.gloss[0]) { c['Q-ANSWER'] = false; continue }
      for (const [j, o] of q.options.entries()) {
        if (!passingGloss.has(o)) c['Q-PASSING-GLOSSES'] = false
        if (j === q.answer) continue
        const d = ok.find((r) => r.card.gloss[0] === o)
        if (d && distractorIssue('meaning', hq(own), hq(d, 1))) c['Q-MEANING-OVERLAP'] = false
      }
    } else {
      const own = ok.find((r) => r.cueIndex === q.cueIndex && r.word === q.options[q.answer])
      if (!own) { c['Q-ANSWER'] = false; continue }
      for (const [j, o] of q.options.entries()) {
        if (j === q.answer) continue
        const d = ok.find((r) => r.word === o)
        if (!d || distractorIssue('cloze', hq(own), hq(d, 1))) c['Q-CLOZE-NEAR'] = false
      }
    }
  }
  return c
}

export interface SetScore { items: ItemScore[]; passed: number; total: number; rejectHits: number; excludedOk: boolean; ambiguousFails: string[]; quizChecks?: Record<QuizCheckId, boolean>; usd: number }

/** Every gold item against the results (matched by cue index and word). total counts scored (non-excluded) items. */
export function scoreSet(gold: GoldSet, results: ClipGlossResult[], quiz?: PreparedQuizItem[], usd = 0): SetScore {
  const find = (g: GoldItem) => results.find((r) => r.cueIndex === g.cueIndex && r.word.toLowerCase() === g.word.toLowerCase())
  const items = gold.items.map((g) => scoreItem(g, find(g), gold))
  const scored = items.filter((_, i) => !isExcluded(gold.items[i]!))
  const resultScores = results.map((r) => items[gold.items.findIndex((g) => g.cueIndex === r.cueIndex && g.word.toLowerCase() === r.word.toLowerCase())] ?? { ...items[0]!, checks: { ...NONE } })
  return {
    items,
    passed: scored.filter((s) => s.pass).length,
    total: scored.length,
    rejectHits: scored.filter((s) => s.rejectHit).length,
    excludedOk: items.filter((_, i) => isExcluded(gold.items[i]!)).every((s) => s.pass),
    ambiguousFails: scored.filter((s) => s.ambiguous && !s.pass).map((s) => s.id),
    ...(quiz ? { quizChecks: quizChecks(quiz, results, resultScores) } : {}),
    usd,
  }
}
