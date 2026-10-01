import { pickHighlights, clipLevel, coverageRank, isCountable, isNumeral } from '../src/highlights'

describe('highlights', () => {
  const rank = (l: string) => ({ ich: 1, warte: 1500, seit: 300, zwei: 200, stunden: 900, auf: 40, dich: 120, angerufen: 2500, abgenommen: 3800, berlin: undefined })[l]
  it('picks words in the band above the level, skipping names and numbers, ≤ 2 per cue', () => {
    const hl = pickHighlights([{ index: 0, tokens: 'Ich warte seit zwei Stunden auf dich'.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase() })) }, { index: 1, tokens: 'Berlin 1989 angerufen abgenommen'.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase(), name: w === 'Berlin' })) }], rank, 'A1', 1)
    expect(hl.map((h) => h.lemma)).toEqual(['warte'])
    const b1 = pickHighlights([{ index: 1, tokens: 'Berlin angerufen abgenommen'.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase(), name: w === 'Berlin' })) }], rank, 'A2', 1)
    expect(b1.map((h) => h.lemma)).toEqual(['angerufen', 'abgenommen'])
  })
  it('assigns clip level from 95 % coverage', () => {
    expect(clipLevel('ich seit zwei auf dich ich seit zwei auf dich ich seit zwei auf dich ich seit zwei auf dich warte warte'.split(' ').map((w) => ({ word: w, lemma: w })), rank)).toBe('A2')
  })
  it('keeps a capitalised German noun whose lemma differs from its surface form', () => {
    const r = (l: string) => (l === 'Stunde' ? 1500 : undefined)
    const hl = pickHighlights([{ index: 0, tokens: [{ word: 'Stunden', lemma: 'Stunde', name: false }] }], r, 'A1', 1)
    expect(hl).toEqual([{ cueIndex: 0, word: 'Stunden', lemma: 'Stunde', rank: 1500 }])
  })
  it('never highlights a token flagged as a name even when it has a rank in band', () => {
    const r = (l: string) => (l === 'Berlin' ? 1200 : undefined)
    expect(pickHighlights([{ index: 0, tokens: [{ word: 'Berlin', lemma: 'Berlin', name: true }] }], r, 'A1', 1)).toEqual([])
    expect(pickHighlights([{ index: 0, tokens: [{ word: 'Berlin', lemma: 'Berlin', name: false }] }], r, 'A1', 1)).toHaveLength(1)
  })
  it('never highlights number words (dreimal, zwanzig, twice)', () => {
    const r = () => 1500
    const cue = (words: string) => [{ index: 0, tokens: words.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase() })) }]
    expect(pickHighlights(cue('dreimal zwanzig Zwölf hundert tausend erste zweiten Dritter vierfach Null'), r, 'A1', 1)).toEqual([])
    expect(pickHighlights(cue('twice thrice twenty Twelve hundred thousand first tenth once'), r, 'A1', 1)).toEqual([])
    expect(pickHighlights(cue('dreimal Stunden'), r, 'A1', 1).map((h) => h.word)).toEqual(['Stunden'])
    for (const w of ['dreimal', 'Zwanzig', 'einmal', 'zehnte', 'siebten', 'twice', 'Twenty', 'ninth', 'once']) expect(isNumeral(w), w).toBe(true)
    for (const w of ['Stunden', 'eintreten', 'einsam', 'zweifel', 'nine-to-five', 'ones', 'firstly', 'achtung', 'neunzehn']) expect(isNumeral(w), w).toBe(w === 'neunzehn')
  })
  it('caps highlighted cues at 40 %', () => {
    const suffix = (i: number) => String.fromCharCode(97 + i).repeat(3)
    const cues = Array.from({ length: 10 }, (_, i) => ({ index: i, tokens: [{ word: `wort${suffix(i)}`, lemma: `wort${suffix(i)}` }, { word: `ding${suffix(i)}`, lemma: `ding${suffix(i)}` }] }))
    const r = (l: string) => (l.startsWith('wort') ? 1200 : 1300)
    const hl = pickHighlights(cues, r, 'A1')
    expect(new Set(hl.map((h) => h.cueIndex)).size).toBeLessThanOrEqual(4)
    expect(new Set(hl.map((h) => h.cueIndex)).size).toBe(4)
    for (const i of new Set(hl.map((h) => h.cueIndex))) expect(hl.filter((h) => h.cueIndex === i).length).toBeLessThanOrEqual(2)
  })
  it('coverageRank returns the 95th-percentile rank', () => {
    const tokens = [...Array.from({ length: 19 }, (_, i) => ({ word: `w${i}`, lemma: `w${i}` })), { word: 'x', lemma: 'unknown' }]
    const r = (l: string) => (l.startsWith('w') ? Number(l.slice(1)) + 1 : undefined)
    expect(coverageRank(tokens, r)).toBe(19)
    expect(coverageRank([{ word: 'x', lemma: 'unknown' }], r)).toBe(99999)
  })
})

describe('isCountable (input to clipLevel / coverageRank)', () => {
  it('drops names, digit tokens and number words, the same as pickHighlights', () => {
    const toks = ['Ich', 'habe', 'dreimal', 'zwanzig', '1989', 'Anna', 'angerufen', 'einsam'].map((w) => ({ word: w, lemma: w.toLowerCase(), name: w === 'Anna' }))
    expect(toks.filter(isCountable).map((t) => t.word)).toEqual(['Ich', 'habe', 'angerufen', 'einsam'])
  })
})
