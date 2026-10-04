import type { Grade } from '@lingo/contracts'
import { buildDeck, deckCounts, deckReducer, initialDeck, needsPost, type DeckState } from '../src/lib/deck'
import { dueWord, fresh } from './fixtures'

const grade = (s: DeckState, g: Grade) => deckReducer(deckReducer(deckReducer(s, { type: 'flip' }), { type: 'gradeStart' }), { type: 'gradeOk', grade: g })
const ids = (s: DeckState) => s.queue.map((c) => c.word.savedWordId)

describe('deck', () => {
  it('deckCounts separates new words from due words', () => {
    expect(deckCounts([dueWord(), fresh(), dueWord({ reps: 0, lapses: 1 }), fresh()])).toEqual({ due: 2, fresh: 2 })
  })
  it('buildDeck puts reviewed words before new words, keeping due order', () => {
    const [a, b, c, d] = [fresh(), dueWord(), fresh(), dueWord()]
    expect(buildDeck([a!, b!, c!, d!]).map((x) => x.word)).toEqual([b, d, a, c])
    expect(buildDeck([a!]).every((x) => !x.repeat)).toBe(true)
  })
  it('buildDeck puts words from the quiz clip first within each group', () => {
    const a = dueWord({ clipSlug: 'x' }), b = dueWord({ clipSlug: 'quiz' }), c = fresh({ clipSlug: 'x' }), d = fresh({ clipSlug: 'quiz' }), e = dueWord({ clipSlug: 'quiz' })
    expect(buildDeck([a, b, c, d, e], 'quiz').map((x) => x.word)).toEqual([b, e, a, d, c])
    expect(buildDeck([a, b, c, d, e], null).map((x) => x.word)).toEqual([a, b, e, c, d])
  })
  it('flip shows the back; gradeStart is ignored before flip', () => {
    const s = initialDeck(buildDeck([dueWord()]))
    expect(deckReducer(s, { type: 'gradeStart' })).toBe(s)
    const f = deckReducer(s, { type: 'flip' })
    expect(f.flipped).toBe(true)
    expect(deckReducer(f, { type: 'gradeStart' }).posting).toBe(true)
  })
  it('gradeStart is ignored while a grade is posting', () => {
    const p = deckReducer(deckReducer(initialDeck(buildDeck([dueWord()])), { type: 'flip' }), { type: 'gradeStart' })
    expect(deckReducer(p, { type: 'gradeStart' })).toBe(p)
  })
  it('good and easy count as correct on the first pass; again and hard do not', () => {
    let s = initialDeck(buildDeck([dueWord(), dueWord(), dueWord(), dueWord()]))
    for (const g of ['good', 'easy', 'again', 'hard'] as const) s = grade(s, g)
    expect(s.firstPass).toEqual({ graded: 4, correct: 2 })
  })
  it('again and hard put the card back at the end as a repeat', () => {
    const [a, b, c] = [dueWord(), dueWord(), dueWord()]
    let s = grade(initialDeck(buildDeck([a, b, c])), 'again')
    expect(ids(s)).toEqual([b.savedWordId, c.savedWordId, a.savedWordId])
    expect(s.queue.at(-1)!.repeat).toBe(true)
    s = grade(s, 'hard')
    expect(ids(s)).toEqual([c.savedWordId, a.savedWordId, b.savedWordId])
    expect(s.queue.map((x) => x.repeat)).toEqual([false, true, true])
    expect([s.flipped, s.posting, s.done]).toEqual([false, false, false])
  })
  it('a repeat is not posted and does not change the first-pass tally', () => {
    let s = grade(initialDeck(buildDeck([dueWord()])), 'again')
    expect(needsPost(s.queue[0]!)).toBe(false)
    expect(s.firstPass).toEqual({ graded: 1, correct: 0 })
    s = grade(s, 'good')
    expect(s.firstPass).toEqual({ graded: 1, correct: 0 })
  })
  it('a repeat graded hard comes back again; graded good it leaves', () => {
    let s = grade(initialDeck(buildDeck([dueWord()])), 'again')
    s = grade(s, 'hard')
    expect(s.queue).toHaveLength(1)
    expect(s.queue[0]!.repeat).toBe(true)
    s = grade(s, 'good')
    expect(s.queue).toHaveLength(0)
    expect(s.done).toBe(true)
  })
  it('gradeFail keeps the card and the flip and sets error', () => {
    const p = deckReducer(deckReducer(initialDeck(buildDeck([dueWord(), dueWord()])), { type: 'flip' }), { type: 'gradeStart' })
    const f = deckReducer(p, { type: 'gradeFail' })
    expect([f.flipped, f.posting, f.error]).toEqual([true, false, true])
    expect(f.queue).toEqual(p.queue)
    expect(deckReducer(f, { type: 'gradeStart' }).error).toBe(false)
  })
  it('the deck is done when the queue empties; an empty deck starts done', () => {
    expect(initialDeck([]).done).toBe(true)
    const s = grade(initialDeck(buildDeck([dueWord()])), 'easy')
    expect(s.done).toBe(true)
    expect(s.firstPass).toEqual({ graded: 1, correct: 1 })
  })
})
