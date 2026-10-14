import { mergeExpressions, parsePhrases, loadPhrases } from '../src/phrases'

const list = parsePhrases(['# comment', 'scavenger sale :: a sale of collected things', 'get acquainted', 'old-timer :: old car or old person', 'weenie roast', 'wagon train | wagon trains', ''].join('\n'))
const tok = (word: string, lemma = word.toLowerCase()) => ({ word, lemma })
const cues = [
  { index: 12, tokens: [tok('on'), tok('Friday', 'friday'), tok('to'), tok('fix'), tok('up'), tok('that'), tok('scavenger'), tok('sale')] },
  { index: 90, tokens: [tok('a'), tok('group'), tok('to'), tok('get'), tok('acquainted', 'acquaint')] },
  { index: 93, tokens: [tok('Or', 'or'), tok('a'), tok('weenie'), tok('roast')] },
  { index: 66, tokens: [tok('that'), tok('is'), tok('an'), tok('old-timer')] },
  { index: 42, tokens: [tok('the'), tok('sale')] },
]

describe('fixed expressions (phrases-<lang>.txt)', () => {
  it('parses expressions, variants and sense notes; comments and blank lines are ignored', () => {
    expect(list.map((p) => p.lemma)).toEqual(['scavenger sale', 'get acquainted', 'old-timer', 'weenie roast', 'wagon train'])
    expect(list[0]!.note).toBe('a sale of collected things')
    expect(list[4]!.forms).toEqual([['wagon', 'train'], ['wagon', 'trains']])
  })

  it('a highlighted token inside an expression becomes the whole expression (surface span, expression lemma); its partner is not highlighted separately', () => {
    const picked = [
      { cueIndex: 12, word: 'scavenger', lemma: 'scavenger', rank: 10858 }, { cueIndex: 12, word: 'sale', lemma: 'sale', rank: 2121 },
      { cueIndex: 90, word: 'acquainted', lemma: 'acquaint', rank: 6596 },
      { cueIndex: 93, word: 'roast', lemma: 'roast', rank: 3321 }, { cueIndex: 93, word: 'weenie', lemma: 'weenie', rank: 12388 },
      { cueIndex: 66, word: 'old-timer', lemma: 'old-timer', rank: 14058 },
      { cueIndex: 42, word: 'sale', lemma: 'sale', rank: 2121 },
    ]
    expect(mergeExpressions(picked, cues, list)).toEqual([
      { cueIndex: 12, word: 'scavenger sale', lemma: 'scavenger sale', rank: 10858, phrase: true },
      { cueIndex: 90, word: 'get acquainted', lemma: 'get acquainted', rank: 6596, phrase: true },
      { cueIndex: 93, word: 'weenie roast', lemma: 'weenie roast', rank: 12388, phrase: true },
      { cueIndex: 66, word: 'old-timer', lemma: 'old-timer', rank: 14058, phrase: true },
      { cueIndex: 42, word: 'sale', lemma: 'sale', rank: 2121 },
    ])
  })

  it('the committed English list carries the seeds of the plan; the German list exists', async () => {
    const en = await loadPhrases('en')
    for (const p of ['scavenger sale', 'get acquainted', 'old-timer', 'weenie roast', 'fix up', 'wagon train']) expect(en.map((x) => x.lemma)).toContain(p)
    expect(await loadPhrases('de')).toEqual([])
  })
})
