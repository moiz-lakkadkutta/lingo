import { pickHighlights, clipLevel, coverageRank, isCountable, isNumeral } from '../src/highlights'

describe('highlights', () => {
  it('pickHighlights never picks a token whose ASR confidence is below 0.4, but the token still counts for the clip level', () => {
    const r = (l: string) => ({ sal: 4972, sale: 2121, the: 3 } as Record<string, number>)[l]
    const tokens = [{ word: 'the', lemma: 'the', asr: 0.99 }, { word: 'sal', lemma: 'sal', asr: 0.158 }]
    const skipped: string[] = []
    expect(pickHighlights([{ index: 0, tokens }], r, 'A2', 1, undefined, (i, t) => skipped.push(`${i}|${t.word}`))).toEqual([])
    expect(skipped).toEqual(['0|sal'])
    expect(pickHighlights([{ index: 0, tokens: tokens.map((t) => ({ ...t, asr: undefined })) }], r, 'A2', 1).map((h) => h.word)).toEqual(['sal'])
    expect(clipLevel(tokens, r)).toBe(clipLevel(tokens.map((t) => ({ ...t, asr: undefined })), r))
    expect(coverageRank(tokens, r)).toBe(4972)
    // exclude (asrSuspects keys) drops a candidate without a confidence
    expect(pickHighlights([{ index: 7, tokens: [{ word: 'Sal', lemma: 'sal' }] }], r, 'A2', 1, new Set(['7|sal']))).toEqual([])
  })
  it('pickHighlights keeps a correct word at confidence 0.519 (old-timer)', () => {
    const r = (l: string) => (l === 'old-timer' ? 14058 : undefined)
    expect(pickHighlights([{ index: 66, tokens: [{ word: 'old-timer', lemma: 'old-timer', asr: 0.519 }] }], r, 'A2', 1)).toEqual([{ cueIndex: 66, word: 'old-timer', lemma: 'old-timer', rank: 14058 }])
  })
  const rank = (l: string) => ({ ich: 1, warte: 1500, seit: 300, zwei: 200, stunden: 900, auf: 40, dich: 120, angerufen: 2500, abgenommen: 3800, berlin: undefined })[l]
  it('picks words at or above the floor of the band above the level (no ceiling), skipping names and numbers, ≤ 2 per cue', () => {
    const hl = pickHighlights([{ index: 0, tokens: 'Ich warte seit zwei Stunden auf dich'.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase() })) }, { index: 1, tokens: 'Berlin 1989 angerufen abgenommen'.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase(), name: w === 'Berlin' })) }], rank, 'A1', 1)
    expect(hl.map((h) => h.lemma)).toEqual(['warte', 'angerufen', 'abgenommen']) // floor-only band (docs/decisions/0008 decision 9)
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

describe('isNumeral: number words are never highlighted (review M5)', () => {
  const yes = (ws: string[]) => { for (const w of ws) expect(isNumeral(w), w).toBe(true) }
  const no = (ws: string[]) => { for (const w of ws) expect(isNumeral(w), w).toBe(false) }
  it('English teens, including fifteen', () => yes(['thirteen', 'fourteen', 'fifteen', 'Sixteen', 'seventeen', 'eighteen', 'nineteen']))
  it('English tens, hundred, thousand, million, billion, trillion, dozen and plurals', () =>
    yes(['twenty', 'forty', 'eighty', 'ninety', 'hundred', 'hundreds', 'thousands', 'million', 'millions', 'billion', 'billions', 'trillion', 'dozen', 'dozens', 'twenties', 'fifties', 'twofold']))
  it('English ordinals beyond tenth', () =>
    yes(['eleventh', 'twelfth', 'thirteenth', 'fifteenth', 'nineteenth', 'twentieth', 'fortieth', 'ninetieth', 'hundredth', 'thousandth', 'millionth', 'billionth']))
  it('English hyphenated compounds', () => yes(['twenty-one', 'Forty-Two', 'twenty-first', 'ninety-ninth', 'one-hundred']))
  it('German compounds, including zweihundert', () =>
    yes(['zweihundert', 'zweitausend', 'einundzwanzig', 'fünfundzwanzig', 'dreihundertvierzig', 'zweihunderteinundzwanzig', 'einhundert', 'eintausend', 'dreizehn', 'sechzehn', 'siebzehn', 'Dreissig', 'zwo']))
  it('German ordinals, including elfte and compounds', () =>
    yes(['elfte', 'zwölften', 'dreizehnte', 'neunzehnter', 'zwanzigste', 'einundzwanzigsten', 'hundertste', 'tausendstes', 'zweihundertste', 'hundertdritte', 'sechste', 'zweite', 'vierten']))
  it('German Million(en), Milliarde(n), Billion(en), Dutzend and Hunderte/Tausende', () =>
    yes(['Million', 'Millionen', 'Milliarde', 'Milliarden', 'Billion', 'Billionen', 'Dutzend', 'Dutzende', 'Hunderte', 'Tausenden', 'zweimal', 'hundertfach', 'millionste']))
  it('ordinary words that start or end like numbers stay highlightable', () =>
    no(['einfach', 'einte', 'Sieb', 'dreiste', 'dreisten', 'Viertel', 'elfen', 'Zweifel', 'Achtung', 'seconds', 'often', 'tense', 'tenant', 'ones', 'none', 'someone', 'nine-to-five', 'second-hand', 'Einsamkeit', 'Hundertwasser', 'Neunauge', 'Dutzendware', 'ein', 'und']))
})
