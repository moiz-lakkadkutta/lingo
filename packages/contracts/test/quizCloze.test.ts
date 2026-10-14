import { distractorIssue, quizPlanIssues, type Pos, type QuizHighlight } from '../src/index'

/** Quiz v3 cloze checks (LING-002 Gate C round 5): grammar giveaways and a second true answer. */
type Extra = Partial<Pick<QuizHighlight, 'number' | 'gender'>>
const h = (id: number, word: string, cue: string, pos: Pos = 'noun', extra: Extra = {}): QuizHighlight => ({ id, cueIndex: id, word, lemma: word.toLowerCase(), pos, gloss: `g${id}x${word}`, cue, ...extra })
const en = { lang: 'en' as const }

describe('cloze: grammar giveaway', () => {
  it('"an ____" rejects a consonant-initial distractor, "a ____" a vowel-initial one', () => {
    const answer = h(0, 'old-timer', 'that is an old-timer.')
    expect(distractorIssue('cloze', answer, h(1, 'refreshments', 'x'), en)).toMatch(/"an"/)
    expect(distractorIssue('cloze', answer, h(2, 'activity', 'x'), en)).toBeUndefined()
    const a = h(3, 'roast', 'Or a weenie roast.')
    const b = h(4, 'wagon', 'Good picture, wagon train.')
    expect(distractorIssue('cloze', h(5, 'sale', 'that scavenger sale?'), h(6, 'expense', 'x'), en)).toBeUndefined()
    expect(distractorIssue('cloze', h(7, 'wagon', 'I saw a wagon.'), h(8, 'activity', 'x'), en)).toMatch(/"a"/)
    expect(distractorIssue('cloze', a, b, en)).toBeUndefined()
  })

  it('singular and plural must match (card forms, or a trailing -s for English words without one)', () => {
    const answer = h(0, 'old-timer', 'that is an old-timer.', 'noun', { number: 'sg' })
    expect(distractorIssue('cloze', answer, h(1, 'activities', 'x', 'noun', { number: 'pl' }), en)).toMatch(/plural/)
    expect(distractorIssue('cloze', answer, h(2, 'expense', 'x', 'noun', { number: 'sg' }), en)).toBeUndefined()
    expect(distractorIssue('cloze', answer, h(3, 'others', 'x', 'noun'), en)).toMatch(/plural/)
  })

  it('German: an article before the blank rejects a distractor of another gender', () => {
    const answer = h(0, 'Zug', 'Der Zug steht am Bahnhof.', 'noun', { gender: 'der', number: 'sg' })
    expect(distractorIssue('cloze', answer, h(1, 'Stunde', 'x', 'noun', { gender: 'die', number: 'sg' }), { lang: 'de' })).toMatch(/article "Der"/)
    expect(distractorIssue('cloze', answer, h(2, 'Schlüssel', 'x', 'noun', { gender: 'der', number: 'sg' }), { lang: 'de' })).toBeUndefined()
  })
})

describe('cloze: second true answer', () => {
  const clipCues = ["Just a minute, Jeff. I'll get my tennis racket.", "Wonder if she'd like to\ngo to a baseball game.", 'you loafer. What are you doing']
  const baseball = h(0, 'baseball', clipCues[1]!)
  it('item 10: "go to a ____ game." rejects "tennis", which the clip uses as a noun modifier ("tennis racket")', () => {
    expect(distractorIssue('cloze', baseball, h(1, 'tennis', clipCues[0]!), { lang: 'en', clipCues })).toMatch(/noun modifier/)
    expect(distractorIssue('cloze', baseball, h(2, 'loafer', clipCues[2]!), { lang: 'en', clipCues })).toBeUndefined()
    expect(distractorIssue('cloze', baseball, h(3, 'racket', clipCues[0]!), { lang: 'en', clipCues })).toBeUndefined()
  })

  it('rejects a distractor that the clip shows right before the word after the blank, or right after the word before it', () => {
    const cues = ['We need a new lamp.', 'It was a long day.', 'My lamp post broke.']
    const answer = h(0, 'lamp', cues[0]!) // "a new ____." : before = "new"
    expect(distractorIssue('cloze', answer, h(1, 'day', cues[1]!), { lang: 'en', clipCues: [...cues, 'a new day'] })).toMatch(/after "new"/)
  })

  it('quizPlanIssues applies the cloze checks with the clip context', () => {
    const H = [baseball, h(1, 'tennis', clipCues[0]!), h(2, 'loafer', clipCues[2]!), h(3, 'racket', clipCues[0]!), h(4, 'wagon', 'Good picture, wagon train.')]
    const issues = quizPlanIssues({ items: [{ kind: 'cloze', highlightId: 0, distractorIds: [1, 2, 3] }] }, H, { meaning: 0, cloze: 1 }, { lang: 'en', clipCues })
    expect(issues.join(' ')).toMatch(/distractor 1 .*noun modifier/)
  })
})
