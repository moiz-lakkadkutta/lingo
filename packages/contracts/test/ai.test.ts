import { Gloss, glossIssues, LANGUAGE_NAMES, QuizPlan, quizCounts, quizPlanIssues, type QuizHighlight, type QuizPlanItem } from '../src/index'

const card = { gloss: 'wait', grammar: 'verb, warten, wartete, hat gewartet', example: 'Wir warten auf den Bus.' }
const ctx = { word: 'warte', lemma: 'warten', cue: 'Ich warte seit zwei Stunden auf dich.' }
const nWords = (n: number) => Array.from({ length: n }, () => 'a').join(' ')

describe('Gloss', () => {
  it('Gloss accepts a 3-field card and rejects extra keys, empty strings, newlines, > 6 gloss words, > 14 grammar words, > 12 example words, > 60/90/120 chars', () => {
    expect(Gloss.parse(card)).toEqual(card)
    expect(Gloss.safeParse({ ...card, extra: 'x' }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, gloss: '' }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, gloss: '   ' }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, example: 'Wir warten\nauf den Bus.' }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, gloss: nWords(6) }).success).toBe(true)
    expect(Gloss.safeParse({ ...card, gloss: nWords(7) }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, grammar: nWords(14) }).success).toBe(true)
    expect(Gloss.safeParse({ ...card, grammar: nWords(15) }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, example: nWords(12) }).success).toBe(true)
    expect(Gloss.safeParse({ ...card, example: nWords(13) }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, gloss: 'x'.repeat(60) }).success).toBe(true)
    expect(Gloss.safeParse({ ...card, gloss: 'x'.repeat(61) }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, grammar: 'x'.repeat(91) }).success).toBe(false)
    expect(Gloss.safeParse({ ...card, example: 'x'.repeat(121) }).success).toBe(false)
    expect(Gloss.safeParse({ gloss: 'wait', grammar: 'verb' }).success).toBe(false)
  })

  it('glossIssues flags a gloss equal to the word or lemma (case-insensitive, trailing period ignored) and passes "hotel (building)"', () => {
    expect(glossIssues(card, ctx)).toEqual([])
    expect(glossIssues({ ...card, gloss: 'Warte' }, ctx)).toHaveLength(1)
    expect(glossIssues({ ...card, gloss: 'warten.' }, ctx)[0]).toMatch(/translation, not a copy/)
    const hotel = { word: 'Hotel', lemma: 'Hotel', cue: 'Das Hotel ist alt.' }
    expect(glossIssues({ gloss: 'hotel', grammar: 'noun, das Hotel, pl. Hotels', example: 'Wir schlafen im Hotel.' }, hotel)).toHaveLength(1)
    expect(glossIssues({ gloss: 'hotel (building)', grammar: 'noun, das Hotel, pl. Hotels', example: 'Wir schlafen im Hotel.' }, hotel)).toEqual([])
  })

  it('glossIssues flags an example that contains neither word nor lemma, and one that equals the cue after whitespace/case/punctuation normalisation', () => {
    const missing = glossIssues({ ...card, example: 'Der Bus kommt bald.' }, ctx)
    expect(missing).toEqual(['example must use the word "warte" or its base form "warten"'])
    expect(glossIssues({ ...card, example: 'Ich WARTE hier.' }, ctx)).toEqual([])
    const copy = glossIssues({ ...card, example: '  ich warte  seit zwei Stunden auf dich!' }, ctx)
    expect(copy).toEqual(['example must be a new sentence, not the subtitle line'])
  })
})

describe('quiz plan', () => {
  it('quizCounts returns 0/0 below 4 highlights, 4/4 at 4, 6/4 at 10 and above', () => {
    expect(quizCounts(0)).toEqual({ meaning: 0, cloze: 0 })
    expect(quizCounts(3)).toEqual({ meaning: 0, cloze: 0 })
    expect(quizCounts(4)).toEqual({ meaning: 4, cloze: 4 })
    expect(quizCounts(5)).toEqual({ meaning: 5, cloze: 4 })
    expect(quizCounts(10)).toEqual({ meaning: 6, cloze: 4 })
    expect(quizCounts(40)).toEqual({ meaning: 6, cloze: 4 })
  })

  it('QuizPlan rejects kinds other than meaning|cloze, non-integer ids and distractor arrays not of length 3', () => {
    const item = { kind: 'meaning', highlightId: 0, distractorIds: [1, 2, 3] }
    expect(QuizPlan.safeParse({ items: [item] }).success).toBe(true)
    expect(QuizPlan.safeParse({ items: [{ ...item, kind: 'listening' }] }).success).toBe(false)
    expect(QuizPlan.safeParse({ items: [{ ...item, highlightId: 1.5 }] }).success).toBe(false)
    expect(QuizPlan.safeParse({ items: [{ ...item, highlightId: -1 }] }).success).toBe(false)
    expect(QuizPlan.safeParse({ items: [{ ...item, distractorIds: [1, 2] }] }).success).toBe(false)
    expect(QuizPlan.safeParse({ items: [{ ...item, distractorIds: [1, 2, 3, 4] }] }).success).toBe(false)
    expect(QuizPlan.safeParse({ items: [{ ...item, distractorIds: [1, 2.5, 3] }] }).success).toBe(false)
    expect(QuizPlan.safeParse({ items: [] }).success).toBe(false)
    expect(QuizPlan.safeParse({ items: [{ ...item, extra: true }] }).success).toBe(false)
  })

  it('quizPlanIssues flags out-of-range ids, self-distractors, duplicate distractors, wrong per-kind counts, a highlightId repeated within a kind, and duplicate glosses/words among options', () => {
    const words = ['warte', 'suche', 'rufe', 'vergesse', 'Stunde']
    const glosses = ['wait', 'look for', 'call', 'forget', 'hour']
    const H: QuizHighlight[] = words.map((w, id) => ({ id, cueIndex: id, word: w, gloss: glosses[id]!, cue: `Ich ${w} jetzt.` }))
    const counts = { meaning: 1, cloze: 1 }
    const m = (highlightId: number, distractorIds: number[]): QuizPlanItem => ({ kind: 'meaning', highlightId, distractorIds })
    const c = (highlightId: number, distractorIds: number[]): QuizPlanItem => ({ kind: 'cloze', highlightId, distractorIds })
    const ok = { items: [m(0, [1, 2, 3]), c(0, [1, 2, 4])] }
    expect(quizPlanIssues(ok, H, counts)).toEqual([])

    expect(quizPlanIssues({ items: [m(9, [1, 2, 3]), c(0, [1, 2, 4])] }, H, counts).join()).toMatch(/9/)
    expect(quizPlanIssues({ items: [m(0, [1, 2, 7]), c(0, [1, 2, 4])] }, H, counts).length).toBeGreaterThan(0)
    expect(quizPlanIssues({ items: [m(0, [0, 2, 3]), c(0, [1, 2, 4])] }, H, counts).length).toBeGreaterThan(0)
    expect(quizPlanIssues({ items: [m(0, [1, 1, 3]), c(0, [1, 2, 4])] }, H, counts).length).toBeGreaterThan(0)
    expect(quizPlanIssues({ items: [m(0, [1, 2, 3])] }, H, counts).join()).toMatch(/cloze/)
    expect(quizPlanIssues({ items: [m(0, [1, 2, 3]), m(1, [0, 2, 3]), c(0, [1, 2, 4])] }, H, counts).join()).toMatch(/meaning/)
    expect(quizPlanIssues({ items: [m(0, [1, 2, 3]), m(0, [1, 2, 4]), c(0, [1, 2, 4])] }, H, { meaning: 2, cloze: 1 }).join()).toMatch(/repeat/)

    const dupGloss = H.map((h) => (h.id === 3 ? { ...h, gloss: ' WAIT ' } : h))
    expect(quizPlanIssues(ok, dupGloss, counts).join()).toMatch(/gloss/)
    const dupWord = H.map((h) => (h.id === 4 ? { ...h, word: 'Suche' } : h))
    expect(quizPlanIssues(ok, dupWord, counts).join()).toMatch(/word/)
  })

  it('LANGUAGE_NAMES covers de, en, tr, ar, uk', () => {
    for (const code of ['de', 'en', 'tr', 'ar', 'uk']) expect(LANGUAGE_NAMES[code]).toBeTruthy()
    expect(LANGUAGE_NAMES.de).toBe('German')
  })
})
