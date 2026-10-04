import { LEVELS } from '@lingo/contracts'
import type { Lang, Level } from '@lingo/contracts'

export type Answer = 'yes' | 'mostly' | 'no'
/** text is pre-wrapped with '\n', ≤ 2 × 42 characters (a test asserts it). */
export interface PlacementItem { level: Level; text: string }
/** Six lines per language, hand-judged bands A1, A2, A2, B1, B1, B2 (docs/plans/LING-005.md §8; follow-up: check against data/freq-*.txt). */
export const PLACEMENT: Record<Lang, readonly PlacementItem[]> = {
  de: [
    { level: 'A1', text: 'Ich trinke morgens gern Kaffee.' },
    { level: 'A2', text: 'Kannst du mir sagen,\nwann der Zug fährt?' },
    { level: 'A2', text: 'Wir haben am Wochenende\nunsere Eltern besucht.' },
    { level: 'B1', text: 'Obwohl es regnete, sind wir\nspazieren gegangen.' },
    { level: 'B1', text: 'Ich habe mich endlich für\ndie neue Stelle beworben.' },
    { level: 'B2', text: 'Die Verhandlungen wurden\nergebnislos abgebrochen.' },
  ],
  en: [
    { level: 'A1', text: 'I usually drink coffee in the morning.' },
    { level: 'A2', text: 'Could you tell me when\nthe train leaves?' },
    { level: 'A2', text: 'We visited our parents\nlast weekend.' },
    { level: 'B1', text: 'Although it was raining,\nwe went for a walk anyway.' },
    { level: 'B1', text: 'I finally applied for the\nnew job at the hospital.' },
    { level: 'B2', text: 'The negotiations broke down\nwithout reaching an agreement.' },
  ],
}
export const SCORE: Record<Answer, number> = { yes: 1, mostly: 0.5, no: 0 }
export const DEFAULT_LEVEL: Level = 'A2'
const PASS = 0.75

/** Walk the bands present in `items` from A1 up; a band passes at a mean score ≥ 0.75; stop at the first band that does not pass.
 *  Result = the highest passed band, or A1 when A1 does not pass. */
export function placeLevel(items: readonly PlacementItem[], answers: readonly Answer[]): Level {
  if (answers.length !== items.length) throw new Error(`placeLevel: ${answers.length} answers for ${items.length} items`)
  let placed: Level = 'A1'
  for (const level of LEVELS) {
    const scores = items.flatMap((it, i) => (it.level === level ? [SCORE[answers[i]!]] : []))
    if (!scores.length) continue
    if (scores.reduce((a, b) => a + b, 0) / scores.length < PASS) break
    placed = level
  }
  return placed
}
