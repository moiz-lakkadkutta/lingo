import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { COMMON_RANK, isName, loadNames, rankOf } from '../src/names'
import { DATA_DIR, loadFreqList, rankFn } from '../src/freq'

const EN_RANKS: Record<string, number | undefined> = { wait: 300, london: undefined, pete: 1617, listen: 186, let: 500, i: 10, xanthippe: undefined }
const en = { lang: 'en' as const, rank: (l: string) => EN_RANKS[l.toLowerCase()], list: new Set<string>() }
const de = (rank: (l: string) => number | undefined = () => undefined) => ({ lang: 'de' as const, rank, list: new Set(['Anna', 'Berlin']) })

describe('isName', () => {
  it('en: capitalised mid-sentence word is a name', () => { expect(isName({ word: 'London', lemma: 'London', known: true, sentenceInitial: false }, en)).toBe(true) })
  it('en: sentence-initial known word is not a name', () => { expect(isName({ word: 'Wait', lemma: 'wait', known: true, sentenceInitial: true }, en)).toBe(false) })
  it('en: sentence-initial unranked capitalised word is a name', () => { expect(isName({ word: 'Xanthippe', lemma: 'Xanthippe', known: false, sentenceInitial: true }, en)).toBe(true) })
  it('en: a capitalised A1 word mid-sentence is vocabulary, not a name', () => {
    expect(COMMON_RANK).toBe(1000)
    expect(isName({ word: 'Listen', lemma: 'listen', known: true, sentenceInitial: false }, en)).toBe(false)
    expect(isName({ word: 'Pete', lemma: 'Pete', known: true, sentenceInitial: false }, en)).toBe(true) // rank 1617 ≥ 1000
    expect(isName({ word: 'Pete', lemma: 'Pete', known: true, sentenceInitial: true }, en)).toBe(false) // ranked and sentence-initial
    expect(isName({ word: 'Pete', lemma: 'Pete', known: true, sentenceInitial: true }, { ...en, list: new Set(['Pete']) })).toBe(true) // unless listed
  })
  it('en: contractions rank by their stem and are never names', () => {
    expect(isName({ word: "I'm", lemma: "I'm", known: false, sentenceInitial: false }, en)).toBe(false)
    expect(isName({ word: "Let's", lemma: "Let's", known: false, sentenceInitial: true }, en)).toBe(false)
    expect(rankOf("I'm", "I'm", en.rank)).toBe(10)
    expect(rankOf("Let's", 'let', en.rank)).toBe(500)
    expect(rankOf('Xanthippe', 'Xanthippe', en.rank)).toBeUndefined()
  })
  it('single letters and I are never names in either language', () => {
    for (const ctx of [en, de()]) for (const word of ['A', 'N', "N's", 'I', "I'm"]) for (const sentenceInitial of [true, false]) {
      expect(isName({ word, lemma: word, known: false, sentenceInitial }, ctx), `${ctx.lang} ${word}`).toBe(false)
    }
  })
  it('en: sentence-initial known word that is in the list is a name', () => {
    const ctx = { ...en, list: new Set(['Sarah']) }
    expect(isName({ word: 'Sarah', lemma: 'Sarah', known: true, sentenceInitial: true }, ctx)).toBe(true)
    expect(isName({ word: 'Wait', lemma: 'wait', known: true, sentenceInitial: true }, ctx)).toBe(false)
  })
  it('en: "I" is never a name', () => {
    expect(isName({ word: 'I', lemma: 'I', known: true, sentenceInitial: false }, en)).toBe(false)
    expect(isName({ word: 'I', lemma: 'I', known: true, sentenceInitial: true }, en)).toBe(false)
  })
  it('de: listed name is a name', () => { expect(isName({ word: 'Anna', lemma: 'Anna', known: true, sentenceInitial: false }, de((l) => (l === 'anna' ? 900 : undefined)))).toBe(true) })
  it('de: capitalised, unchanged lemma, no rank → name', () => { expect(isName({ word: 'Zwiebelkuchen', lemma: 'Zwiebelkuchen', known: true, sentenceInitial: false }, de())).toBe(true) })
  it('de: ordinary noun with a rank is not a name', () => {
    expect(isName({ word: 'Bahnhof', lemma: 'Bahnhof', known: true, sentenceInitial: false }, de((l) => (l === 'bahnhof' ? 1800 : undefined)))).toBe(false)
    expect(isName({ word: 'Stunden', lemma: 'Stunde', known: true, sentenceInitial: false }, de())).toBe(false) // inflected → not a name even without a rank
    expect(isName({ word: 'warte', lemma: 'warten', known: true, sentenceInitial: false }, de())).toBe(false)
  })
})

describe('loadNames', () => {
  it('ignores comments and blank lines; missing file gives an empty set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lingo-names-'))
    await writeFile(join(dir, 'names.txt'), '# comment\n\n  Anna \nBerlin\n\n# another\n')
    expect([...(await loadNames(join(dir, 'names.txt')))]).toEqual(['Anna', 'Berlin'])
    expect((await loadNames(join(dir, 'missing.txt'))).size).toBe(0)
  })
})

describe('data', () => {
  it('a listed name has no frequency rank after the build', async () => {
    const de = rankFn(await loadFreqList('de')), en = rankFn(await loadFreqList('en'))
    const deNames = await loadNames(resolve(DATA_DIR, 'names-de.txt')), enNames = await loadNames(resolve(DATA_DIR, 'names-en.txt'))
    for (const n of ['Anna', 'Kevin', 'Berlin', 'Maria']) { expect(deNames.has(n)).toBe(true); expect(de(n.toLowerCase())).toBeUndefined() }
    for (const n of ['Sarah', 'London', 'John']) { expect(enNames.has(n)).toBe(true); expect(en(n.toLowerCase())).toBeUndefined() }
    for (const l of [deNames, enNames]) { expect(l.size).toBeGreaterThan(300); for (const n of l) expect(n).toMatch(/^[A-ZÄÖÜ]/) }
    // ordinary nouns keep their rank: the lists strip names, not vocabulary
    for (const w of ['frau', 'haus', 'halle', 'roman']) expect(de(w)).toBeDefined()
    for (const w of ['green', 'hunter', 'bill']) expect(en(w)).toBeDefined()
  })
})
