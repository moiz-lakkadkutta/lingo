import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DATA_DIR, FREQ_TOKEN, loadFreqList, mergeByLemma, parseFreqList, rankFn } from '../src/freq'
import { creditLemmas } from '../scripts/build-freq'

describe('parseFreqList', () => {
  it('rank equals line number, ignores blanks and comments', () => {
    const list = parseFreqList('# header\nder\n\n ich \nsein\n')
    expect(list).toEqual(['der', 'ich', 'sein'])
    expect(rankFn(list)('sein')).toBe(3)
    expect(rankFn(list)('nix')).toBeUndefined()
  })
})
describe('rankFn', () => {
  it('is case-insensitive', () => {
    const r = rankFn(['der', 'stunde'])
    expect(r('Stunde')).toBe(2); expect(r('stunde')).toBe(2); expect(r('STUNDE')).toBe(2)
  })
})
describe('mergeByLemma', () => {
  it('sums counts across forms and orders by count then first seen', () => {
    const m = mergeByLemma([{ word: 'habe', count: 50, lemma: 'haben' }, { word: 'der', count: 60, lemma: 'der' }, { word: 'hat', count: 40, lemma: 'haben' }, { word: 'haben', count: 30, lemma: 'Haben' }, { word: 'ich', count: 120, lemma: 'ich' }, { word: 'du', count: 60, lemma: 'du' }])
    expect(m).toEqual([{ lemma: 'haben', count: 120 }, { lemma: 'ich', count: 120 }, { lemma: 'der', count: 60 }, { lemma: 'du', count: 60 }])
  })
})
describe('creditLemmas (build-freq)', () => {
  const k = (lemma: string, known = true) => ({ lemma, known })
  it('credits an ambiguous German form to the noun and, when its other forms attest it, the verb; never prefers the noun alone', () => {
    const out = creditLemmas([
      { word: 'hat', count: 1000, low: k('haben'), capped: k('Hat') }, { word: 'habe', count: 800, low: k('haben'), capped: k('Habe') }, { word: 'hatte', count: 500, low: k('haben'), capped: k('haben') },
      { word: 'haus', count: 1000, low: k('hausen'), capped: k('Haus') }, { word: 'haust', count: 5, low: k('hausen'), capped: k('hausen') }, { word: 'häuser', count: 100, low: k('Haus'), capped: k('Haus') },
      { word: 'bitte', count: 1000, low: k('bitten'), capped: k('Bitte') }, { word: 'gebeten', count: 40, low: k('bitten'), capped: k('bitten') },
    ])
    const by = (w: string) => out.filter((o) => o.word === w).map((o) => o.lemma)
    expect(by('hat')).toEqual(['Hat', 'haben']) // verb attested by hatte (500 ≥ 1 % of 1000)
    expect(by('haus')).toEqual(['Haus']) // hausen has only haust = 5 < 1 % of 1000
    expect(by('bitte')).toEqual(['Bitte', 'bitten']) // gebeten = 40 ≥ 1 % of 1000
    expect(by('hatte')).toEqual(['haben']); expect(by('häuser')).toEqual(['Haus'])
  })
  it('credits only the capitalised lemma when the lowercase lookup learned nothing, and only the lowercase lemma when the capitalised one is unknown or the same', () => {
    const out = creditLemmas([
      { word: 'stunden', count: 100, low: k('stunden'), capped: k('Stunde') }, { word: 'mann', count: 100, low: k('mann'), capped: k('Mann') },
      { word: 'xyz', count: 100, low: k('xyz', false), capped: k('Xyz', false) }, { word: 'wait', count: 100, low: k('wait') },
    ])
    expect(out).toEqual([{ word: 'stunden', count: 100, lemma: 'Stunde' }, { word: 'mann', count: 100, lemma: 'mann' }, { word: 'xyz', count: 100, lemma: 'xyz' }, { word: 'wait', count: 100, lemma: 'wait' }])
  })
})
describe('FREQ_TOKEN', () => {
  it('rejects digits, clitics and punctuation, accepts umlauts, hyphens and inner apostrophes', () => {
    for (const bad of ['2015', "'s", "'t", '...', '-', 'a1', '', '?']) expect(FREQ_TOKEN.test(bad)).toBe(false)
    for (const good of ['über', 'u-bahn', "don't", 'straße', 'l’amour', 'ja']) expect(FREQ_TOKEN.test(good)).toBe(true)
  })
})
describe('data', () => {
  it('freq-de.txt and freq-en.txt have exactly 20000 unique, lowercase, FREQ_TOKEN lines and a meta.json with sha256 + licence', async () => {
    for (const lang of ['de', 'en'] as const) {
      const raw = await readFile(resolve(DATA_DIR, `freq-${lang}.txt`), 'utf8')
      const lines = raw.split('\n')
      expect(lines.at(-1)).toBe('') // trailing LF
      const list = lines.slice(0, -1)
      expect(list.length).toBe(20000)
      expect(new Set(list).size).toBe(20000)
      for (const l of list) { expect(l).toBe(l.toLowerCase()); expect(FREQ_TOKEN.test(l)).toBe(true) }
      expect(await loadFreqList(lang)).toEqual(list)
      const meta = JSON.parse(await readFile(resolve(DATA_DIR, `freq-${lang}.meta.json`), 'utf8'))
      expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(meta.license).toBe('CC BY-SA 4.0')
      expect(meta.source).toContain('hermitdave/FrequencyWords')
      expect(meta.simplemma).toBe('2.0.0')
      expect(meta.outputLemmas).toBe(20000)
    }
  })
  it('sanity ranks: de warten/stunde/anrufen and en wait/hour/call are all ≤ 4000', async () => {
    const de = rankFn(await loadFreqList('de')), en = rankFn(await loadFreqList('en'))
    for (const w of ['warten', 'stunde', 'anrufen']) { expect(de(w)).toBeDefined(); expect(de(w)!).toBeLessThanOrEqual(4000) }
    for (const w of ['wait', 'hour', 'call']) { expect(en(w)).toBeDefined(); expect(en(w)!).toBeLessThanOrEqual(4000) }
  })
  it('sanity ranks: everyday German nouns rank ≤ 1500 and the spurious verb lemmas simplemma gives their lowercase forms stay out of the top 1000', async () => {
    const de = rankFn(await loadFreqList('de'))
    for (const w of ['haus', 'tisch', 'schlüssel', 'bett', 'schule', 'zimmer', 'glück']) { expect(de(w), w).toBeDefined(); expect(de(w)!, w).toBeLessThanOrEqual(1500) }
    for (const w of ['hausen', 'zimmern', 'schlüsseln']) expect(de(w) === undefined || de(w)! > 1000, w).toBe(true)
    expect(de('haben')!).toBeLessThanOrEqual(20) // the verb keeps its count even though "Hat" is a known noun
  })
})
