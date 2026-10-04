import { distractorIssue, quizEligible, quizPlanIssues, quizThird, quizWindow, spreadIssues, type Pos, type QuizHighlight } from '../src/index'

/** Quiz v3 rules (LING-002 Gate C round 4): same-pos distractors, spread over the clip. */
const h = (id: number, cueIndex: number, word: string, pos: Pos, gloss = `g-${word}`): QuizHighlight => ({ id, cueIndex, word, lemma: word, pos, gloss, cue: `x ${word} y` })

describe('quiz v3: part of speech', () => {
  it('a distractor with another pos than the answer is an issue (meaning and cloze)', () => {
    const a = h(0, 0, 'tennis', 'noun'), v = h(1, 1, 'supervise', 'verb'), n = h(2, 2, 'wagon', 'noun')
    expect(distractorIssue('meaning', a, v)).toMatch(/pos verb.*noun/)
    expect(distractorIssue('cloze', a, v)).toMatch(/pos verb.*noun/)
    expect(distractorIssue('meaning', a, n)).toBeUndefined()
  })

  it('only highlights with at least 3 other highlights of their pos can be tested', () => {
    const H = [h(0, 0, 'tennis', 'noun'), h(1, 1, 'racket', 'noun'), h(2, 2, 'wagon', 'noun'), h(3, 3, 'roast', 'noun'), h(4, 4, 'swell', 'adjective'), h(5, 5, 'cheap', 'adjective')]
    expect(quizEligible(H).map((x) => x.word)).toEqual(['tennis', 'racket', 'wagon', 'roast'])
  })

  it('quizPlanIssues names a pos mismatch and a target without 3 same-pos peers', () => {
    const H = [h(0, 0, 'tennis', 'noun'), h(1, 1, 'racket', 'noun'), h(2, 2, 'wagon', 'noun'), h(3, 3, 'roast', 'noun'), h(4, 4, 'swell', 'adjective')]
    const bad = quizPlanIssues({ items: [{ kind: 'meaning', highlightId: 0, distractorIds: [1, 2, 4] }] }, H, { meaning: 1, cloze: 0 })
    expect(bad.join(' ')).toMatch(/distractor 4 .*pos adjective/)
    const target = quizPlanIssues({ items: [{ kind: 'meaning', highlightId: 4, distractorIds: [1, 2, 3] }] }, H, { meaning: 1, cloze: 0 })
    expect(target.join(' ')).toMatch(/highlightId 4 .*fewer than 3 other/)
  })
})

describe('quiz v3: spread', () => {
  const spread = { cueMin: 0, cueMax: 119 }
  it('thirds and the window follow the cue range; short clips get a smaller window', () => {
    expect([0, 39, 40, 80, 119].map((c) => quizThird(c, spread))).toEqual([0, 0, 1, 2, 2])
    expect(quizWindow(spread)).toBe(10)
    expect(quizWindow({ cueMin: 0, cueMax: 5 })).toBe(1)
  })

  it('items must touch every third that has a testable highlight', () => {
    const E = [h(0, 5, 'a1', 'noun'), h(1, 50, 'b1', 'noun'), h(2, 100, 'c1', 'noun')]
    expect(spreadIssues([5, 20, 35], E, spread).join(' ')).toMatch(/thirds/)
    expect(spreadIssues([5, 50, 100], E, spread)).toEqual([])
    // only two thirds have testable highlights: two are enough
    expect(spreadIssues([5, 50], E.slice(0, 2), spread)).toEqual([])
  })

  it('no more than 2 items in any 10-cue window', () => {
    const E = [h(0, 5, 'a1', 'noun'), h(1, 50, 'b1', 'noun'), h(2, 100, 'c1', 'noun')]
    expect(spreadIssues([5, 7, 9, 50, 100], E, spread).join(' ')).toMatch(/3 items within cues 5–14/)
    expect(spreadIssues([5, 9, 15, 50, 100], E, spread)).toEqual([])
  })
})
