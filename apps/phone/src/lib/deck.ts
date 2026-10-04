import type { DueWord, Grade } from '@lingo/contracts'
/**
 * The review deck. SM-2 same-session rule (SuperMemo, https://super-memory.com/english/ol/sm2.htm): items graded below "good"
 * (again, hard) come back at the end of today's session until graded good or easy. Only the first grade of a word in a session is
 * posted; repeats are local and never change the schedule. The phone never computes an interval (apps/api/src/lib/sm2.ts does).
 */
export interface DeckCard { word: DueWord; repeat: boolean }
export interface DeckState {
  queue: DeckCard[]; flipped: boolean; posting: boolean; error: boolean; done: boolean
  firstPass: { graded: number; correct: number }   // correct = good | easy on the first grade
}
export type DeckEvent =
  | { type: 'flip' }
  | { type: 'gradeStart' }                         // only when !posting && flipped
  | { type: 'gradeOk'; grade: Grade }
  | { type: 'gradeFail' }
export function isNew(w: DueWord): boolean { return w.reps === 0 && w.lapses === 0 }
export function deckCounts(words: readonly DueWord[]): { due: number; fresh: number } {
  const fresh = words.filter(isNew).length
  return { due: words.length - fresh, fresh }
}
/** Reviewed words first (input order = due asc), then new words; words whose clipSlug === firstClip go first within each group. Stable. */
export function buildDeck(words: readonly DueWord[], firstClip?: string | null): DeckCard[] {
  const rank = (w: DueWord) => (isNew(w) ? 2 : 0) + (firstClip && w.clipSlug === firstClip ? 0 : 1)
  return words.map((w, i) => ({ w, i })).sort((a, b) => rank(a.w) - rank(b.w) || a.i - b.i).map(({ w }) => ({ word: w, repeat: false }))
}
export function initialDeck(cards: DeckCard[]): DeckState {
  return { queue: cards, flipped: false, posting: false, error: false, done: cards.length === 0, firstPass: { graded: 0, correct: 0 } }
}
export function deckReducer(s: DeckState, e: DeckEvent): DeckState {
  switch (e.type) {
    case 'flip': return s.done ? s : { ...s, flipped: true }
    case 'gradeStart': return s.flipped && !s.posting && !s.done ? { ...s, posting: true, error: false } : s
    case 'gradeOk': {
      const [head, ...rest] = s.queue
      if (!head) return s
      const below = e.grade === 'again' || e.grade === 'hard'
      const firstPass = head.repeat ? s.firstPass : { graded: s.firstPass.graded + 1, correct: s.firstPass.correct + (below ? 0 : 1) }
      const queue = below ? [...rest, { word: head.word, repeat: true }] : rest
      return { queue, flipped: false, posting: false, error: false, done: queue.length === 0, firstPass }
    }
    case 'gradeFail': return { ...s, posting: false, error: true }
  }
}
export function needsPost(c: DeckCard): boolean { return !c.repeat }
