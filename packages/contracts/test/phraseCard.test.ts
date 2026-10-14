import { distractorIssue, GlossCard, glossCardIssues, preciseFirst, PreparedHighlight, pruneCard, quizEligible, type CardContext, type Pos, type QuizHighlight } from '../src/index'

/** LING-002 Gate C round 6: fixed expressions as one target (pos "phrase"), most precise gloss first. */
const ids = (issues: string[]) => issues.map((i) => i.slice(0, i.indexOf(':')))
const ctx = (word: string, cue: string, nativeCue?: string): CardContext => ({ word, lemma: word, cue, lang: 'en', native: 'de', phrase: true, ...(nativeCue ? { nativeCue } : {}) })
const card = (over: Partial<GlossCard>): GlossCard => GlossCard.parse({ sense: 'a sale of collected things', pos: 'phrase', gloss: ['Wohltätigkeitsbasar'], register: 'neutral', example: 'The scavenger sale raised a lot of money.', ...over })

describe('phrase cards', () => {
  it('pos "phrase" is valid, carries no grammar forms and needs none', () => {
    const c = card({ plural: 'sales' })
    expect(pruneCard(c, 'en').plural).toBeUndefined()
    expect(glossCardIssues(c, ctx('scavenger sale', 'to fix up that scavenger sale?'))).toEqual([])
  })

  it('G-LEN allows up to 4 words per gloss for a phrase target', () => {
    const c4 = card({ gloss: ['Basar mit gesammelten Sachen'] })
    expect(glossCardIssues(c4, ctx('scavenger sale', 'to fix up that scavenger sale?'))).toEqual([])
    const c5 = { ...card({}), gloss: ['ein Basar mit gesammelten alten Sachen'] } // also over the schema's 4-word limit
    expect(ids(glossCardIssues(c5, ctx('scavenger sale', 'to fix up that scavenger sale?')))).toContain('G-LEN')
  })

  it('G-COMPOUND, G-SOURCE and G-NEIGHBOUR treat the whole span as the target', () => {
    const wt = ctx('wagon train', 'Good picture, wagon train.', 'Gutes Bild, Wagenzug.')
    expect(glossCardIssues(card({ gloss: ['Planwagenzug', 'Wagenzug'], example: 'The wagon train crossed the river.' }), wt)).toEqual([])
    const acq = ctx('get acquainted', 'with a group, to get acquainted.', 'sich mit einer Gruppe kennen zu lernen.')
    expect(glossCardIssues(card({ gloss: ['sich kennenlernen'], example: 'We got acquainted at the party.' }), acq)).toEqual([])
  })

  it('the example may use any form of the phrase (X-USES looks for one of its words)', () => {
    const acq = ctx('get acquainted', 'with a group, to get acquainted.')
    expect(glossCardIssues(card({ gloss: ['sich kennenlernen'], example: 'We got acquainted at the party.' }), acq)).toEqual([])
  })

  it('PreparedHighlight may carry phrase: true', () => {
    expect(PreparedHighlight.parse({ cueIndex: 12, word: 'scavenger sale', lemma: 'scavenger sale', rank: 10858, phrase: true }).phrase).toBe(true)
  })
})

describe('phrases in the quiz', () => {
  const h = (id: number, word: string, pos: Pos): QuizHighlight => ({ id, cueIndex: id * 20, word, lemma: word, pos, gloss: `G${id}${word}`, cue: `x ${word} y` })
  it('a phrase takes distractors from other phrases, or from nouns when fewer than 3 phrases exist', () => {
    const H = [h(0, 'scavenger sale', 'phrase'), h(1, 'weenie roast', 'phrase'), h(2, 'tennis', 'noun'), h(3, 'wagon', 'noun'), h(4, 'loafer', 'noun'), h(5, 'swell', 'adjective')]
    expect(quizEligible(H).map((x) => x.word)).toContain('scavenger sale')
    expect(distractorIssue('meaning', H[0]!, H[2]!)).toBeUndefined()
    expect(distractorIssue('meaning', H[0]!, H[5]!)).toMatch(/pos adjective/)
    // a noun answer never gets a phrase distractor
    expect(distractorIssue('meaning', H[2]!, H[1]!)).toMatch(/pos phrase/)
  })
  it('phrases get no cloze items', () => {
    const H = [h(0, 'scavenger sale', 'phrase'), h(1, 'weenie roast', 'phrase'), h(2, 'wagon train', 'phrase'), h(3, 'get acquainted', 'phrase')]
    expect(distractorIssue('cloze', H[0]!, H[1]!)).toMatch(/phrase.*no cloze/)
  })
})

describe('most precise gloss first', () => {
  it('moves a compound that ends with an earlier, more general gloss in front of it', () => {
    expect(preciseFirst(['Nadel', 'Pinnnadel'])).toEqual(['Pinnnadel', 'Nadel'])
    expect(preciseFirst(['Schläger', 'Tennisschläger'])).toEqual(['Tennisschläger', 'Schläger'])
    expect(preciseFirst(['Verkauf', 'Ausverkauf'])).toEqual(['Verkauf', 'Ausverkauf']) // the planner keeps "Verkauf"
    expect(preciseFirst(['Reißzwecke', 'Nadel'])).toEqual(['Reißzwecke', 'Nadel'])
  })
})
